/**
 * Upscaling: the place drawn at the render scale, then brought up to the
 * screen's own pixels by a pass of the renderer's, rather than stretched by
 * the browser.
 *
 * Still frames are drawn again a fraction of a draw pixel aside each time,
 * as still-frame TAA's are (antialias.ts), and each frame's samples are
 * weighed into a history the screen's size by how near each lands to the
 * screen pixel's centre: after TAA_FRAMES the history holds about the detail
 * Native would have drawn, for the cost of the frame at the render scale.
 * Moving frames are stretched once: bilinear (When still), or sharpened by a
 * Catmull-Rom filter held to the four nearest pixels' range so it adds no
 * halo (Always).
 *
 * The method is the general one of temporal and spatial upscalers, written
 * here from the sampling theory, not from any upscaler's code.
 */

export type UpscaleMode = "off" | "still" | "always";

/**
 * How wide each sample's weight falls off, in screen pixels: a Gaussian of
 * exp(-SAMPLE_FALLOFF * d^2). 2.25 is a standard deviation of about 0.47
 * screen pixels: as sharp as a screen pixel, without the gaps between draw
 * pixels showing while few frames are in.
 */
export const SAMPLE_FALLOFF = 4;

/**
 * The weight the first stretched frame keeps in the history: it fills the
 * screen while the first jittered samples come in, and fades as they add up
 * (16 frames at 2x bring about 20 of weight).
 */
export const STRETCH_WEIGHT = 1.5;

/**
 * While beams or particles move: how much of the history each frame keeps.
 * The history is also held to the range of the frame's own pixels round
 * each screen pixel, so what moved leaves no trail and the rest keeps about
 * ten frames' samples: at 0.75 it kept four, too few to fill each screen
 * pixel, and edges showed the draw pixels' steps.
 */
export const MOVING_DECAY = 0.9;

/**
 * Where the samples nearest a screen pixel come from, and what each weighs:
 * `q`, the screen pixel's centre in draw pixels; `jitter`, the frame's, in
 * draw pixels with rows running down (a point at p in the frame is drawn at
 * p + jitter: jitterClip's y, which is up, turned over); `perDraw`,
 * screen pixels to a draw pixel. The four draw pixels round the point each
 * sample lands nearest, as the accumulate shader reads them.
 */
export function sampleWeights(
	q: readonly [number, number],
	jitter: readonly [number, number],
	perDraw: number,
): { pixel: [number, number]; weight: number }[] {
	const bx = Math.floor(q[0] + jitter[0] - 0.5);
	const by = Math.floor(q[1] + jitter[1] - 0.5);
	const out: { pixel: [number, number]; weight: number }[] = [];
	for (let dy = 0; dy < 2; dy++)
		for (let dx = 0; dx < 2; dx++) {
			const ix = bx + dx;
			const iy = by + dy;
			// The draw pixel's centre holds the scene's point jitter behind it.
			const sx = (ix + 0.5 - jitter[0] - q[0]) * perDraw;
			const sy = (iy + 0.5 - jitter[1] - q[1]) * perDraw;
			out.push({ pixel: [ix, iy], weight: Math.exp(-SAMPLE_FALLOFF * (sx * sx + sy * sy)) });
		}
	return out;
}

/**
 * The passes in WGSL. `up.draw` is (width, height, 1 / width, 1 / height) of
 * the frame as drawn, `up.out` the same of the screen's; `up.step` is the
 * frame's jitter in draw pixels, what the history keeps of itself, and 1
 * where the history starts again from this frame.
 */
