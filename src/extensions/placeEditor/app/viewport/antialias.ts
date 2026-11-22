/**
 * Antialiasing: Off, a pass over the finished frame (FXAA, SMAA), more
 * samples a pixel (MSAA 2x, 4x, 8x), or still-frame TAA, which, once the
 * camera and the place are still, draws the frame again a fraction of a
 * pixel aside each time and averages them.
 *
 * WebGPU has 1 or 4 samples a pixel and no others; WebGL2 has as many as
 * the GPU reports. The passes are the same in either: see AA_WGSL, AA_GLSL.
 *
 * SMAA here is the reference implementation's (https://github.com/iryoku/smaa,
 * MIT; its lookup tables are in smaaTables.ts): luma edges with local
 * contrast adaptation, its searches, and its area table, without the
 * diagonal and corner passes, as its Medium preset leaves them out. FXAA is
 * the classic single pass after Timothy Lottes'.
 */

export type AntialiasMode = "off" | "fxaa" | "smaa" | "msaa2" | "msaa4" | "msaa8" | "taa";

export interface AntialiasInfo {
	mode: AntialiasMode;
	label: string;
	/** Samples a pixel the place is drawn with. */
	samples: number;
	/** The pass over the finished frame, if any. */
	pass: "none" | "fxaa" | "smaa" | "taa";
}

export const ANTIALIAS: readonly AntialiasInfo[] = [
	{ mode: "off", label: "Off", samples: 1, pass: "none" },
	{ mode: "fxaa", label: "FXAA", samples: 1, pass: "fxaa" },
	{ mode: "smaa", label: "SMAA", samples: 1, pass: "smaa" },
	{ mode: "msaa2", label: "MSAA 2×", samples: 2, pass: "none" },
	{ mode: "msaa4", label: "MSAA 4×", samples: 4, pass: "none" },
	{ mode: "msaa8", label: "MSAA 8×", samples: 8, pass: "none" },
	{ mode: "taa", label: "Still-frame TAA", samples: 1, pass: "taa" },
];

export function antialiasInfo(mode: AntialiasMode): AntialiasInfo {
	return ANTIALIAS.find((a) => a.mode === mode) ?? ANTIALIAS[0];
}

/**
 * The modes a renderer can draw: WebGPU's samples are 1 or 4; WebGL2's are
 * as many as its MAX_SAMPLES.
 */
export function antialiasModes(backend: "WebGPU" | "WebGL2", maxSamples: number): AntialiasMode[] {
	return ANTIALIAS.filter((a) =>
		a.samples === 1 ? true : backend === "WebGPU" ? a.samples === 4 : a.samples <= maxSamples,
	).map((a) => a.mode);
}

/** The mode a renderer draws for one asked for: MSAA it lacks falls to the nearest it has, then Off. */
export function antialiasFor(
	mode: AntialiasMode,
	backend: "WebGPU" | "WebGL2",
	maxSamples: number,
): AntialiasMode {
	const can = antialiasModes(backend, maxSamples);
	if (can.includes(mode)) return mode;
	const want = antialiasInfo(mode).samples;
	const msaa = ANTIALIAS.filter((a) => a.samples > 1 && can.includes(a.mode));
	const best = msaa.filter((a) => a.samples <= want).pop() ?? msaa[0];
	return best?.mode ?? "off";
}

/** Frames still-frame TAA averages once the view is still. */
export const TAA_FRAMES = 16;
/** While beams or particles move, the least share of the newest frame in the average. */
export const TAA_MOVING = 0.25;

/** The Halton sequence's `i`th value in `base`, 0 to 1. */
export function halton(i: number, base: number): number {
	let f = 1;
	let r = 0;
	for (let n = i; n > 0; n = Math.floor(n / base)) {
		f /= base;
		r += f * (n % base);
	}
	return r;
}

/**
 * Still-frame TAA's count: each still frame drawn adds one, a fraction of
 * a pixel aside, until TAA_FRAMES; anything else starts it again.
 */
export class StillFrames {
	/** Frames averaged so far, the one being drawn included: 1 is a fresh frame. */
	count = 0;
	private key = "";