export const UPSCALE_WGSL = `
struct UpU { draw: vec4f, out: vec4f, step: vec4f };
@group(0) @binding(0) var<uniform> up: UpU;
@group(0) @binding(1) var frameTex: texture_2d<f32>;
@group(0) @binding(2) var linearS: sampler;
@group(0) @binding(3) var historyTex: texture_2d<f32>;
struct O { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> O {
	var o: O;
	let q = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	o.pos = vec4f(q * 2.0 - 1.0, 0.0, 1.0);
	o.uv = vec2f(q.x, 1.0 - q.y);
	return o;
}
fn texel(p: vec2i) -> vec3f {
	let most = vec2i(up.draw.xy) - vec2i(1);
	return textureLoad(frameTex, clamp(p, vec2i(0), most), 0).rgb;
}
@fragment fn fsStretch(i: O) -> @location(0) vec4f {
	return vec4f(textureSampleLevel(frameTex, linearS, i.uv, 0.0).rgb, 1.0);
}
// Catmull-Rom in nine bilinear reads, then held to the range of the four
// nearest draw pixels, so an edge is sharpened without a ring round it.
@fragment fn fsSharp(i: O) -> @location(0) vec4f {
	let p = i.uv * up.draw.xy;
	let c = floor(p - 0.5) + 0.5;
	let f = p - c;
	let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
	let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
	let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
	let w3 = f * f * (-0.5 + 0.5 * f);
	let w12 = w1 + w2;
	let t0 = (c - 1.0) * up.draw.zw;
	let t3 = (c + 2.0) * up.draw.zw;
	let t12 = (c + w2 / w12) * up.draw.zw;
	var s = vec3f(0.0);
	s += textureSampleLevel(frameTex, linearS, vec2f(t0.x, t0.y), 0.0).rgb * w0.x * w0.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t12.x, t0.y), 0.0).rgb * w12.x * w0.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t3.x, t0.y), 0.0).rgb * w3.x * w0.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t0.x, t12.y), 0.0).rgb * w0.x * w12.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t12.x, t12.y), 0.0).rgb * w12.x * w12.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t3.x, t12.y), 0.0).rgb * w3.x * w12.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t0.x, t3.y), 0.0).rgb * w0.x * w3.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t12.x, t3.y), 0.0).rgb * w12.x * w3.y;
	s += textureSampleLevel(frameTex, linearS, vec2f(t3.x, t3.y), 0.0).rgb * w3.x * w3.y;
	let b = vec2i(floor(p - 0.5));
	let a = texel(b);
	let bb = texel(b + vec2i(1, 0));
	let cc = texel(b + vec2i(0, 1));
	let d = texel(b + vec2i(1, 1));
	let lo = min(min(a, bb), min(cc, d));
	let hi = max(max(a, bb), max(cc, d));
	return vec4f(clamp(s, lo, hi), 1.0);
}
// This frame's samples into the history: each of the four draw pixels round
// the screen pixel, weighed by how near its sample lands (sampleWeights).
// The history holds the average so far and, in alpha, the weight behind it.
@fragment fn fsAccumulate(i: O) -> @location(0) vec4f {
	let perDraw = up.out.x * up.draw.z;
	let q = i.pos.xy * up.draw.xy * up.out.zw;
	let j = up.step.xy;
	let base = vec2i(floor(q + j - 0.5));
	var sum = vec3f(0.0);
	var weight = 0.0;
	for (var k = 0; k < 4; k++) {
		let px = base + vec2i(k & 1, k >> 1);
		let d = (vec2f(px) + 0.5 - j - q) * perDraw;
		let w = exp(-${SAMPLE_FALLOFF} * dot(d, d));
		sum += texel(px) * w;
		weight += w;
	}
	var prev = textureLoad(historyTex, vec2i(i.pos.xy), 0);
	// Moving beams or particles: the history held to this frame's range here.
	if (up.step.z < 1.0) {
		let c = vec2i(floor(q + j));
		var lo = texel(c);
		var hi = lo;
		for (var k = 0; k < 9; k++) {
			let s = texel(c + vec2i(k % 3 - 1, k / 3 - 1));
			lo = min(lo, s);
			hi = max(hi, s);
		}
		prev = vec4f(clamp(prev.rgb, lo, hi), prev.a);
	}
	if (up.step.w > 0.5) {
		prev = vec4f(textureSampleLevel(frameTex, linearS, i.uv, 0.0).rgb, ${STRETCH_WEIGHT});
	}
	let kept = prev.a * up.step.z;
	let total = kept + weight;
	return vec4f((prev.rgb * kept + sum) / max(total, 1e-6), total);
}
@fragment fn fsResolve(i: O) -> @location(0) vec4f {
	return vec4f(textureLoad(historyTex, vec2i(i.pos.xy), 0).rgb, 1.0);
}
`;