	/**
	 * A frame: `still` when nothing but the average asked for it, `key` what
	 * the frame shows (the camera and canvas). Returns the jitter in pixels,
	 * and the share of this frame in the average.
	 */
	next(still: boolean, key: string, moving = false): { jitter: [number, number]; weight: number } {
		// A fresh frame when anything else changed, and when beams and
		// particles stop, so their trails leave the average.
		if (!still || key !== this.key || this.count === 0 || (this.moving && !moving)) {
			this.key = key;
			this.count = 1;
			this.moving = moving;
			return { jitter: [0, 0], weight: 1 };
		}
		this.moving = moving;
		// Beams or particles moving: a running average that never stops, the
		// newest frame at least TAA_MOVING of it, so they trail only a little.
		if (moving) {
			this.count++;
			const i = ((this.count - 2) % (TAA_FRAMES - 1)) + 1;
			return {
				jitter: [halton(i, 2) - 0.5, halton(i, 3) - 0.5],
				weight: Math.max(1 / this.count, TAA_MOVING),
			};
		}
		if (this.count >= TAA_FRAMES) return { jitter: [0, 0], weight: 0 };
		this.count++;
		const i = this.count - 1;
		return { jitter: [halton(i, 2) - 0.5, halton(i, 3) - 0.5], weight: 1 / this.count };
	}

	/** Whether another still frame would add to the average. */
	get settling(): boolean {
		return this.count > 0 && (this.moving || this.count < TAA_FRAMES);
	}

	private moving = false;

	reset(): void {
		this.count = 0;
	}
}

/**
 * A view-projection moved by `jitter` pixels of a `width` x `height` canvas:
 * clip x and y by that share of w, so every depth moves by the same pixels.
 */
export function jitterClip(
	m: Float32Array,
	jitter: readonly [number, number],
	width: number,
	height: number,
): Float32Array {
	if (jitter[0] === 0 && jitter[1] === 0) return m;
	const jx = (2 * jitter[0]) / width;
	const jy = (2 * jitter[1]) / height;
	const out = new Float32Array(m);
	for (let c = 0; c < 4; c++) {
		out[c * 4] += jx * m[c * 4 + 3];
		out[c * 4 + 1] += jy * m[c * 4 + 3];
	}
	return out;
}

/** SMAA's settings, as its reference names them. */
const SMAA = {
	threshold: "0.1",
	steps: "16.0",
	contrast: "2.0",
};

/**
 * The passes in WGSL: a triangle over the canvas, and each pass's colour.
 * `aa.rt` is (1 / width, 1 / height, width, height); `aa.taa.x` the share
 * of this frame in TAA's average.
 */
export const AA_WGSL = `
struct AaU { rt: vec4f, taa: vec4f };
@group(0) @binding(0) var<uniform> aa: AaU;
@group(0) @binding(1) var colourTex: texture_2d<f32>;
@group(0) @binding(2) var linearS: sampler;
@group(0) @binding(3) var pointS: sampler;
@group(0) @binding(4) var edgesTex: texture_2d<f32>;
@group(0) @binding(5) var blendTex: texture_2d<f32>;
@group(0) @binding(6) var areaTex: texture_2d<f32>;
@group(0) @binding(7) var searchTex: texture_2d<f32>;
@group(0) @binding(8) var historyTex: texture_2d<f32>;
struct O { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> O {
	var o: O;
	let q = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	o.pos = vec4f(q * 2.0 - 1.0, 0.0, 1.0);
	o.uv = vec2f(q.x, 1.0 - q.y);
	return o;
}
fn col(uv: vec2f) -> vec3f { return textureSampleLevel(colourTex, linearS, uv, 0.0).rgb; }
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
@fragment fn fsCopy(i: O) -> @location(0) vec4f { return textureSampleLevel(colourTex, pointS, i.uv, 0.0); }
@fragment fn fsFxaa(i: O) -> @location(0) vec4f {
	let rt = aa.rt.xy;
	let uv = i.uv;
	let nw = lum(col(uv + vec2f(-1.0, -1.0) * rt));
	let ne = lum(col(uv + vec2f(1.0, -1.0) * rt));
	let sw = lum(col(uv + vec2f(-1.0, 1.0) * rt));
	let se = lum(col(uv + vec2f(1.0, 1.0) * rt));
	let m = lum(col(uv));
	let lo = min(m, min(min(nw, ne), min(sw, se)));
	let hi = max(m, max(max(nw, ne), max(sw, se)));
	var dir = vec2f(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
	let reduce = max((nw + ne + sw + se) * 0.03125, 0.0078125);
	let rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
	dir = clamp(dir * rcp, vec2f(-8.0), vec2f(8.0)) * rt;
	let a = 0.5 * (col(uv + dir * (1.0 / 3.0 - 0.5)) + col(uv + dir * (2.0 / 3.0 - 0.5)));
	let b = a * 0.5 + 0.25 * (col(uv - dir * 0.5) + col(uv + dir * 0.5));
	let lb = lum(b);
	if (lb < lo || lb > hi) { return vec4f(a, 1.0); }
	return vec4f(b, 1.0);
}
@fragment fn fsEdges(i: O) -> @location(0) vec4f {
	let rt = aa.rt;
	let uv = i.uv;
	let l = lum(col(uv));
	let ll = lum(col(uv + vec2f(-rt.x, 0.0)));
	let lt = lum(col(uv + vec2f(0.0, -rt.y)));
	let d0 = abs(l - vec2f(ll, lt));
	var edges = step(vec2f(${SMAA.threshold}), d0);
	if (dot(edges, vec2f(1.0)) == 0.0) { discard; }
	let lr = lum(col(uv + vec2f(rt.x, 0.0)));
	let lb = lum(col(uv + vec2f(0.0, rt.y)));
	var most = max(d0, abs(l - vec2f(lr, lb)));
	let lll = lum(col(uv + vec2f(-2.0 * rt.x, 0.0)));
	let ltt = lum(col(uv + vec2f(0.0, -2.0 * rt.y)));
	most = max(most, abs(vec2f(ll, lt) - vec2f(lll, ltt)));
	let top = max(most.x, most.y);
	edges = edges * step(vec2f(top), ${SMAA.contrast} * d0);
	return vec4f(edges, 0.0, 1.0);
}
fn edgeAt(uv: vec2f) -> vec2f { return textureSampleLevel(edgesTex, linearS, uv, 0.0).rg; }
fn searchLength(e: vec2f, offset: f32) -> f32 {
	var scale = vec2f(66.0, 33.0) * vec2f(0.5, -1.0) + vec2f(-1.0, 1.0);
	var bias = vec2f(66.0, 33.0) * vec2f(offset, 1.0) + vec2f(0.5, -0.5);
	scale = scale / vec2f(64.0, 16.0);
	bias = bias / vec2f(64.0, 16.0);
	return textureSampleLevel(searchTex, pointS, scale * e + bias, 0.0).r;
}
fn searchXLeft(start: vec2f, end: f32) -> f32 {
	var uv = start;
	var e = vec2f(0.0, 1.0);
	for (var k = 0; k < 64; k++) {
		if (!(uv.x > end && e.g > 0.8281 && e.r == 0.0)) { break; }
		e = edgeAt(uv);
		uv = uv - vec2f(2.0 * aa.rt.x, 0.0);
	}
	let off = -(255.0 / 127.0) * searchLength(e, 0.0) + 3.25;
	return aa.rt.x * off + uv.x;
}
fn searchXRight(start: vec2f, end: f32) -> f32 {
	var uv = start;
	var e = vec2f(0.0, 1.0);
	for (var k = 0; k < 64; k++) {
		if (!(uv.x < end && e.g > 0.8281 && e.r == 0.0)) { break; }
		e = edgeAt(uv);
		uv = uv + vec2f(2.0 * aa.rt.x, 0.0);
	}
	let off = -(255.0 / 127.0) * searchLength(e, 0.5) + 3.25;
	return -aa.rt.x * off + uv.x;
}
fn searchYUp(start: vec2f, end: f32) -> f32 {
	var uv = start;
	var e = vec2f(1.0, 0.0);
	for (var k = 0; k < 64; k++) {
		if (!(uv.y > end && e.r > 0.8281 && e.g == 0.0)) { break; }
		e = edgeAt(uv);
		uv = uv - vec2f(0.0, 2.0 * aa.rt.y);
	}
	let off = -(255.0 / 127.0) * searchLength(e.gr, 0.0) + 3.25;
	return aa.rt.y * off + uv.y;
}
fn searchYDown(start: vec2f, end: f32) -> f32 {
	var uv = start;
	var e = vec2f(1.0, 0.0);
	for (var k = 0; k < 64; k++) {
		if (!(uv.y < end && e.r > 0.8281 && e.g == 0.0)) { break; }
		e = edgeAt(uv);
		uv = uv + vec2f(0.0, 2.0 * aa.rt.y);
	}
	let off = -(255.0 / 127.0) * searchLength(e.gr, 0.5) + 3.25;
	return -aa.rt.y * off + uv.y;
}
fn area(dist: vec2f, e1: f32, e2: f32) -> vec2f {
	var t = vec2f(16.0) * round(4.0 * vec2f(e1, e2)) + dist;
	t = (t + 0.5) / vec2f(160.0, 560.0);
	return textureSampleLevel(areaTex, linearS, t, 0.0).rg;
}
@fragment fn fsWeights(i: O) -> @location(0) vec4f {
	let rt = aa.rt;
	let uv = i.uv;
	let pix = uv * rt.zw;
	let o0 = uv.xyxy + rt.xyxy * vec4f(-0.25, -0.125, 1.25, -0.125);
	let o1 = uv.xyxy + rt.xyxy * vec4f(-0.125, -0.25, -0.125, 1.25);
	let o2 = vec4f(o0.x, o0.z, o1.y, o1.w) + vec4f(-2.0, 2.0, -2.0, 2.0) * rt.xxyy * ${SMAA.steps};
	var w = vec4f(0.0);
	let e = edgeAt(uv);
	if (e.g > 0.0) {
		let left = searchXLeft(o0.xy, o2.x);
		let e1 = edgeAt(vec2f(left, o1.y)).r;
		let right = searchXRight(o0.zw, o2.y);
		let d = abs(round(rt.zz * vec2f(left, right) - pix.xx));
		let e2 = edgeAt(vec2f(right + rt.x, o1.y)).r;
		let a = area(sqrt(d), e1, e2);
		w = vec4f(a, w.zw);
	}
	if (e.r > 0.0) {
		let up = searchYUp(o1.xy, o2.z);
		let e1 = edgeAt(vec2f(o0.x, up)).g;
		let down = searchYDown(o1.zw, o2.w);
		let d = abs(round(rt.ww * vec2f(up, down) - pix.yy));
		let e2 = edgeAt(vec2f(o0.x, down + rt.y)).g;
		let a = area(sqrt(d), e1, e2);
		w = vec4f(w.xy, a);
	}
	return w;
}
@fragment fn fsBlend(i: O) -> @location(0) vec4f {
	let rt = aa.rt;
	let uv = i.uv;
	let off = uv.xyxy + rt.xyxy * vec4f(1.0, 0.0, 0.0, 1.0);
	let here = textureSampleLevel(blendTex, linearS, uv, 0.0);
	let a = vec4f(
		textureSampleLevel(blendTex, linearS, off.xy, 0.0).a,
		textureSampleLevel(blendTex, linearS, off.zw, 0.0).g,
		here.z,
		here.x,
	);
	if (dot(a, vec4f(1.0)) < 1e-5) { return textureSampleLevel(colourTex, linearS, uv, 0.0); }
	let h = max(a.x, a.z) > max(a.y, a.w);
	var bo = vec4f(0.0, a.y, 0.0, a.w);
	var bw = a.yw;
	if (h) {
		bo = vec4f(a.x, 0.0, a.z, 0.0);
		bw = a.xz;
	}
	bw = bw / dot(bw, vec2f(1.0));
	let bc = uv.xyxy + bo * vec4f(rt.xy, -rt.xy);
	return bw.x * textureSampleLevel(colourTex, linearS, bc.xy, 0.0) + bw.y * textureSampleLevel(colourTex, linearS, bc.zw, 0.0);
}
@fragment fn fsTaa(i: O) -> @location(0) vec4f {
	let c = textureSampleLevel(colourTex, pointS, i.uv, 0.0);
	let h = textureSampleLevel(historyTex, pointS, i.uv, 0.0);
	return mix(h, c, aa.taa.x);
}
`;

/**
 * The same passes in GLSL ES 3.0, one program each: `${AA_GLSL_HEAD}` and a
 * pass's body. In texture space, where WebGL's rows run up: SMAA's searches
 * and areas do as well on the image upside down, and it is turned back.
 */
export const AA_VS = `#version 300 es
out vec2 uv;
void main() {
	vec2 q = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	uv = q;
	gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0);
}`;

const AA_GLSL_HEAD = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform vec4 rt;
uniform float taa;
uniform sampler2D colourTex;
uniform sampler2D edgesTex;
uniform sampler2D blendTex;
uniform sampler2D areaTex;
uniform sampler2D searchTex;
uniform sampler2D historyTex;
vec3 col(vec2 p) { return textureLod(colourTex, p, 0.0).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const GLSL_SEARCH = `
vec2 edgeAt(vec2 p) { return textureLod(edgesTex, p, 0.0).rg; }
float searchLength(vec2 e, float offset) {
	vec2 scale = vec2(66.0, 33.0) * vec2(0.5, -1.0) + vec2(-1.0, 1.0);
	vec2 bias = vec2(66.0, 33.0) * vec2(offset, 1.0) + vec2(0.5, -0.5);
	scale /= vec2(64.0, 16.0);
	bias /= vec2(64.0, 16.0);
	return textureLod(searchTex, scale * e + bias, 0.0).r;
}
float searchXLeft(vec2 p, float end) {
	vec2 e = vec2(0.0, 1.0);
	for (int k = 0; k < 64; k++) {
		if (!(p.x > end && e.g > 0.8281 && e.r == 0.0)) break;
		e = edgeAt(p);
		p -= vec2(2.0 * rt.x, 0.0);
	}
	return rt.x * (-(255.0 / 127.0) * searchLength(e, 0.0) + 3.25) + p.x;
}
float searchXRight(vec2 p, float end) {
	vec2 e = vec2(0.0, 1.0);
	for (int k = 0; k < 64; k++) {
		if (!(p.x < end && e.g > 0.8281 && e.r == 0.0)) break;
		e = edgeAt(p);
		p += vec2(2.0 * rt.x, 0.0);
	}
	return -rt.x * (-(255.0 / 127.0) * searchLength(e, 0.5) + 3.25) + p.x;
}
float searchYUp(vec2 p, float end) {
	vec2 e = vec2(1.0, 0.0);
	for (int k = 0; k < 64; k++) {
		if (!(p.y > end && e.r > 0.8281 && e.g == 0.0)) break;
		e = edgeAt(p);
		p -= vec2(0.0, 2.0 * rt.y);
	}
	return rt.y * (-(255.0 / 127.0) * searchLength(e.gr, 0.0) + 3.25) + p.y;
}
float searchYDown(vec2 p, float end) {
	vec2 e = vec2(1.0, 0.0);
	for (int k = 0; k < 64; k++) {
		if (!(p.y < end && e.r > 0.8281 && e.g == 0.0)) break;
		e = edgeAt(p);
		p += vec2(0.0, 2.0 * rt.y);
	}
	return -rt.y * (-(255.0 / 127.0) * searchLength(e.gr, 0.5) + 3.25) + p.y;
}
vec2 area(vec2 dist, float e1, float e2) {
	vec2 t = vec2(16.0) * round(4.0 * vec2(e1, e2)) + dist;
	t = (t + 0.5) / vec2(160.0, 560.0);
	return textureLod(areaTex, t, 0.0).rg;
}
`;

/** Each pass's fragment shader in GLSL, by name. */
export const AA_GLSL: Record<"copy" | "fxaa" | "edges" | "weights" | "blend" | "taa", string> = {
	copy: `${AA_GLSL_HEAD}
void main() { o = texelFetch(colourTex, ivec2(gl_FragCoord.xy), 0); }`,
	fxaa: `${AA_GLSL_HEAD}
void main() {
	vec2 r = rt.xy;
	float nw = lum(col(uv + vec2(-1.0, -1.0) * r));
	float ne = lum(col(uv + vec2(1.0, -1.0) * r));
	float sw = lum(col(uv + vec2(-1.0, 1.0) * r));
	float se = lum(col(uv + vec2(1.0, 1.0) * r));
	float m = lum(col(uv));
	float lo = min(m, min(min(nw, ne), min(sw, se)));
	float hi = max(m, max(max(nw, ne), max(sw, se)));
	vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
	float reduce = max((nw + ne + sw + se) * 0.03125, 0.0078125);
	float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
	dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * r;
	vec3 a = 0.5 * (col(uv + dir * (1.0 / 3.0 - 0.5)) + col(uv + dir * (2.0 / 3.0 - 0.5)));
	vec3 b = a * 0.5 + 0.25 * (col(uv - dir * 0.5) + col(uv + dir * 0.5));
	float lb = lum(b);
	o = vec4(lb < lo || lb > hi ? a : b, 1.0);
}`,
	edges: `${AA_GLSL_HEAD}
void main() {
	float l = lum(col(uv));
	float ll = lum(col(uv + vec2(-rt.x, 0.0)));
	float lt = lum(col(uv + vec2(0.0, -rt.y)));
	vec2 d0 = abs(l - vec2(ll, lt));
	vec2 edges = step(vec2(${SMAA.threshold}), d0);
	if (dot(edges, vec2(1.0)) == 0.0) discard;
	float lr = lum(col(uv + vec2(rt.x, 0.0)));
	float lb = lum(col(uv + vec2(0.0, rt.y)));
	vec2 most = max(d0, abs(l - vec2(lr, lb)));
	float lll = lum(col(uv + vec2(-2.0 * rt.x, 0.0)));
	float ltt = lum(col(uv + vec2(0.0, -2.0 * rt.y)));
	most = max(most, abs(vec2(ll, lt) - vec2(lll, ltt)));
	float top = max(most.x, most.y);
	edges *= step(vec2(top), ${SMAA.contrast} * d0);
	o = vec4(edges, 0.0, 1.0);
}`,
	weights: `${AA_GLSL_HEAD}
${GLSL_SEARCH}
void main() {
	vec2 pix = uv * rt.zw;
	vec4 o0 = uv.xyxy + rt.xyxy * vec4(-0.25, -0.125, 1.25, -0.125);
	vec4 o1 = uv.xyxy + rt.xyxy * vec4(-0.125, -0.25, -0.125, 1.25);
	vec4 o2 = vec4(o0.x, o0.z, o1.y, o1.w) + vec4(-2.0, 2.0, -2.0, 2.0) * rt.xxyy * ${SMAA.steps};
	vec4 w = vec4(0.0);
	vec2 e = edgeAt(uv);
	if (e.g > 0.0) {
		float left = searchXLeft(o0.xy, o2.x);
		float e1 = edgeAt(vec2(left, o1.y)).r;
		float right = searchXRight(o0.zw, o2.y);
		vec2 d = abs(round(rt.zz * vec2(left, right) - pix.xx));
		float e2 = edgeAt(vec2(right + rt.x, o1.y)).r;
		w.xy = area(sqrt(d), e1, e2);
	}
	if (e.r > 0.0) {
		float up = searchYUp(o1.xy, o2.z);
		float e1 = edgeAt(vec2(o0.x, up)).g;
		float down = searchYDown(o1.zw, o2.w);
		vec2 d = abs(round(rt.ww * vec2(up, down) - pix.yy));
		float e2 = edgeAt(vec2(o0.x, down + rt.y)).g;
		w.zw = area(sqrt(d), e1, e2);
	}
	o = w;
}`,
	blend: `${AA_GLSL_HEAD}
void main() {
	vec4 off = uv.xyxy + rt.xyxy * vec4(1.0, 0.0, 0.0, 1.0);
	vec4 here = textureLod(blendTex, uv, 0.0);
	vec4 a = vec4(textureLod(blendTex, off.xy, 0.0).a, textureLod(blendTex, off.zw, 0.0).g, here.z, here.x);
	if (dot(a, vec4(1.0)) < 1e-5) {
		o = textureLod(colourTex, uv, 0.0);
		return;
	}
	bool h = max(a.x, a.z) > max(a.y, a.w);
	vec4 bo = h ? vec4(a.x, 0.0, a.z, 0.0) : vec4(0.0, a.y, 0.0, a.w);
	vec2 bw = h ? a.xz : a.yw;
	bw /= dot(bw, vec2(1.0));
	vec4 bc = uv.xyxy + bo * vec4(rt.xy, -rt.xy);
	o = bw.x * textureLod(colourTex, bc.xy, 0.0) + bw.y * textureLod(colourTex, bc.zw, 0.0);
}`,
	taa: `${AA_GLSL_HEAD}
void main() {
	ivec2 p = ivec2(gl_FragCoord.xy);
	o = mix(texelFetch(historyTex, p, 0), texelFetch(colourTex, p, 0), taa);
}`,
};
