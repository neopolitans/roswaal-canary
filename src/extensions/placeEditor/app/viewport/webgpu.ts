/**
 * The viewport's renderer where WebGPU is: sized to its canvas, drawn only
 * when asked, with the selection outlined over everything.
 *
 * Nothing here is Roblox's. The shaders are written for Roswaal; where a
 * number makes a place look as it does in Studio, it was fitted to Studio's
 * screen captures of test parts, taken from the same camera as Roswaal's view
 * and compared pixel for pixel. Roblox's engine, shaders and files were never
 * read.
 */

import { type LightingParams, lightingBlock } from "../../core/lighting.js";
import { MATERIALS, materialBlock } from "../../core/materials.js";
import {
	HIGHLIGHT_LIMIT,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneHighlight,
} from "../../core/scene.js";
import { shaderHash } from "../../shaderEvent.js";
import {
	AA_WGSL,
	type AntialiasMode,
	antialiasFor,
	antialiasInfo,
	antialiasModes,
	jitterClip,
	StillFrames,
} from "./antialias.js";
import {
	boxHidden,
	boxInView,
	type Chunk,
	chunkRows,
	type DepthImage,
	depthCells,
	depthFits,
	rowRuns,
	sameView,
	sidePlanes,
	visibleRuns,
} from "./culling.js";
import { EFFECT_SHADER, GpuEffects } from "./effectsGpu.js";
import { boxEdges, featureEdges, meshFor, sceneGlows, sceneGrainy } from "./geometry.js";
import { canvasBytes, GpuMemory, trackWebGpu } from "./gpuMemory.js";
import { HANDLE_KINDS, type Handles, handleMesh } from "./handles.js";
import { invert, lookAt, multiply, perspective } from "./math.js";
import { lightGridFor } from "./prepare.js";
import {
	type Probe,
	passTimes,
	QueueClock,
	type Stage,
	type StageFrame,
	type StageSink,
} from "./profile.js";
import {
	FEATURE_BIT,
	featureBits,
	featureOn,
	passesOf,
	type RenderFeatures,
} from "./renderFeatures.js";
import { OVERDRAW_WGSL, VIEWS_WGSL } from "./renderViews.js";
import { SMAA_AREA, SMAA_SEARCH, smaaTables } from "./smaaTables.js";
import { TEXTURE_LEVELS, TEXTURE_SIZE } from "./textures.js";
import { MOVING_DECAY, UPSCALE_WGSL, type UpscaleMode } from "./upscale.js";
import {
	BLOOM_STEEP,
	BLOOM_STRENGTH,
	backToFront,
	bloomStart,
	blurSigma,
	boxBeyond,
	CASCADE_BLOCK,
	CASCADE_MAP,
	type Camera,
	CameraHeading,
	CascadeCadence,
	COST_FULL,
	cascadeBlock,
	DEFAULT_RENDER,
	type EffectSteps,
	FOV,
	FULL_QUALITY,
	fingerprint,
	GLOW_NARROW,
	GLOW_WIDE,
	type GlowShape,
	glowShape,
	glowSpread,
	gradeBlock,
	HANDLE_ALPHA,
	IMAGE_VERTEX,
	type ImageLayer,
	type ImageQuad,
	imageOrder,
	imageQuads,
	LIGHTS_FULL,
	METAL_DIFFUSE_CUT,
	METAL_SEEN,
	type MeshGeometry,
	nearSkyCentre,
	nearSkyInto,
	OVERDRAW_FULL,
	PROBE_LEVELS,
	PROBE_RADIUS,
	PROBE_ROUGH,
	PROBE_SIZE,
	PROBE_STEP,
	postActive,
	probeFaces,
	type RenderSettings,
	type RenderStats,
	renderDebug,
	SELECT,
	SELECT_WIDTH,
	SKY_BLOCK,
	SKY_CELL,
	SKY_CELLS,
	SKY_GAIN,
	SKY_LAYERS,
	SKY_LEAK,
	SKY_MAP,
	SKY_NEAR,
	SKY_NEAR_LAYER,
	SKY_OPEN,
	SKY_REACH,
	SKY_SEEN_LEAST,
	SKY_SOFT,
	SKY_VIEWS,
	SUN_CASCADES,
	SUN_GAIN,
	sceneBox,
	sceneFingerprint,
	seeThroughSets,
	sharesComposite,
	sharesView,
	skyBlock,
	splitByMesh,
	type ViewQuality,
	type ViewRenderer,
} from "./view.js";

/**
 * The WebGPU shaders' fingerprint: their text, hashed. The browser keeps what
 * it compiled by the text, so a new fingerprint is a build from nothing.
 * The small passes written where they are made are left out: the main
 * shader and its passes are where the time goes.
 */
export function shaderFingerprint(): string {
	return shaderHash(
		[SHADER, POST, AA_WGSL, UPSCALE_WGSL, OVERDRAW_WGSL, VIEWS_WGSL, EFFECT_SHADER].join(
			"\n\u0000\n",
		),
	);
}

/** What a frame is to upscaling: the first since a move, the history full, beams or particles moving. */
interface UpStep {
	fresh: boolean;
	settled: boolean;
	moving: boolean;
}

// WebGPU's flags, as the spec numbers them: TypeScript's DOM types have the
// interfaces but not these namespaces.
const BUFFER = {
	MAP_READ: 0x1,
	COPY_SRC: 0x4,
	COPY_DST: 0x8,
	INDEX: 0x10,
	VERTEX: 0x20,
	UNIFORM: 0x40,
	STORAGE: 0x80,
	QUERY_RESOLVE: 0x200,
} as const;
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const;
const TEXTURE = {
	COPY_SRC: 0x1,
	COPY_DST: 0x2,
	TEXTURE_BINDING: 0x4,
	STORAGE_BINDING: 0x8,
	RENDER_ATTACHMENT: 0x10,
} as const;
const MAP_READ = 0x1;

/**
 * The glow round what gives light of its own: blurred one way and then the
 * other at half the view's size, then added over the finished frame.
 */
const POST = /* wgsl */ `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
// One step along the blur, in the source's own units, and how strong the glow is.
@group(0) @binding(2) var<uniform> p: vec4f;
// The finished frame, for the glow to be added to.
@group(0) @binding(3) var frame: texture_2d<f32>;
// A ColorCorrectionEffect: brightness, contrast, saturation, on; then the tint.
@group(0) @binding(4) var<uniform> grade: array<vec4f, 2>;
// The glow's wide blur; tex holds its narrow one: see GLOW_NARROW and GLOW_WIDE.
@group(0) @binding(5) var wide: texture_2d<f32>;
struct Out { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> Out {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
	var o: Out;
	o.clip = vec4f(xy, 0.0, 1.0);
	o.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
	return o;
}
// The glow's source, drawn at the view's size, averaged down to half: one
// sample between four texels weighs them evenly. Its alpha is how much of
// each pixel a Decal or Texture covers, carried along for the composite.
@fragment fn fsDown(i: Out) -> @location(0) vec4f {
	return textureSampleLevel(tex, samp, i.uv, 0.0);
}
// A BloomEffect's bloom of the whole picture: where the finished frame's
// brightest channel nears full, past p.x, and Neon is not glowing there
// already (its own glow, tex, is fitted on its own), added to the glow's
// source at half size. Fitted to Studio's screen captures: a Neon logo at
// Transparency 0.3 (its face 238 of 255) does not bloom; with an additive
// Beam behind it, so the face is full, it blooms as Neon does.
@fragment fn fsBright(i: Out) -> @location(0) vec4f {
	let f = textureSampleLevel(frame, samp, i.uv, 0.0).rgb;
	let src = textureSampleLevel(tex, samp, i.uv, 0.0).rgb;
	let t = pow(f, vec3f(2.2));
	let m = max(t.r, max(t.g, t.b));
	// Past the start by its light, not its brightest channel: saturated cyan
	// or red is not as bright as white, and blooms little or not at all.
	let y = dot(t, vec3f(0.2126, 0.7152, 0.0722));
	let over = max(y - p.x, 0.0) / max(1.0 - p.x, 1e-3);
	let lit = pow(over, p.z) * p.w * (1.0 - smoothstep(0.02, 0.1, max(src.r, max(src.g, src.b))));
	return vec4f(t / max(m, 1e-4) * lit, 0.0);
}
// A Gaussian \`p.w\` texels wide along \`p.xy\`, one texel, out to three times
// that, at every texel: a fetch between two texels weighs both, so each pair
// costs one. Taps further apart than a texel left ripples round a thin source.
@fragment fn fsBlur(i: Out) -> @location(0) vec4f {
	let s = max(p.w, 0.5);
	var c = textureSampleLevel(tex, samp, i.uv, 0.0).rgb;
	var total = 1.0;
	for (var k = 1.0; k <= 3.0 * s; k += 2.0) {
		let a = exp(-k * k / (2.0 * s * s));
		let b = exp(-(k + 1.0) * (k + 1.0) / (2.0 * s * s));
		let o = p.xy * ((k * a + (k + 1.0) * b) / (a + b));
		c = c + (textureSampleLevel(tex, samp, i.uv + o, 0.0).rgb + textureSampleLevel(tex, samp, i.uv - o, 0.0).rgb) * (a + b);
		total = total + 2.0 * (a + b);
	}
	// The alpha, what images cover, is carried through unblurred.
	return vec4f(c / total, textureSampleLevel(tex, samp, i.uv, 0.0).a);
}
// The frame with the glow added in linear light: it brightens a lit face by
// what it adds, as Studio's captures show, and turns Neon's heart white where its
// channels run past full. A dither under one step of the frame's 8 bits keeps
// its long soft fall from coming out in bands.
// The heatmaps' colours, from the share each pixel holds in red: dark green
// where it is cheap, through green, yellow and red, to white; for the lighting
// heatmap, near black where no light reaches.
fn heatColour(h: f32, lights: bool) -> vec3f {
	if (lights && h < 0.01) { return vec3f(0.03, 0.03, 0.04); }
	let t = clamp(h, 0.0, 1.0);
	if (t < 0.3) { return mix(vec3f(0.03, 0.22, 0.06), vec3f(0.1, 0.72, 0.16), t / 0.3); }
	if (t < 0.55) { return mix(vec3f(0.1, 0.72, 0.16), vec3f(0.95, 0.85, 0.12), (t - 0.3) / 0.25); }
	if (t < 0.8) { return mix(vec3f(0.95, 0.85, 0.12), vec3f(0.9, 0.14, 0.06), (t - 0.55) / 0.25); }
	return mix(vec3f(0.9, 0.14, 0.06), vec3f(1.0), (t - 0.8) / 0.2);
}
${OVERDRAW_WGSL}
@fragment fn fsComposite(i: Out) -> @location(0) vec4f {
	let f = textureLoad(frame, vec2i(i.clip.xy), 0).rgb;
	// Triangle density (p.w 4): shares and shading.
	if (p.w > 3.5) { return vec4f(densityColour(f), 1.0); }
	// Overdraw (p.w 3): the frame holds counts' shares.
	if (p.w > 2.5) { return vec4f(overdrawColour(f.r), 1.0); }
	// A heatmap (p.w 1, or 2 for lights): the frame holds shares, not colours.
	if (p.w > 0.5) { return vec4f(heatColour(f.r, p.w > 1.5), 1.0); }
	// The glow spreads over Decals and Textures too: one over Neon has already
	// kept the Neon beneath it from glowing, in the glow's pass, and the author's
	// captures show the glow of the Neon left showing laid over the image round it.
	let g = (textureSample(tex, samp, i.uv).rgb * ${GLOW_NARROW.weight} + textureSample(wide, samp, i.uv).rgb * ${GLOW_WIDE.weight}) * p.z;
	var c = pow(min(pow(f, vec3f(2.2)) + g, vec3f(1.0)), vec3f(1.0 / 2.2));
	// ColorCorrection on the display values, as fitted to Studio's captures:
	// brightness adds, contrast scales round mid-grey, saturation away from
	// grey, and the tint multiplies.
	if (grade[0].w > 0.5) {
		c = clamp(c + grade[0].x, vec3f(0.0), vec3f(1.0));
		c = clamp((c - 0.5) * (1.0 + grade[0].y) + 0.5, vec3f(0.0), vec3f(1.0));
		let grey = dot(c, vec3f(0.2126, 0.7152, 0.0722));
		c = clamp(grey + (c - grey) * (1.0 + grade[0].z), vec3f(0.0), vec3f(1.0));
		c = c * grade[1].rgb;
	}
	let n = fract(52.9829189 * fract(dot(i.clip.xy, vec2f(0.06711056, 0.00583715)))) - 0.5;
	return vec4f(clamp(c + n / 255.0 * step(1.0 / 512.0, max(g.r, max(g.g, g.b))), vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

/** Antialiasing's samples a pixel, unless the view is made with another count. */
const SAMPLES = 4;

/** The pipelines built again for one set of switches: see WebGpuView.litFor. */
type LitKind = "solid" | "solidWrite" | "blended" | "glassBlended" | "lamps";
/** Where the material table starts in the frame's uniforms, in bytes: after `U`'s two matrices and fifteen vec4s. */
const UNIFORM_MATERIALS = 368;
/**
 * Half precision: the shader's colour arithmetic (the tone curve, the
 * lights' sums) in f16 where the device has shader-f16, which on Apple's
 * GPUs halves the registers it takes; f32 elsewhere, the same source.
 */
const HALF = {
	on: "enable f16;\nalias hf = f16;\nalias hv3 = vec3<f16>;\n",
	off: "alias hf = f32;\nalias hv3 = vec3f;\n",
};
const SHADER = /* wgsl */ `
struct U {
	viewProj: mat4x4f, invViewProj: mat4x4f,
	sun: vec4f, sunColour: vec4f, ambient: vec4f, zenith: vec4f, horizon: vec4f, ground: vec4f,
	camPos: vec4f, select: vec4f, fog: vec4f, fogColour: vec4f, hazeColour: vec4f,
	screen: vec4f,
	// Neon's glow: see \`glowShape\`'s gate.
	bloom: vec4f,
	// The Rendering panel: its lighting (RENDER_MODE_CODE), whether haze is
	// drawn, whether the heatmaps are linear rather than by cell, and the view
	// drawn over it: see view.ts's renderDebug.
	debug: vec4f,
	// x: the textures' mip bias, below 0 while upscaling gathers still frames,
	// so they are as sharp as the screen's pixels rather than the frame's.
	lod: vec4f,
	// The material table: two rows a material, as \`materialBlock\` writes it.
	mats: array<vec4f, ${MATERIALS.length * 3}>,
};
@group(0) @binding(0) var<uniform> u: U;
// Whether a Rendering panel switch is on: its bit in debug.y (see renderFeatures.ts),
// and in FEATURES, a pipeline's own constant. Every bit, unless a pipeline is
// built for one set of switches (see WebGpuView.litFor): then what is off is
// known when it compiles, and the code for it is left out, which on a tablet's
// GPU is most of the shader's cost even when its branches are not taken.
override FEATURES: u32 = 0xffffffffu;
fn has(bit: u32) -> bool { return (FEATURES & bit) != 0u && (u32(u.debug.y) & bit) != 0u; }
// The material textures, a layer each, tinted by the part's Color.
@group(0) @binding(1) var looks: texture_2d_array<f32>;
@group(0) @binding(2) var lookSampler: sampler;
// A Sky's six images, a layer each in SKY_FACES order, when \`screen.w\` is 1 or
// more; at 2, the sun made here is drawn over them, for a Sky that shows
// Roblox's built-in sun.
@group(0) @binding(3) var skyImages: texture_2d_array<f32>;
@group(0) @binding(4) var skySampler: sampler;
// A Sky's own sun image, when \`camPos.w\`, its half width as a tangent, is more than 0.
@group(0) @binding(5) var sunImage: texture_2d<f32>;
// The place's depth from each sky direction, and the sun's last: see skyBlock.
// Then the near maps' views, their vec4 and their box: see nearSkyInto.
// nearSet.x: how many layers on the near maps the shaders read are, 0 or
// SKY_VIEWS: their other set is drawn a few a frame, then read (nearFillStep).
struct SkyU { views: array<mat4x4f, 17>, info: vec4f, near: vec4f, nearAt: vec4f, probeAt: vec4f, nearSet: vec4f };
@group(0) @binding(6) var skyMaps: texture_depth_2d_array;
@group(0) @binding(7) var skyCompare: sampler_comparison;
@group(0) @binding(8) var<uniform> skyU: SkyU;
// 1 where map k sees p, with nothing between it and the sky; 1 off the map.
fn skySees(k: i32, p: vec3f) -> f32 { return skySeesIn(k, p, skyU.info); }
// As skySees, for a map whose texel and depth \`info\` gives.
fn skySeesIn(k: i32, p: vec3f, info: vec4f) -> f32 {
	let c = skyU.views[k] * vec4f(p, 1.0);
	// The near maps' layers are in the set being read; k keeps their view and taps.
	let layer = select(k, k + i32(skyU.nearSet.x), k >= ${SKY_NEAR_LAYER});
	let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
	if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || c.z > 1.0) { return 1.0; }
	// Four taps SKY_SOFT studs apart, turned with k, so each direction's
	// shadow is soft and the eight blend into one shade (see SKY_SOFT).
	let a = f32(k) * 0.785;
	let spread = clamp(${SKY_SOFT}.0 / max(info.x, 1e-3), 1.0, 6.0) * info.z;
	let o = vec2f(cos(a), sin(a)) * spread;
	let q = vec2f(-o.y, o.x) * 0.5;
	let depth = c.z - info.y * 0.5;
	let seen = 0.25 * (textureSampleCompareLevel(skyMaps, skyCompare, uv + o, layer, depth) + textureSampleCompareLevel(skyMaps, skyCompare, uv - o, layer, depth) + textureSampleCompareLevel(skyMaps, skyCompare, uv + q, layer, depth) + textureSampleCompareLevel(skyMaps, skyCompare, uv - q, layer, depth));
	// The sun's map shades from any height; the sky's only from parts within
	// SKY_REACH above the camera, as Studio's do. Along this map's direction
	// (straight up, or 45 degrees up), how far the ray may go before it leaves
	// that reach: a part further on is beyond it, and the sky is seen.
	if (k == ${SKY_VIEWS}) { return seen; }
	let rise = select(0.70711, 1.0, k == 0 || k == ${SKY_NEAR_LAYER});
	let along = (u.camPos.y + ${SKY_REACH}.0 - p.y) / rise;
	if (along <= 0.0) { return 1.0; }
	let within = textureSampleCompareLevel(skyMaps, skyCompare, uv, layer, c.z - along * info.y);
	return clamp(seen + 1.0 - within, 0.0, 1.0);
}
// The place's lights: five vec4s each, see sceneLights; and which reach a
// cell of the world, by its hash, see lightGrid.
@group(0) @binding(9) var<storage, read> lightData: array<vec4f>;
@group(0) @binding(10) var<storage, read> lightTable: array<vec2u>;
@group(0) @binding(11) var<storage, read> lightIndex: array<u32>;
fn lightCell(p: vec3f) -> u32 {
	let c = vec3i(floor(p / 16.0));
	let h = (bitcast<u32>(c.x) * 73856093u) ^ (bitcast<u32>(c.y) * 19349663u) ^ (bitcast<u32>(c.z) * 83492791u);
	return h & 65535u;
}
// What the place's lights add at p, on a face turned to n, before the albedo.
// Fitted to Studio's captures of each kind over a grey floor: a light keeps
// its strength out to 0.7 of its Range and is gone at it, a SpotLight's or
// SurfaceLight's cone eases from its middle to nothing at half its Angle, a
// SurfaceLight shines from the nearest point of its face, and Brightness 1
// adds 1.25, Brightness b, b to the 1.25 (sceneLights). Measured over a light
// and a dark floor at once, through this display curve, to 4.3 levels rms.
// Each light's highlight too, as a gloss of the material's: on SmoothPlastic
// Studio's is 0.55 of the light where it mirrors to the eye, four times the
// sun's, and sharper (gloss twice the material's), from the same captures.
struct Lamps { diffuse: vec3f, spec: vec3f };
fn partLights(p: vec3f, n: vec3f, v: vec3f, gloss: f32) -> Lamps {
	let b = lightTable[lightCell(p)];
	// The sums in half precision where the shader is built so: see HALF.
	var sum = hv3(0.0);
	var shine = hv3(0.0);
	for (var j = 0u; j < min(b.y, 64u); j++) {
		let k = lightIndex[b.x + j] * 5u;
		let a = lightData[k];
		let col = lightData[k + 1u];
		let d = lightData[k + 2u];
		let kind = select(select(${FEATURE_BIT.pointLights}u, ${FEATURE_BIT.spotLights}u, col.w > 0.5), ${FEATURE_BIT.surfaceLights}u, col.w > 1.5);
		if (!has(kind)) { continue; }
		var at = a.xyz;
		if (col.w > 1.5) {
			// Only in front of its face: a point on the face itself, as the part
			// the light is on, found the light's direction in rounding error.
			if (dot(p - a.xyz, d.xyz) < 0.05) { continue; }
			let u = lightData[k + 3u].xyz;
			let v = lightData[k + 4u].xyz;
			let off = p - a.xyz;
			at = a.xyz + u * clamp(dot(off, u) / max(dot(u, u), 1e-6), -1.0, 1.0) + v * clamp(dot(off, v) / max(dot(v, v), 1e-6), -1.0, 1.0);
		}
		let to = at - p;
		let dist = length(to);
		if (dist >= a.w) { continue; }
		let l = to / max(dist, 1e-4);
		var k2 = max(dot(n, l), 0.0) * (1.0 - smoothstep(0.7, 1.0, dist / a.w));
		if (col.w > 0.5) {
			let c = dot(-l, d.xyz);
			if (c <= 0.0) { continue; }
			k2 = k2 * (1.0 - smoothstep(0.0, 1.0, atan2(length(cross(-l, d.xyz)), c) / max(d.w, 1e-3)));
		}
		let lit = hv3(col.rgb * k2);
		sum = sum + lit;
		shine = shine + lit * hf(pow(max(dot(n, normalize(l + v)), 0.0), gloss));
	}
	return Lamps(vec3f(sum) * 1.25, vec3f(shine) * 1.25);
}
// The lights' light from the half-size pass (FEATURE_BIT.halfLamps): rgb
// the diffuse and the highlight, a the pass's distance from the eye.
@group(0) @binding(18) var lampLight: texture_2d<f32>;
@group(0) @binding(19) var lampShine: texture_2d<f32>;
// A pixel's lamp light: the four nearest of the half-size pass, weighted as
// bilinear filtering would, each only where its distance from the eye agrees
// with this pixel's; where none does, as at an edge, worked out here.
fn lampsAt(i: VOut, n: vec3f, v: vec3f, gloss: f32) -> Lamps {
	if (has(${FEATURE_BIT.halfLamps}u)) {
		let size = vec2i(textureDimensions(lampLight));
		let at = i.clip.xy * 0.5 - 0.5;
		let base = vec2i(floor(at));
		let f = fract(at);
		let dist = length(u.camPos.xyz - i.world);
		let near = max(0.05, dist * 0.015);
		var diffuse = vec3f(0.0);
		var shine = vec3f(0.0);
		var total = 0.0;
		for (var k = 0; k < 4; k++) {
			let o = vec2i(k & 1, k >> 1u);
			let p = clamp(base + o, vec2i(0), size - vec2i(1));
			let l = textureLoad(lampLight, p, 0);
			if (abs(l.a - dist) < near) {
				let w = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1);
				diffuse = diffuse + l.rgb * w;
				shine = shine + textureLoad(lampShine, p, 0).rgb * w;
				total = total + w;
			}
		}
		if (total > 0.01) { return Lamps(diffuse / total, shine / total); }
	}
	return partLights(i.world, n, v, gloss);
}
// The Rendering panel's heatmaps: the lights p is tested against, as
// partLights walks them; those that reach it; and those weighed by how
// strongly, by Range and cone as partLights eases them.
fn lightWork(p: vec3f, n: vec3f) -> vec3f {
	let b = lightTable[lightCell(p)];
	let tested = min(b.y, 64u);
	var reached = 0.0;
	var weight = 0.0;
	for (var j = 0u; j < tested; j++) {
		let k = lightIndex[b.x + j] * 5u;
		let a = lightData[k];
		let col = lightData[k + 1u];
		let d = lightData[k + 2u];
		let kind = select(select(${FEATURE_BIT.pointLights}u, ${FEATURE_BIT.spotLights}u, col.w > 0.5), ${FEATURE_BIT.surfaceLights}u, col.w > 1.5);
		if (!has(kind)) { continue; }
		var at = a.xyz;
		if (col.w > 1.5) {
			if (dot(p - a.xyz, d.xyz) < 0.05) { continue; }
			let su = lightData[k + 3u].xyz;
			let sv = lightData[k + 4u].xyz;
			let off = p - a.xyz;
			at = a.xyz + su * clamp(dot(off, su) / max(dot(su, su), 1e-6), -1.0, 1.0) + sv * clamp(dot(off, sv) / max(dot(sv, sv), 1e-6), -1.0, 1.0);
		}
		let to = at - p;
		let dist = length(to);
		if (dist >= a.w || dot(n, to) <= 0.0) { continue; }
		var strength = 1.0 - smoothstep(0.7, 1.0, dist / a.w);
		if (col.w > 0.5) {
			let c = dot(-to / max(dist, 1e-4), d.xyz);
			if (c <= cos(d.w)) { continue; }
			strength = strength * (1.0 - smoothstep(0.0, 1.0, atan2(length(cross(-to / max(dist, 1e-4), d.xyz)), c) / max(d.w, 1e-3)));
		}
		reached = reached + 1.0;
		weight = weight + strength;
	}
	return vec3f(f32(tested), reached, weight);
}
// The lights tested at p, blended between the eight cells nearest, for the
// linear render heatmap: one cell's list against the next is a step otherwise.
fn testedSmooth(p: vec3f) -> f32 {
	let q = p / 16.0 - 0.5;
	let c = floor(q);
	let f = q - c;
	var sum = 0.0;
	for (var k = 0u; k < 8u; k++) {
		let o = vec3f(f32(k & 1u), f32((k >> 1u) & 1u), f32((k >> 2u) & 1u));
		let w = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y) * mix(1.0 - f.z, f.z, o.z);
		sum = sum + w * f32(min(lightTable[lightCell((c + o + 0.5) * 16.0)].y, 64u));
	}
	return sum;
}
// A pixel's share of what shows white: for the render heatmap, its estimated
// work in texture reads and light tests; for the lighting heatmap, the
// lights that reach it.
fn heat(i: VOut) -> f32 {
	// Overdraw: one share for each surface drawn.
	if (u.debug.w > 0.5 && u.debug.w < 1.5) { return ${1 / OVERDRAW_FULL}; }
	let row = i.look & 255u;
	let a = u.mats[row * 3u];
	let b = u.mats[row * 3u + 1u];
	let n = normalize(i.normal);
	let blend = u.debug.z > 0.5;
	if (u.debug.x > 5.5) {
		let lw = lightWork(i.world, n);
		return select(lw.y, lw.z, blend) / ${LIGHTS_FULL}.0;
	}
	// The surface, its colour and the haze; a pattern's noise; a texture.
	var cost = 2.0;
	if (a.w > 0.0) { cost = cost + 2.0; }
	if (b.w > 0.5) { cost = cost + 1.0; }
	if (b.y > 0.5 && b.y < 1.5) { return cost / ${COST_FULL}.0; }
	// The sky's maps, two taps of eight; the sun's eight taps; the sky's
	// reflection; then each light tested, and more for each that reaches.
	cost = cost + 7.0;
	let w = lightWork(i.world, n);
	if (blend) { return (cost + testedSmooth(i.world) + w.z * 1.5) / ${COST_FULL}.0; }
	return (cost + w.x + w.y * 1.5) / ${COST_FULL}.0;
}
// How much of the sky reaches p, on a face turned to n: the share of the maps that see it.
// The lighting cells round the near maps' centre: see SKY_CELL.
@group(0) @binding(14) var skyCells: texture_3d<f32>;
@group(0) @binding(15) var skyCellSampler: sampler;
fn cellOrigin() -> vec3f { return skyU.nearAt.xyz - vec3f(${(SKY_CELLS[0] * SKY_CELL) / 2}.0, ${(SKY_CELLS[1] * SKY_CELL) / 2}.0, ${(SKY_CELLS[2] * SKY_CELL) / 2}.0); }
// How much of the sky reaches p: the maps', and at least what the lighting
// cells round it see, blended between their middles, as Studio's lighting is.
fn skyVisibility(p: vec3f, n: vec3f) -> f32 {
	if (!has(${FEATURE_BIT.leak}u) || skyU.near.w < 0.5) { return skyVisibilityMaps(p, n); }
	// Read half a cell out from the face, where the light it gathers is.
	let uvw = (p + n * ${SKY_CELL / 2}.0 - cellOrigin()) / vec3f(${SKY_CELLS[0] * SKY_CELL}.0, ${SKY_CELLS[1] * SKY_CELL}.0, ${SKY_CELLS[2] * SKY_CELL}.0);
	if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) { return skyVisibilityMaps(p, n); }
	let seen = textureSampleLevel(skyCells, skyCellSampler, vec3f(uvw.x, uvw.z, uvw.y), 0.0).r * ${SKY_LEAK.toFixed(3)};
	// Studio's sky light is its cells', blended between their middles, so a
	// beam overhead casts no sharp sky shadow: the cells' alone, then, easing
	// to the maps at the cells' edge. The maps are read only where they show:
	// sixteen taps a pixel, which inside the cells were read and thrown away.
	let edge = min(min(uvw.x, 1.0 - uvw.x), min(min(uvw.y, 1.0 - uvw.y), min(uvw.z, 1.0 - uvw.z)));
	let k = smoothstep(0.0, 0.08, edge);
	if (k >= 1.0) { return seen; }
	return mix(skyVisibilityMaps(p, n), seen, k);
}
// A lighting cell: the share of the sky its middle sees, a slice of cells a draw.
struct CellOut { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) slice: u32 };
@vertex fn vsCell(@builtin(vertex_index) i: u32, @builtin(instance_index) s: u32) -> CellOut {
	var o: CellOut;
	let q = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	o.pos = vec4f(q * 2.0 - 1.0, 0.0, 1.0);
	o.slice = s;
	return o;
}
@fragment fn fsCell(c: CellOut) -> @location(0) vec4f {
	let cell = vec3f(floor(c.pos.x), f32(c.slice), floor(c.pos.y));
	let p = cellOrigin() + (cell + 0.5) * ${SKY_CELL}.0;
	// The light a cell gathers from its neighbours as well as its middle.
	var sum = 0.0;
	for (var x = -1; x <= 1; x++) {
		for (var y = -1; y <= 1; y++) {
			for (var z = -1; z <= 1; z++) {
				sum = sum + skyVisibilityMaps(p + vec3f(f32(x), f32(y), f32(z)) * ${SKY_CELL}.0, vec3f(0.0, 1.0, 0.0));
			}
		}
	}
	return vec4f(sum / 27.0, 0.0, 0.0, 1.0);
}
// The cells as fsCell finds them, in two steps and a 27th of its samples of
// the maps: each cell's own share, once, with a cell's border round them, as
// the average reaches a cell out; then each cell the average of its own and
// its 26 neighbours', read back. Eight slices a draw, each its own target.
fn cellOwn(x: f32, y: f32, z: f32) -> vec4f {
	let p = cellOrigin() + (vec3f(x, y, z) + 0.5) * ${SKY_CELL}.0;
	return vec4f(skyVisibilityMaps(p, vec3f(0.0, 1.0, 0.0)), 0.0, 0.0, 1.0);
}
struct Cells8 { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f, @location(3) d: vec4f, @location(4) e: vec4f, @location(5) f: vec4f, @location(6) g: vec4f, @location(7) h: vec4f };
@fragment fn fsCellOwn(c: CellOut) -> Cells8 {
	// Texel (x, z, y) holds cell (x - 1, y - 1, z - 1).
	let x = floor(c.pos.x) - 1.0;
	let z = floor(c.pos.y) - 1.0;
	let y = f32(c.slice * 8u) - 1.0;
	var o: Cells8;
	o.a = cellOwn(x, y + 0.0, z);
	o.b = cellOwn(x, y + 1.0, z);
	o.c = cellOwn(x, y + 2.0, z);
	o.d = cellOwn(x, y + 3.0, z);
	o.e = cellOwn(x, y + 4.0, z);
	o.f = cellOwn(x, y + 5.0, z);
	o.g = cellOwn(x, y + 6.0, z);
	o.h = cellOwn(x, y + 7.0, z);
	return o;
}
@group(1) @binding(1) var cellsOwn: texture_3d<f32>;
fn cellAround(x: i32, y: i32, z: i32) -> vec4f {
	var sum = 0.0;
	for (var dx = 0; dx <= 2; dx++) {
		for (var dy = 0; dy <= 2; dy++) {
			for (var dz = 0; dz <= 2; dz++) {
				sum = sum + textureLoad(cellsOwn, vec3i(x + dx, z + dz, y + dy), 0).r;
			}
		}
	}
	return vec4f(sum / 27.0, 0.0, 0.0, 1.0);
}
@fragment fn fsCellAround(c: CellOut) -> Cells8 {
	let x = i32(c.pos.x);
	let z = i32(c.pos.y);
	let y = i32(c.slice * 8u);
	var o: Cells8;
	o.a = cellAround(x, y + 0, z);
	o.b = cellAround(x, y + 1, z);
	o.c = cellAround(x, y + 2, z);
	o.d = cellAround(x, y + 3, z);
	o.e = cellAround(x, y + 4, z);
	o.f = cellAround(x, y + 5, z);
	o.g = cellAround(x, y + 6, z);
	o.h = cellAround(x, y + 7, z);
	return o;
}
fn skyVisibilityMaps(p: vec3f, n: vec3f) -> f32 {
	if (skyU.info.w < 0.5 || !has(${FEATURE_BIT.skyShadows}u)) { return 1.0; }
	// Near the camera the near maps, a texel well under a wall's width; the
	// whole place's further off, blended over the box's last quarter.
	var edge = 2.0;
	if (skyU.near.w > 0.5 && has(${FEATURE_BIT.nearSky}u)) {
		let off = abs(p - skyU.nearAt.xyz);
		edge = max(off.x, max(off.y, off.z)) / skyU.nearAt.w;
	}
	// The near maps where edge < 1, the whole place's where edge >= 0.75: one
	// loop over all sixteen, so the lookup is written once rather than once a
	// loop, which a tablet's GPU pays for whether or not it is run.
	let qn = p + n * skyU.near.x * 1.5;
	let q = p + n * skyU.info.x * 1.5;
	let nearOn = edge < 1.0;
	let farOn = edge >= 0.75;
	var near = 0.0;
	var seen = 0.0;
	for (var j = 0; j < 16; j++) {
		let isNear = j < 8;
		if ((isNear && !nearOn) || (!isNear && !farOn)) { continue; }
		let s = skySeesIn(select(j - 8, ${SKY_NEAR_LAYER} + j, isNear), select(q, qn, isNear), select(skyU.info, skyU.near, isNear));
		if (isNear) { near = near + s; } else { seen = seen + s; }
	}
	near = near / 8.0;
	seen = seen / 8.0;
	if (edge < 0.75) { return near; }
	if (edge >= 1.0) { return seen; }
	return mix(near, seen, smoothstep(0.75, 1.0, edge));
}
// Whether the sun reaches p: its own map, four taps a texel apart.
// The sun's shadow near the camera, sharp close by: see cascadeBlock.
struct CascU { views: array<mat4x4f, 3>, far: vec4f, texel: vec4f };
@group(0) @binding(12) var sunMaps: texture_depth_2d_array;
@group(0) @binding(13) var<uniform> cascU: CascU;
// The first four round the edge, one each way, so they can stand for all eight (see cascadeSees).
var<private> POISSON: array<vec2f, 8> = array<vec2f, 8>(
	vec2f(-0.840, -0.074), vec2f(0.962, -0.195), vec2f(-0.203, 0.621), vec2f(0.185, -0.893),
	vec2f(-0.326, -0.406), vec2f(-0.696, 0.457), vec2f(0.473, -0.480), vec2f(0.519, 0.767));
// Cascade k's share of the sun reaching p: eight taps over ShadowSoftness's width,
// or four where those four agree, as they do wherever p is plainly in sun or shade.
fn cascadeSees(k: i32, p: vec3f, n: vec3f) -> f32 {
	let texel = cascU.texel[k];
	// Pushed out along the normal by a texel or so, less where the sun is
	// square on, so a shadow cast from a few studs away is not lost.
	let l = normalize(u.sun.xyz);
	let slope = sqrt(max(1.0 - dot(n, l) * dot(n, l), 0.0));
	let c = cascU.views[k] * vec4f(p + n * texel * (0.5 + slope), 1.0);
	let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
	// ShadowSoftness's width, and never under a texel and a half, so the
	// map's texels blur into a straight edge rather than steps.
	let r = max(cascU.far.w / texel, 1.5) / f32(textureDimensions(sunMaps).x);
	var seen = 0.0;
	for (var j = 0; j < 4; j++) {
		seen = seen + textureSampleCompareLevel(sunMaps, skyCompare, uv + POISSON[j] * r, k, c.z - 0.00005);
	}
	// Only a shadow's soft edge takes the other four.
	if (seen < 0.001 || seen > 3.999) { return seen / 4.0; }
	for (var j = 4; j < 8; j++) {
		seen = seen + textureSampleCompareLevel(sunMaps, skyCompare, uv + POISSON[j] * r, k, c.z - 0.00005);
	}
	return seen / 8.0;
}
fn sunSees(p: vec3f, n: vec3f) -> f32 {
	if (skyU.info.w < 0.5 || cascU.texel.w > 1.5) { return 1.0; }
	if (cascU.texel.w > 0.5) {
		let d = length(p - u.camPos.xyz);
		// One call, the cascade chosen first: written once, not once a cascade,
		// which a tablet's GPU pays for in every pixel whichever is taken.
		if (d < cascU.far.z) {
			let k = select(select(2, 1, d < cascU.far.y), 0, d < cascU.far.x);
			return cascadeSees(k, p, n);
		}
	}
	if (!has(${FEATURE_BIT.farShadows}u)) { return 1.0; }
	let q = p + n * skyU.info.x * 1.5;
	let s = skyU.info.x * 0.5;
	// The four corners, (s, s), (-s, s), (s, -s) and (-s, -s), in a loop for the same reason.
	var sum = 0.0;
	for (var j = 0; j < 4; j++) {
		sum = sum + skySees(8, q + vec3f(select(-s, s, (j & 1) == 0), 0.0, select(-s, s, j < 2)));
	}
	return 0.25 * sum;
}
struct VIn {
	@location(0) pos: vec3f, @location(1) nrm: vec3f,
	@location(2) c0: vec3f, @location(3) c1: vec3f, @location(4) c2: vec3f, @location(5) p: vec3f,
	@location(6) colour: vec4f, @location(7) id: u32, @location(8) look: u32,
};
struct VOut {
	// Invariant: the depth pre-pass and the lit pass must land on the very same depths.
	@builtin(position) @invariant clip: vec4f, @location(0) colour: vec3f, @location(1) @interpolate(flat) id: u32,
	@location(2) world: vec3f, @location(3) normal: vec3f,
	@location(4) alpha: f32, @location(5) @interpolate(flat) look: u32,
	@location(6) local: vec3f, @location(7) lnormal: vec3f,
};
@vertex fn vs(v: VIn) -> VOut { return shade(v); }
// A face of the reflection cube: the parts as the camera's view lights them,
// seen from the cube's middle. See drawReflections.
struct ReflU { viewProj: mat4x4f };
@group(1) @binding(0) var<uniform> reflU: ReflU;
@vertex fn vsRefl(v: VIn) -> VOut {
	var o = shade(v);
	o.clip = reflU.viewProj * vec4f(o.world, 1.0);
	return o;
}
@fragment fn fsRefl(i: VOut) -> @location(0) vec4f { return vec4f(surface(i).rgb, 1.0); }
// The half-size lamp pass: each solid part's lights at half the frame's
// pixels, as surface() works them out, and its distance from the eye.
struct LampOut { @location(0) light: vec4f, @location(1) shine: vec4f };
@fragment fn fsLamps(i: VOut) -> LampOut {
	let a = u.mats[(i.look & 255u) * 3u];
	let faceN = normalize(cross(dpdx(i.world), dpdy(i.world)));
	var n = normalize(i.normal);
	if (!has(${FEATURE_BIT.smooth}u)) { n = select(-faceN, faceN, dot(faceN, n) >= 0.0); }
	let toEye = u.camPos.xyz - i.world;
	let d = length(toEye);
	let l = partLights(i.world, n, toEye / max(d, 1e-4), a.y * 2.0);
	var o: LampOut;
	o.light = vec4f(l.diffuse, d);
	o.shine = vec4f(l.spec, 1.0);
	return o;
}
// Highlight instances' mask: each pixel the Highlight of the part there, 1 to
// 31; 0, none. hlRows, by part row: its Highlight, 256 for a part with a
// Transparency, 512 for DepthMode AlwaysOnTop. hl.info.x: parts with a
// Transparency drawn too (Roswaal's switch). See WebGpuView.drawHighlights.
struct HlSlot { fill: vec4f, outline: vec4f };
struct HlU { slots: array<HlSlot, 32>, info: vec4f };
@group(1) @binding(2) var<storage, read> hlRows: array<u32>;
@group(1) @binding(3) var<uniform> hl: HlU;
override HL_ON_TOP: bool = false;
struct MOut { @builtin(position) @invariant clip: vec4f, @location(0) @interpolate(flat) slot: u32 };
@vertex fn vsMask(v: VIn) -> MOut {
	let s = shade(v);
	var r = 0u;
	if (v.id < arrayLength(&hlRows)) { r = hlRows[v.id]; }
	var o: MOut;
	o.slot = r & 255u;
	o.clip = s.clip;
	// Not this pass's: off the view, so nothing of it is drawn.
	if (o.slot == 0u || ((r & 256u) != 0u && hl.info.x < 0.5) || ((r & 512u) != 0u) != HL_ON_TOP) {
		o.clip = vec4f(2.0, 2.0, 2.0, 1.0);
	}
	return o;
}
@fragment fn fsMask(i: MOut) -> @location(0) u32 { return i.slot; }
// The parts' transform, shared by the parts and the handles: an entry point cannot call another.
fn shade(v: VIn) -> VOut {
	let m = mat3x3f(v.c0, v.c1, v.c2);
	let s = vec3f(length(v.c0), length(v.c1), length(v.c2));
	var o: VOut;
	o.world = m * v.pos + v.p;
	o.clip = u.viewProj * vec4f(o.world, 1.0);
	o.normal = normalize(m * (v.nrm / max(s * s, vec3f(1e-6))));
	o.colour = pow(v.colour.rgb, vec3f(2.2));
	o.id = v.id;
	o.alpha = v.colour.a;
	o.look = v.look;
	// Where on the part, in studs from its middle, for its material's pattern.
	o.local = v.pos * s;
	o.lnormal = v.nrm;
	return o;
}
// Scene reflections: the place round the camera, its alpha 0 where nothing
// was drawn and the sky shows. A blank cube while the cube itself is drawn.
@group(0) @binding(16) var reflCube: texture_cube<f32>;
@group(0) @binding(17) var reflSampler: sampler;
// What a reflection sees in a direction: the sky as far as it reaches p, and
// over it the place round the camera, where scene reflections are on, as
// blurred as \`lod\` says. The cube's alpha is how much of its texel the place
// covers, and its colour is the place's share of it, so the sky shows through
// the rest.
// The cube is read where the ray from p meets a sphere round where it was
// drawn from (skyU.probeAt, near the camera), not along the ray's direction
// alone, so a part reflects what is beside it rather than what the camera
// would see that way (see PROBE_RADIUS).
fn envSees(p: vec3f, dir: vec3f, vis: f32, lod: f32) -> vec3f {
	let s = skyLight(dir) * max(vis, 0.05);
	if (!has(${FEATURE_BIT.sceneReflect}u)) { return s; }
	let e = sceneSees(p, dir, lod);
	return s * (1.0 - e.a) + e.rgb;
}
// The place in the cube from p along dir: its light, already weighted by how
// much of the texel it covers, and that cover.
fn sceneSees(p: vec3f, dir: vec3f, lod: f32) -> vec4f {
	let o = p - skyU.probeAt.xyz;
	let radius = max(${PROBE_RADIUS}.0, length(o) + 50.0);
	let b = dot(o, dir);
	let t = -b + sqrt(max(b * b - dot(o, o) + radius * radius, 0.0));
	return textureSampleLevel(reflCube, reflSampler, o + dir * t, lod);
}
// The sky in a direction: blue overhead, the haze colour at the horizon,
// darker below it, and the sun's disc and glow.
fn sky(dir: vec3f) -> vec3f {
	var c: vec3f;
	if (dir.y >= 0.0) {
		c = mix(u.zenith.rgb, u.horizon.rgb, clamp(1.0 - dir.y / 0.14, 0.0, 1.0));
	} else {
		c = mix(u.horizon.rgb, u.ground.rgb, min(1.0, -dir.y * 5.0));
	}
	// The sun made here, unless the Sky has a sun image of its own.
	return c + select(sunLight(dir), vec3f(0.0), u.camPos.w > 0.0);
}
// A Sky's own sun image in a direction, in linear light: centred on the sun,
// SunAngularSize across, and upright to the sky, as Studio's captures show it.
// Its light is added after the display curve, so its colours stay its own.
fn sunImageLight(dir: vec3f) -> vec3f {
	let half = u.camPos.w;
	let s = u.sun.xyz;
	let k = dot(dir, s);
	var across = cross(s, vec3f(0.0, 1.0, 0.0));
	if (length(across) < 1e-4) { across = vec3f(1.0, 0.0, 0.0); }
	let right = normalize(across);
	let up = cross(right, s);
	let p = dir / max(k, 1e-4) - s;
	// Its left on the sky's right, as Studio's captures show it.
	let uv = vec2f(-dot(p, right), dot(p, up)) / max(half, 1e-4);
	let t = textureSampleLevel(sunImage, skySampler, vec2f(uv.x * 0.5 + 0.5, 0.5 - uv.y * 0.5), 0.0);
	let inside = half > 0.0 && k > 0.0 && max(abs(uv.x), abs(uv.y)) < 1.0;
	return select(vec3f(0.0), pow(t.rgb, vec3f(2.2)) * t.a * ${SUN_GAIN.toFixed(3)} * u.zenith.w, inside);
}
// The sun's disc and the glow round it, in a direction.
fn sunLight(dir: vec3f) -> vec3f {
	let a = dot(dir, u.sun.xyz);
	let disc = smoothstep(u.sunColour.w - 0.00002, u.sunColour.w + 0.00008, a);
	let glow = pow(max(a, 0.0), 48.0) * (0.18 + u.ground.w * 0.6) + pow(max(a, 0.0), 6.0) * 0.06;
	return u.sunColour.rgb * (disc * 4.0 + glow);
}
// Stephen Hill's fit of the ACES curve, as BakingLab (MIT) has it.
fn aces(colour: vec3f) -> vec3f {
	// In half precision where the shader is built so (hf, hv3: see HALF).
	let i = mat3x3<hf>(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
	let o = mat3x3<hf>(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
	let v = i * hv3(min(colour, vec3f(60000.0)));
	let a = v * (v + 0.0245786) - 0.000090537;
	let b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return vec3f(clamp(o * (a / b), hv3(0.0), hv3(1.0)));
}
// No lift: in Studio's captures of a dark room its blacks reach 0.
fn display(c: vec3f) -> vec3f {
	let t = aces(c * u.zenith.w);
	return pow(t, vec3f(1.0 / 2.2));
}
// The air between a surface and the camera: Lighting's fog, or the
// Atmosphere's haze, thinner with height as air is.
fn air(c: vec3f, d: f32, y: f32) -> vec3f {
	if (u.fog.z > 0.5) {
		return mix(c, u.fogColour.rgb, clamp((d - u.fog.x) / max(u.fog.y - u.fog.x, 1.0), 0.0, 1.0));
	}
	let thin = exp(-max(y, 0.0) * 0.004);
	return mix(c, u.hazeColour.rgb, 1.0 - exp(-d * u.horizon.w * thin));
}
// Roswaal's own hash, for a random-looking value per cell of a pattern. The
// shifts and multipliers were found by \`scripts/find-hash.mjs\`, which says how.
// Every caller passes whole numbers: a cell's corner, after \`floor\`.
fn mixBits(v: u32) -> u32 {
	var x = v;
	x ^= x >> 18u;
	x *= 0xe71d6283u;
	x ^= x >> 15u;
	x *= 0x1f04730du;
	x ^= x >> 18u;
	return x;
}
// Its top 24 bits as a number from 0 up to 1, which a float holds exactly.
fn toUnit(h: u32) -> f32 { return f32(h >> 8u) / 16777216.0; }
fn cellBits(p: vec2f) -> u32 { let q = bitcast<vec2u>(vec2i(p)); return mixBits(q.x ^ mixBits(q.y)); }
fn hash1(p: vec2f) -> f32 { return toUnit(cellBits(p)); }
fn hash2(p: vec2f) -> vec2f { let h = cellBits(p); return vec2f(toUnit(h), toUnit(mixBits(h))); }
fn noise2(p: vec2f) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let w = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash1(i), hash1(i + vec2f(1.0, 0.0)), w.x), mix(hash1(i + vec2f(0.0, 1.0)), hash1(i + vec2f(1.0, 1.0)), w.x), w.y);
}
// How far a point is from the nearest edge between cells, and its cell's own
// random value: stones, pebbles and cracks.
fn cells(p: vec2f) -> vec2f {
	let i = floor(p);
	let f = fract(p);
	var d1 = 8.0;
	var d2 = 8.0;
	var id = 0.0;
	for (var y = -1; y <= 1; y++) {
		for (var x = -1; x <= 1; x++) {
			let g = vec2f(f32(x), f32(y));
			let r = g + hash2(i + g) - f;
			let d = dot(r, r);
			if (d < d1) { d2 = d1; d1 = d; id = hash1(i + g); } else if (d < d2) { d2 = d; }
		}
	}
	return vec2f(sqrt(d2) - sqrt(d1), id);
}
fn edgeOf(v: f32) -> f32 { return min(fract(v), 1.0 - fract(v)); }
// Neon as measured from Studio's captures of test parts. Its face, on the
// sRGB scale, is 2.74 times its
// colour less 0.545: a dark Neon is darker than its colour, and a bright one
// runs past full, which is what glows. Transparency dims it a little.
fn neonLevel(colour: vec3f, alpha: f32) -> vec3f {
	let t = 1.0 - alpha;
	return 2.74 * pow(colour, vec3f(1.0 / 2.2)) * (1.0 - 0.2 * t * sqrt(t)) - 0.545;
}
// A see-through Neon part is more opaque than its Transparency says: at 0.5
// it draws at an opacity of 0.81, at 0.8 at 0.47, blended as the frame is.
fn neonAlpha(alpha: f32) -> f32 {
	let t = 1.0 - alpha;
	return pow(1.0 - t * t, 0.75);
}
// A material's pattern at a point on its face, in studs: x scales its colour,
// y its highlight, z is light of its own.
fn pattern(kind: u32, uv: vec2f, size: f32) -> vec3f {
	switch kind {
		case 1u: {
			let g = noise2(uv * vec2f(0.5, 4.0) / size);
			let s = sin(uv.y * 10.0 / size + g * 7.0) * 0.5 + 0.5;
			return vec3f(0.86 + 0.24 * s, 1.0, 0.0);
		}
		case 2u: {
			let row = floor(uv.y);
			let x = uv.x + hash1(vec2f(row, 7.0)) * 4.0;
			let line = 1.0 - smoothstep(0.02, 0.05, min(edgeOf(uv.y), edgeOf(x / 4.0) * 4.0));
			let g = noise2(vec2f(x * 0.5, uv.y * 4.0) / size);
			let s = sin(uv.y * 14.0 + g * 6.0) * 0.5 + 0.5;
			let tint = 0.9 + 0.18 * hash1(vec2f(row, floor(x / 4.0)));
			return vec3f(tint * (0.88 + 0.16 * s) * (1.0 - 0.5 * line), 1.0 - line, 0.0);
		}
		case 3u: {
			let row = floor(uv.y);
			let x = uv.x / 2.0 + 0.5 * (row - 2.0 * floor(row / 2.0));
			let mortar = 1.0 - smoothstep(0.05, 0.09, min(edgeOf(x) * 2.0, edgeOf(uv.y)));
			let tint = 0.86 + 0.24 * hash1(vec2f(floor(x), row));
			return vec3f(mix(tint, 1.3, mortar), 1.0 - 0.7 * mortar, 0.0);
		}
		case 4u, 5u: {
			let c = cells(uv * select(0.9, 2.6, kind == 5u) / size);
			let edge = 1.0 - smoothstep(0.03, 0.14, c.x);
			return vec3f((0.82 + 0.3 * c.y) * (1.0 - 0.55 * edge), 1.0 - edge, 0.0);
		}
		case 6u: {
			let r = vec2f(uv.x + uv.y, uv.x - uv.y) * 1.2;
			let q = abs(fract(r) - 0.5);
			let bump = 1.0 - smoothstep(0.12, 0.18, q.x * 0.45 + q.y);
			return vec3f(0.9 + 0.22 * bump, 1.0 + 0.8 * bump, 0.0);
		}
		case 7u: {
			let t = uv / 2.0;
			let grout = 1.0 - smoothstep(0.03, 0.06, min(edgeOf(t.x), edgeOf(t.y)) * 2.0);
			let tint = 0.94 + 0.1 * hash1(floor(t));
			return vec3f(mix(tint, 0.68, grout), 1.0 - grout, 0.0);
		}
		case 8u: {
			let row = floor(uv.y * 1.5);
			let x = uv.x + 0.5 * (row - 2.0 * floor(row / 2.0));
			let line = 1.0 - smoothstep(0.02, 0.05, edgeOf(x));
			let tint = 0.92 + 0.12 * hash1(vec2f(floor(x), row));
			return vec3f((0.72 + 0.34 * fract(uv.y * 1.5)) * tint * (1.0 - 0.35 * line), 1.0, 0.0);
		}
		case 9u: {
			let w = sin(uv.x * 30.0 / size) * sin(uv.y * 30.0 / size);
			return vec3f(0.93 + 0.1 * w, 1.0, 0.0);
		}
		case 10u: {
			let n = noise2(uv * 4.0 / size) * 0.5 + hash1(floor(uv * 20.0 / size)) * 0.5;
			return vec3f(0.86 + 0.26 * n, 1.0, 0.0);
		}
		case 11u: {
			let n = noise2(uv * 0.7 / size) * 0.6 + noise2(uv * 3.0 / size) * 0.4;
			return vec3f(0.78 + 0.4 * n, 1.0, 0.0);
		}
		case 12u: {
			let n = noise2(uv * 0.6 / size);
			let s = hash1(floor(uv * 28.0 / size));
			return vec3f((0.82 + 0.26 * n) * (0.86 + 0.26 * s), 1.0, 0.0);
		}
		case 13u: {
			let n = noise2(uv * 1.1 / size) * 0.7 + noise2(uv * 5.0 / size) * 0.3;
			let b = smoothstep(0.42, 0.62, n);
			return vec3f(1.0 - 0.32 * b, 1.0 - 0.6 * b, 0.0);
		}
		case 14u: {
			let c = cells(uv * 0.8 / size);
			let crack = 1.0 - smoothstep(0.02, 0.08, c.x);
			return vec3f((0.4 + 0.25 * c.y) * (1.0 - crack), 1.0 - crack, crack);
		}
		case 15u: {
			let n = noise2(uv * 0.5 / size) * 3.0 + noise2(uv * 2.0 / size);
			let vein = 1.0 - smoothstep(0.0, 0.1, abs(sin((uv.x + uv.y) * 0.7 + n * 2.0)));
			return vec3f(1.0 - 0.35 * vein, 1.0, 0.0);
		}
		default: { return vec3f(1.0, 1.0, 0.0); }
	}
}
// A face's own two directions, in studs on the part: the plane square to the
// way it faces on the unit shape.
fn faceUv(local: vec3f, ln: vec3f) -> vec2f {
	let a = abs(ln);
	if (a.y >= a.x && a.y >= a.z) { return local.xz; }
	if (a.x >= a.z) { return local.zy; }
	return local.xy;
}
// CrackedLava's light, where its cracks are: deep red at their edges, orange at their hearts.
const LAVA = vec3f(1.0, 0.1, 0.02);
const LAVA_HOT = vec3f(1.0, 0.45, 0.1);
fn lavaLight(m: f32) -> vec3f { return mix(LAVA, LAVA_HOT, m * m) * m; }
// A cheap value noise, for a material's grain.
fn hash3(p: vec3f) -> f32 { let q = bitcast<vec3u>(vec3i(p)); return toUnit(mixBits(q.x ^ mixBits(q.y ^ mixBits(q.z)))); }
fn noise3(p: vec3f) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let w = f * f * (3.0 - 2.0 * f);
	let x0 = mix(mix(hash3(i), hash3(i + vec3f(1.0, 0.0, 0.0)), w.x), mix(hash3(i + vec3f(0.0, 1.0, 0.0)), hash3(i + vec3f(1.0, 1.0, 0.0)), w.x), w.y);
	let x1 = mix(mix(hash3(i + vec3f(0.0, 0.0, 1.0)), hash3(i + vec3f(1.0, 0.0, 1.0)), w.x), mix(hash3(i + vec3f(0.0, 1.0, 1.0)), hash3(i + vec3f(1.0, 1.0, 1.0)), w.x), w.y);
	return mix(x0, x1, w.z);
}
// A surface in its material: the sun's light and highlight, the sky's fill, a
// metal's tinted highlight, the material's grain, what it reflects, and the
// air in front of it. Neon is lit by neonLevel, below; ForceField glows at
// its rim.
fn surface(i: VOut) -> vec4f {
	let row = i.look & 255u;
	let shine = f32((i.look >> 8u) & 255u) / 255.0;
	let a = u.mats[row * 3u];
	let b = u.mats[row * 3u + 1u];
	let tex = u.mats[row * 3u + 2u];
	// Smooth shading off: each triangle's own face, turned the way its normal is.
	let faceN = normalize(cross(dpdx(i.world), dpdy(i.world)));
	var n = normalize(i.normal);
	if (!has(${FEATURE_BIT.smooth}u)) { n = select(-faceN, faceN, dot(faceN, n) >= 0.0); }
	let toEye = u.camPos.xyz - i.world;
	let d = length(toEye);
	let v = toEye / max(d, 1e-4);
	var albedo = i.colour;
	if (a.w > 0.0 && has(${FEATURE_BIT.grain}u)) {
		let g = noise3(i.local / b.x) * 0.65 + noise3(i.local / b.x * 3.1) * 0.35;
		albedo = albedo * (1.0 + a.w * (g - 0.5) * 2.0);
	}
	// A texture once its layer has loaded; the material's own pattern until then.
	let uv = faceUv(i.local, i.lnormal);
	let layer = i32(b.w) - 1;
	let look = textureSampleBias(looks, lookSampler, uv / tex.x, max(layer, 0), u.lod.x);
	// The pattern only where something reads it: its x and y for grain, its z
	// for CrackedLava's light. Left out of a place with neither.
	var pat = vec3f(1.0, 1.0, 0.0);
	if (has(${FEATURE_BIT.grain}u) || has(${FEATURE_BIT.lava}u)) {
		pat = pattern(u32(b.z), uv, b.x);
		if (!has(${FEATURE_BIT.grain}u)) { pat = vec3f(1.0, 1.0, pat.z); }
	}
	if (layer >= 0 && has(${FEATURE_BIT.textures}u)) {
		pat = vec3f(mix(1.0, look.r * 2.0, tex.y), 1.0, tex.z * look.g);
	}
	albedo = albedo * pat.x;
	var alpha = i.alpha;
	var c: vec3f;
	if (b.y > 0.5 && b.y < 1.5 && has(${FEATURE_BIT.neon}u)) {
		c = pow(clamp(neonLevel(albedo, i.alpha), vec3f(0.0), vec3f(1.0)), vec3f(2.2));
		alpha = neonAlpha(i.alpha);
	} else if (b.y > 2.5) {
		let edge = 1.0 - abs(dot(n, v));
		let rim = edge * edge;
		c = albedo * (0.6 + rim * 2.5);
		alpha = alpha * clamp(0.15 + rim * 0.85, 0.0, 1.0);
	} else if (has(${FEATURE_BIT.unlit}u)) {
		// No light at all: the colour and material as they are.
		c = albedo;
	} else {
		let l = u.sun.xyz;
		let ndl = max(dot(n, l), 0.0);
		let h = normalize(l + v);
		var spec = 0.0;
		if (has(${FEATURE_BIT.highlights}u)) { spec = pow(max(dot(n, h), 0.0), a.y) * a.x * pat.y; }
		// Ambient everywhere, OutdoorAmbient and the sky as far as the sky
		// reaches, and the sun where it does. A switch off leaves its light out
		// of the lighting (renderFeatures.ts's litFor) or its bit unset.
		let vis = skyVisibility(i.world, n);
		// Turned from the sun, its light is nothing whatever the shadow: not looked up.
		var sunK = 0.0;
		if (ndl > 0.0) { sunK = sunSees(i.world, n); }
		let lit = u.sunColour.rgb * ndl * sunK;
		let fill = (vec3f(u.fog.w, u.fogColour.w, u.hazeColour.w) + u.ambient.rgb * max(vis, ${SKY_SEEN_LEAST})) * (0.9 + 0.1 * n.y);
		var lamps = Lamps(vec3f(0.0), vec3f(0.0));
		if (has(${FEATURE_BIT.pointLights}u | ${FEATURE_BIT.spotLights}u | ${FEATURE_BIT.surfaceLights}u)) { lamps = lampsAt(i, n, v, a.y * 2.0); }
		let lampShine = select(0.0, 1.0, has(${FEATURE_BIT.lightHighlights}u));
		c = albedo * (1.0 - a.z * ${METAL_DIFFUSE_CUT}) * (fill + lit + lamps.diffuse) + mix(vec3f(1.0), albedo, a.z) * (spec * lit + lamps.spec * a.x * pat.y * 4.6 * lampShine);
		if (has(${FEATURE_BIT.reflections}u)) {
			let r = reflect(-v, n);
			let seen = envSees(i.world, r, vis, 0.0);
			// A metal shows what is round it, blurred, in its own colour.
			if (a.z > 0.5) { c = c + envSees(i.world, r, vis, ${PROBE_ROUGH.toFixed(1)}) * albedo * a.x * ${METAL_SEEN.toFixed(2)}; }
			// Reflectance, and glass's own, stronger at a glancing angle.
			var mirror = shine;
			if (b.y > 1.5) { let edge = 1.0 - abs(dot(n, v)); mirror = max(mirror, 0.2 + 0.5 * edge * edge * edge); }
			c = mix(c, seen, mirror);
		}
		if (has(${FEATURE_BIT.lava}u)) { c = c + lavaLight(pat.z) * 2.2; }
	}
	c = air(c, d, i.world.y);
	return vec4f(c, alpha);
}
// What gives light of its own, for the glow round it, in linear light. Neon
// as measured from Studio's captures: each channel by how far its light runs
// past 0.3, easing off, once its brightest channel nears full; so a dark
// Neon, as dark blue or mid grey, does not glow, and olive glows greener than
// itself. A see-through part glows less the more see-through it
// is, and not at all from a Transparency of 0.3. CrackedLava's cracks glow
// a little.
fn glowSource(i: VOut) -> vec3f {
	let row = i.look & 255u;
	let b = u.mats[row * 3u + 1u];
	let tex = u.mats[row * 3u + 2u];
	let uv = faceUv(i.local, i.lnormal);
	let layer = i32(b.w) - 1;
	// Sampled before any branch: WGSL samples only in uniform control flow.
	let look = textureSampleBias(looks, lookSampler, uv / tex.x, max(layer, 0), u.lod.x);
	if (b.y > 0.5 && b.y < 1.5) {
		if (!has(${FEATURE_BIT.neonGlow}u)) { return vec3f(0.0); }
		let e = pow(max(neonLevel(i.colour, i.alpha), vec3f(0.0)), vec3f(2.2));
		let most = max(e.r, max(e.g, e.b));
		// Gone from a Transparency of 0.3, easing as Studio's screen captures of a
		// Neon part at 0.1, 0.2 and 0.25 show: 0.82, 0.5 and 0.29 of its glow.
		let fade = pow(max(1.0 - (1.0 - i.alpha) / u.bloom.z, 0.0), 1.1);
		return (1.0 - exp(-max(e - u.bloom.y, vec3f(0.0)))) * smoothstep(u.bloom.x, u.bloom.x + 0.3, most) * fade;
	}
	if (!has(${FEATURE_BIT.lava}u)) { return vec3f(0.0); }
	if (tex.z > 0.5 && layer >= 0) { return min(lavaLight(look.g), vec3f(1.0)) * 0.2; }
	if (u32(b.z) == 14u) { return min(lavaLight(pattern(14u, uv, b.x).z), vec3f(1.0)) * 0.2; }
	return vec3f(0.0);
}
// Its alpha, 0, clears what images cover: a part in front of an image hides it.
@fragment fn fsGlow(i: VOut) -> @location(0) vec4f { return vec4f(glowSource(i), 0.0); }
// A see-through part over what glows behind it, as it lies over it in the
// frame. A see-through Neon part's own glow already fades with it.
@fragment fn fsGlowSeen(i: VOut) -> @location(0) vec4f {
	let shade = u.mats[(i.look & 255u) * 3u + 1u].y;
	let neon = shade > 0.5 && shade < 1.5;
	let a = select(i.alpha, neonAlpha(i.alpha), neon);
	return vec4f(glowSource(i) * select(i.alpha, 1.0, neon), a);
}
// Neon past the display curve, each channel capped: in Studio's captures, red
// Neon stays pure red, and dark blue comes out three times its colour.
// The depth pre-pass: the solid parts' depth only, so the lit pass shades
// each pixel once, for the surface it shows, rather than for every surface
// drawn over it on the way.
@fragment fn fsNothing() -> @location(0) vec4f { return vec4f(0.0); }
${VIEWS_WGSL}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
	// The near sky maps' box edge, for the Shadow maps view: found before any
	// branch, as a derivative must be.
	let edge = nearEdge(i.world);
	let wide = fwidth(edge);
	// The heatmaps: a share in red, added up and coloured by the composite.
	if (u.debug.x > 4.5) { return vec4f(heat(i), 0.0, 0.0, 1.0); }
	let s = surface(i);
	let shade = u.mats[(i.look & 255u) * 3u + 1u].y;
	let neon = shade > 0.5 && shade < 1.5;
	let shown = select(display(s.rgb), pow(min(s.rgb, vec3f(1.0)), vec3f(1.0 / 2.2)), neon);
	if (u.debug.w > 2.5) { return vec4f(sunMapTint(shown, i.world, edge, wide), s.a); }
	return vec4f(shown, s.a);
}
// Wireframe only: each part's edges, in its own colour lifted toward white.
@fragment fn fsWire(i: VOut) -> @location(0) vec4f {
	return vec4f(pow(mix(i.colour, vec3f(1.0), 0.3), vec3f(1.0 / 2.2)), 0.85);
}
// The sky behind everything: a triangle that covers the screen, each pixel's ray worked out from where it is.
struct SOut { @builtin(position) clip: vec4f, @location(0) ndc: vec2f };
@vertex fn vsSky(@builtin(vertex_index) i: u32) -> SOut {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
	var o: SOut;
	o.clip = vec4f(xy, 0.0, 1.0);
	o.ndc = xy;
	return o;
}
// Where a direction meets a Sky's images: u and v from -1 to 1, and the
// face's layer. As view.ts's skyLookup, which says how it was measured.
fn skyFace(d: vec3f) -> vec3f {
	let a = abs(d);
	if (a.x >= a.y && a.x >= a.z) {
		if (d.x > 0.0) { return vec3f(d.z / a.x, -d.y / a.x, 3.0); }
		return vec3f(-d.z / a.x, -d.y / a.x, 4.0);
	}
	if (a.z >= a.y) {
		if (d.z > 0.0) { return vec3f(-d.x / a.z, -d.y / a.z, 0.0); }
		return vec3f(d.x / a.z, -d.y / a.z, 2.0);
	}
	if (d.y > 0.0) { return vec3f(-d.z / a.y, -d.x / a.y, 5.0); }
	return vec3f(-d.z / a.y, d.x / a.y, 1.0);
}
// The sky's light in a direction, as a reflection sees it: a Sky's own six
// images where it has them, so a dark space Sky is dark in a metal too; the
// sky made here where it has none.
fn skyLight(dir: vec3f) -> vec3f {
	if (u.screen.w < 0.5) { return sky(dir); }
	let f = skyFace(dir);
	let c = textureSampleLevel(skyImages, skySampler, f.xy * 0.5 + 0.5, i32(f.z), 0.0).rgb;
	return pow(c, vec3f(2.2)) * ${SKY_GAIN} + select(vec3f(0.0), sunLight(dir), u.screen.w > 1.5);
}
@fragment fn fsSky(i: SOut) -> @location(0) vec4f {
	let far = u.invViewProj * vec4f(i.ndc, 1.0, 1.0);
	let dir = normalize(far.xyz / far.w - u.camPos.xyz);
	if (u.screen.w > 0.5) {
		// Through the display curve, without the lift a lit surface's shadows
		// have: a dark sky stays nearly black, as Studio's captures of one do.
		let f = skyFace(dir);
		let c = textureSampleLevel(skyImages, skySampler, f.xy * 0.5 + 0.5, i32(f.z), 0.0).rgb;
		let sun = select(vec3f(0.0), sunLight(dir), u.screen.w > 1.5);
		let seen = aces((pow(c, vec3f(2.2)) * ${SKY_GAIN} + sun) * u.zenith.w);
		return vec4f(pow(min(seen + sunImageLight(dir), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
	}
	let seen = pow(display(sky(dir)), vec3f(2.2));
	return vec4f(pow(min(seen + sunImageLight(dir), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
// A handle: in the tool's colour, shaded but not lit by the place, with its
// depth squeezed into the front hundredth of the range -- by 1, as depth here
// is reversed -- so it is in front of the place and still in front of or
// behind the other handles as it should be.
@vertex fn vsHandle(v: VIn) -> VOut {
	var o = shade(v);
	o.clip.z = o.clip.w - (o.clip.w - o.clip.z) * 0.01;
	return o;
}
@fragment fn fsHandle(i: VOut) -> @location(0) vec4f {
	let n = normalize(i.normal);
	let shadeK = 0.72 + 0.38 * max(dot(n, normalize(vec3f(0.4, 1.0, 0.25))), 0.0);
	return vec4f(pow(i.colour * shadeK, vec3f(1.0 / 2.2)), u.sun.w);
}
// An edge of an outline, as a band \`screen.z\` pixels wide, square to it on
// screen and half its width past each corner so the corners meet. It is on
// the box's own edge, drawn a touch towards the camera so the faces it runs
// along do not hide it; an edge that passes behind the camera is cut where it
// does, or it would bend across the view.
@vertex fn vsLine(v: VIn, @builtin(vertex_index) vid: u32) -> VOut {
	let m = mat3x3f(v.c0, v.c1, v.c2);
	var wa = m * v.pos + v.p;
	var wb = m * v.nrm + v.p;
	wa = wa + (u.camPos.xyz - wa) * 0.004;
	wb = wb + (u.camPos.xyz - wb) * 0.004;
	var a = u.viewProj * vec4f(wa, 1.0);
	var b = u.viewProj * vec4f(wb, 1.0);
	let e = 0.001;
	let behind = a.w < e && b.w < e;
	if (a.w < e) { a = mix(a, b, (e - a.w) / (b.w - a.w)); }
	if (b.w < e) { b = mix(b, a, (e - b.w) / (a.w - b.w)); }
	let end = (vid & 2u) == 2u;
	let side = select(-1.0, 1.0, (vid & 1u) == 1u);
	let dir = normalize((b.xy / b.w - a.xy / a.w) * u.screen.xy + vec2f(1e-6, 0.0));
	let off = (vec2f(-dir.y, dir.x) * side + dir * select(-1.0, 1.0, end)) * u.screen.z / u.screen.xy;
	var o: VOut;
	o.clip = select(a, b, end);
	o.clip = vec4f(o.clip.xy + off * o.clip.w, o.clip.zw);
	if (behind) { o.clip = vec4f(2.0, 2.0, 2.0, 1.0); }
	o.world = select(wa, wb, end);
	o.colour = v.colour.rgb;
	o.alpha = v.colour.a;
	o.normal = vec3f(0.0, 1.0, 0.0);
	o.id = v.id;
	return o;
}
struct LIn { @location(0) pos: vec3f, @location(1) colour: vec3f };
struct LOut { @builtin(position) clip: vec4f, @location(0) colour: vec3f };
@vertex fn vsOver(v: LIn) -> LOut {
	var o: LOut;
	o.clip = u.viewProj * vec4f(v.pos, 1.0);
	o.colour = v.colour;
	return o;
}
@fragment fn fsOver(i: LOut) -> @location(0) vec4f { return vec4f(i.colour, 1.0); }
@fragment fn fsLine(i: VOut) -> @location(0) vec4f { return vec4f(i.colour, i.alpha); }
@fragment fn fsId(i: VOut) -> @location(0) u32 { return i.id + 1u; }
// A Decal's or Texture's image on its face: lit as a matte face is, by the
// sun and the sky's fill, through the same air, in its Color3 and Transparency.
@group(1) @binding(0) var image: texture_2d<f32>;
@group(1) @binding(1) var imageSampler: sampler;
struct IOut {
	@builtin(position) clip: vec4f, @location(0) world: vec3f, @location(1) normal: vec3f,
	@location(2) uv: vec2f, @location(3) tint: vec4f,
};
fn imageOut(pos: vec3f, nrm: vec3f, uv: vec2f, tint: vec4f) -> IOut {
	var o: IOut;
	o.world = pos;
	o.clip = u.viewProj * vec4f(pos, 1.0);
	o.normal = nrm;
	o.uv = uv;
	// Its colour in linear light once a corner, not once a pixel; alpha as it is.
	o.tint = vec4f(pow(tint.rgb, vec3f(2.2)), tint.a);
	return o;
}
@vertex fn vsImage(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) tint: vec4f) -> IOut {
	return imageOut(pos, nrm, uv, tint);
}
// A Decal or Texture on a face of the reflection cube, seen from its middle
// as vsRefl sees the parts. Its own group: the image's texture is group 1.
@group(2) @binding(0) var<uniform> reflFace: ReflU;
@vertex fn vsImageRefl(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) tint: vec4f) -> IOut {
	var o = imageOut(pos, nrm, uv, tint);
	o.clip = reflFace.viewProj * vec4f(pos, 1.0);
	return o;
}
// The image lit, in linear light, and its alpha: the view's and the cube's.
fn imageLit(i: IOut, t: vec4f) -> vec4f {
	let albedo = pow(t.rgb, vec3f(2.2)) * i.tint.rgb;
	let n = normalize(i.normal);
	let ndl = max(dot(n, u.sun.xyz), 0.0);
	let vis = skyVisibility(i.world, n);
	var sunK = 0.0;
	if (ndl > 0.0) { sunK = sunSees(i.world, n); }
	var lamps = vec3f(0.0);
	if (has(${FEATURE_BIT.pointLights}u | ${FEATURE_BIT.spotLights}u | ${FEATURE_BIT.surfaceLights}u)) { lamps = partLights(i.world, n, n, 1.0).diffuse; }
	let fill = (vec3f(u.fog.w, u.fogColour.w, u.hazeColour.w) + u.ambient.rgb * max(vis, ${SKY_SEEN_LEAST})) * (0.9 + 0.1 * n.y);
	var c = albedo * (fill + u.sunColour.rgb * ndl * sunK + lamps);
	if (has(${FEATURE_BIT.unlit}u)) { c = albedo; }
	let d = length(u.camPos.xyz - i.world);
	c = air(c, d, i.world.y);
	return vec4f(c, t.a * i.tint.a);
}
@fragment fn fsImage(i: IOut) -> @location(0) vec4f {
	let t = textureSampleBias(image, imageSampler, i.uv, u.lod.x);
	let edge = nearEdge(i.world);
	let wide = fwidth(edge);
	let lit = imageLit(i, t);
	if (u.debug.w > 2.5) { return vec4f(sunMapTint(display(lit.rgb), i.world, edge, wide), lit.a); }
	return vec4f(display(lit.rgb), lit.a);
}
// The cube keeps linear light, as fsRefl gives it.
@fragment fn fsImageRefl(i: IOut) -> @location(0) vec4f {
	return imageLit(i, textureSampleBias(image, imageSampler, i.uv, u.lod.x));
}
// A solid part's Decal or Texture, where it is mostly opaque, into the depth:
// a see-through part behind it is then hidden by it, one in front blends over it.
@fragment fn fsImageDepth(i: IOut) -> @location(0) vec4f {
	if (textureSample(image, imageSampler, i.uv).a * i.tint.a < 0.5) { discard; }
	return vec4f(0.0);
}
// A Decal or Texture in the glow's pass: it covers what glows beneath it.
@fragment fn fsImageVeil(i: IOut) -> @location(0) vec4f {
	return vec4f(0.0, 0.0, 0.0, textureSample(image, imageSampler, i.uv).a * i.tint.a);
}
`;

interface Draw {
	/** The shape's own arrays: a wireframe's edges are found from them. */
	mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array };
	/** Its edges, once a wireframe has asked for them. */
	edges?: { buffer: GPUBuffer; count: number };
	vertices: GPUBuffer;
	indices: GPUBuffer;
	indexCount: number;
	/** 16 bits an index for the shapes made here, 32 for a mesh. */
	format: GPUIndexFormat;
	instances: GPUBuffer;
	count: number;
	/** The solid parts' chunks, for culling: see culling.ts. */
	chunks?: Chunk[];
	/** Whether a Highlight covers any of its parts: drawn into the highlights' mask. */
	highlighted?: boolean;
}

/** Whether any of `count` rows in `data` is a part in `ids`. */
function rowsIn(data: Float32Array, count: number, ids: ReadonlySet<number>): boolean {
	if (ids.size === 0 || count === 0) return false;
	const words = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
	// A row's id: its 14th word (see scene.ts).
	for (let i = 0; i < count; i++) if (ids.has(words[i * SCENE_STRIDE + 13])) return true;
	return false;
}

/**
 * The depth image for occlusion: each cell the farthest of the solid parts'
 * depths over its pixels, as a distance from the eye; 1e30 where nothing is.
 */
const farShader = (samples: number) => /* wgsl */ `
struct FarU { invViewProj: mat4x4f, eye: vec4f, size: vec4f };
@group(0) @binding(0) var depthTex: ${samples > 1 ? "texture_depth_multisampled_2d" : "texture_depth_2d"};
@group(0) @binding(1) var<uniform> fu: FarU;
@vertex fn vsFar(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
	let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fsFar(@builtin(position) at: vec4f) -> @location(0) vec4f {
	let cell = floor(at.xy);
	let x0 = i32(floor(cell.x * fu.size.x / fu.size.z));
	let x1 = max(i32(floor((cell.x + 1.0) * fu.size.x / fu.size.z)), x0 + 1);
	let y0 = i32(floor(cell.y * fu.size.y / fu.size.w));
	let y1 = max(i32(floor((cell.y + 1.0) * fu.size.y / fu.size.w)), y0 + 1);
	var far = 0.0;
	for (var y = y0; y < y1; y++) {
		for (var x = x0; x < x1; x++) {
			let d = textureLoad(depthTex, vec2i(x, y), 0);
			if (d <= 0.0) { return vec4f(1e30, 0.0, 0.0, 1.0); }
			let ndc = vec2f((f32(x) + 0.5) / fu.size.x * 2.0 - 1.0, 1.0 - (f32(y) + 0.5) / fu.size.y * 2.0);
			let w = fu.invViewProj * vec4f(ndc, d, 1.0);
			far = max(far, distance(w.xyz / w.w, fu.eye.xyz));
		}
	}
	return vec4f(far, 0.0, 0.0, 1.0);
}
`;

export class WebGpuView implements ViewRenderer {
	readonly backend = "WebGPU" as const;

	/** Samples a pixel the place is drawn with: 1, or 4, WebGPU's only other. */
	readonly samples: number;

	/**
	 * The antialiasing asked for (MSAA 2x or 8x is drawn at 4x, the only
	 * other WebGPU has), and each sun shadow map's side, in texels, as the
	 * quality level sets them.
	 */
	constructor(antialias: AntialiasMode = "msaa4", shadowMap: number = CASCADE_MAP) {
		this.asked = antialias;
		this.mapSide = shadowMap;
		this.aaMode = antialiasFor(antialias, "WebGPU", SAMPLES);
		this.samples = antialiasInfo(this.aaMode).samples;
	}

	/** The antialiasing asked for, which setAntialias may change. */
	private asked: AntialiasMode;
	/** Each sun shadow map's side, which setShadowMap may change. */
	private mapSide: number;

	get antialias(): AntialiasMode {
		return this.asked;
	}

	get shadowMap(): number {
		return this.mapSide;
	}

	setAntialias(mode: AntialiasMode): boolean {
		const next = antialiasFor(mode, "WebGPU", SAMPLES);
		if (antialiasInfo(next).samples !== this.samples) return false;
		this.asked = mode;
		if (next === this.aaMode) return true;
		if (!this.device) {
			this.aaMode = next;
			return true;
		}
		// The new mode's pipelines first, the old mode drawing until they are
		// compiled, as a view built afresh waits for its own before a frame.
		const switching = ++this.aaSwitches;
		this.makeAntialias(next, false);
		void this.compiled().then(() => {
			if (switching !== this.aaSwitches || this.destroyed) return;
			this.aaMode = next;
			this.makeAaTargets();
			this.onRedraw?.();
		});
		return true;
	}

	/** Each setAntialias counted, so only the last one's pipelines are switched to. */
	private aaSwitches = 0;

	setShadowMap(size: number): void {
		if (size === this.mapSide) return;
		this.mapSide = size;
		if (!this.device || !this.sunMaps) return;
		this.sunMaps.destroy();
		this.makeSunMaps();
		this.rebind();
		// A near sky refill under way holds a group made with the old maps.
		this.nearFill = null;
		this.cascadeLast = new Float32Array(CASCADE_BLOCK);
		this.cadence = new CascadeCadence();
		this.onRedraw?.();
	}

	/** The antialiasing drawn. */
	private aaMode: AntialiasMode;

	/** Whether to build the shader in half precision where it can be: see HALF. */
	half = true;
	/** Whether it was. */
	private halfOn = false;

	/** The place's shader, in half precision where asked and it compiles; else in full. */
	private async shaderModule(): Promise<GPUShaderModule> {
		const d = this.device;
		if (this.halfOn) {
			const module = d.createShaderModule({ code: HALF.on + SHADER });
			const info = await module.getCompilationInfo();
			if (!info.messages.some((m) => m.type === "error")) return module;
			this.halfOn = false;
		}
		return d.createShaderModule({ code: HALF.off + SHADER });
	}

	/** The modes this renderer draws: see antialias.ts. */
	antialiasModes(): AntialiasMode[] {
		return antialiasModes("WebGPU", SAMPLES);
	}

	/**
	 * A pass's colour going to `target`: drawn antialiased and resolved into
	 * it, the samples let go; or, one sample a pixel, drawn into it and kept.
	 */
	private into(target: GPUTextureView): {
		view: GPUTextureView;
		resolveTarget?: GPUTextureView;
		storeOp: GPUStoreOp;
	} {
		return this.samples > 1
			? { view: this.msaa!.createView(), resolveTarget: target, storeOp: "discard" }
			: { view: target, storeOp: "store" };
	}
	private device!: GPUDevice;
	private context!: GPUCanvasContext;
	private format!: GPUTextureFormat;
	private solid!: GPURenderPipeline;
	private solidWrite!: GPURenderPipeline;
	private farDepthPipe: GPURenderPipeline | null = null;
	/** The lean path's occlusion depth, about DEPTH_COLS * 4 texels across. */
	private farSmall: GPUTexture | null = null;

	/**
	 * The depth path. Full: the parts' depth drawn first, then each pixel
	 * shaded once against it, which saves an immediate-mode GPU (NVIDIA,
	 * AMD, Intel) shading what is hidden. Lean: occlusion's depth drawn
	 * small, and the parts shaded and depth-tested in one draw, for a
	 * tile-based GPU (Apple's), which hides what is behind on its own
	 * before it shades, so the full pass would draw the place twice.
	 * Automatic is full until the controller has measured both on moving
	 * frames (depthChoice.ts), and then the faster: on an iPad Mini (A15)
	 * lean measured 9 ms a frame to full's 6 in one place (22 Nov 2026) and
	 * 2.7 ms faster in another (24 Nov). A profile times both.
	 */
	private depthPath: "auto" | "full" | "lean" = "auto";
	setDepthPath(path: "auto" | "full" | "lean"): void {
		this.depthPath = path;
	}
	leanDepth(): boolean {
		return this.depthPath === "lean";
	}
	private solidDepth!: GPURenderPipeline;
	private lines!: GPURenderPipeline;
	private ids!: GPURenderPipeline;
	private over!: GPURenderPipeline;
	private handle!: GPURenderPipeline;
	private skyPipeline!: GPURenderPipeline;
	private lighting!: LightingParams;
	private handleMeshes: {
		kind: (typeof HANDLE_KINDS)[number];
		vertices: GPUBuffer;
		indices: GPUBuffer;
		indexCount: number;
	}[] = [];
	private handleDraws: { mesh: number; buffer: GPUBuffer; count: number }[] = [];
	private overlay: { buffer: GPUBuffer; count: number } | null = null;
	private uniform!: GPUBuffer;
	private bind!: GPUBindGroup;
	private draws: Draw[] = [];
	/** The see-through parts, drawn last and blended, re-sorted as the camera moves. */
	private clear: (Draw & { source: Float32Array; sorted: Float32Array })[] = [];
	private clearEye: number[] | null = null;
	private blended!: GPURenderPipeline;
	/** See-through Glass: its depth first, then its colour, so nothing see-through shows behind it. */
	private glass: Draw[] = [];
	/** Fully transparent parts a Highlight covers: the highlights' mask alone draws them. */
	private ghosts: Draw[] = [];
	private glassHides = true;
	private scene?: PlaceScene;
	private glassDepth!: GPURenderPipeline;
	private glassBlended!: GPURenderPipeline;
	private glowGlassDepth!: GPURenderPipeline;
	// The glow: what gives light drawn small, blurred, and added over the
	// finished frame, which is drawn into its own texture first for it.
	private glowing = false;
	private glowSolid!: GPURenderPipeline;
	private glowSeen!: GPURenderPipeline;
	private imageVeil!: GPURenderPipeline;
	private down!: GPURenderPipeline;
	private blur!: GPURenderPipeline;
	private bright!: GPURenderPipeline;
	private composite!: GPURenderPipeline;
	private postLayout!: GPUBindGroupLayout;
	private compositeLayout!: GPUBindGroupLayout;
	private compositeGroup?: GPUBindGroup;
	private sampler!: GPUSampler;
	private postParams: GPUBuffer[] = [];
	private frame?: GPUTexture;
	/** The frame blurred across, on its way to being blurred down: a BlurEffect. */
	private frameAcross?: GPUTexture;
	private frameBlurGroups: GPUBindGroup[] = [];
	private blurFrame!: GPURenderPipeline;
	private gradeBuffer!: GPUBuffer;
	private postOn = true;

	setPostEffects(on: boolean): void {
		this.postOn = on;
	}

	/** The quality level's render distance and sun shadows. */
	private quality: ViewQuality = FULL_QUALITY;
	setQuality(quality: ViewQuality): void {
		const was = this.glowHalf();
		const coarse = this.quality.glowCoarse === true;
		this.quality = quality;
		if (this.device && (this.glowHalf() !== was || (quality.glowCoarse === true) !== coarse))
			this.makeGlowSource();
	}

	/**
	 * Whether the glow's source is drawn at half the view's size: see
	 * ViewQuality.glowHalf and glowCoarse. One sample a pixel only.
	 */
	private glowHalf(): boolean {
		return (this.quality.glowHalf || this.quality.glowCoarse === true) && this.samples === 1;
	}

	/** The half size glow source's own depth. */
	private glowDepth: GPUTexture | null = null;

	/** The glow's source, the view's size or half it, and the blur's targets that read it. */
	private makeGlowSource(): void {
		const d = this.device;
		this.glowFull?.destroy();
		this.glowDepth?.destroy();
		this.glowDepth = null;
		const half = this.glowHalf();
		const size = half
			? [Math.max(1, Math.round(this.width / 2)), Math.max(1, Math.round(this.height / 2))]
			: [this.width, this.height];
		this.glowFull = d.createTexture({
			size,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		if (half)
			this.glowDepth = d.createTexture({
				size,
				format: "depth32float",
				usage: TEXTURE.RENDER_ATTACHMENT,
			});
		// The blur's groups name the source, and the composite the blur's
		// targets: made again with it.
		for (const t of [this.glow?.a, this.glow?.b, this.glow?.c, this.glow?.d]) t?.destroy();
		this.glow = undefined;
		this.sizeGlow();
		if (!this.frame || !this.glow) return;
		const glow = this.glow as { a: GPUTexture; c: GPUTexture };
		this.compositeGroup = d.createBindGroup({
			layout: this.compositeLayout,
			entries: [
				{ binding: 0, resource: glow.a.createView() },
				{ binding: 1, resource: this.sampler },
				{ binding: 2, resource: { buffer: this.postParams[2] } },
				{ binding: 3, resource: this.frame.createView() },
				{ binding: 4, resource: { buffer: this.gradeBuffer } },
				{ binding: 5, resource: glow.c.createView() },
			],
		});
	}

	/** The Rendering panel's mode and switches: see `RenderSettings`. */
	private render: RenderSettings = DEFAULT_RENDER;
	private heatAdded!: GPURenderPipeline;
	private wire!: GPURenderPipeline;

	setRender(render: RenderSettings): void {
		// Thin parts' switch changes what the near sky maps hold: draw them again.
		// What the near maps and the lighting cells hold changed: draw them again.
		const held = (r: RenderSettings) =>
			`${passesOf(r.features).thinParts} ${featureBits(r.features) & (FEATURE_BIT.skyShadows | FEATURE_BIT.nearSky)}`;
		if (held(render) !== held(this.render)) this.nearCentre = null;
		if (render.features !== this.render.features) this.reflStale();
		this.render = render;
	}

	/** This frame's draw calls, instances and triangles, and the last frame's. */
	private tally = { draws: 0, instances: 0, triangles: 0 };
	private lastTally = { draws: 0, instances: 0, triangles: 0 };
	private cpuMs = 0;
	/** This frame's CPU time on effects and on culling: see RenderStats.cpuSteps. */
	private cpuEffects = 0;
	private cpuCulling = 0;
	private cpuSteps: { effects: number; culling: number; fx?: EffectSteps } = {
		effects: 0,
		culling: 0,
	};

	stats(): RenderStats {
		const fx = this.effects?.last;
		return {
			...this.lastTally,
			culled: this.culled,
			beams: fx?.beams ?? 0,
			particles: fx?.particles ?? 0,
			cpu: this.cpuMs,
			cpuSteps: { ...this.cpuSteps },
			gpu: this.gpuTimes,
			memory: this.memory.use(canvasBytes(this.canvas?.width ?? 0, this.canvas?.height ?? 0)),
		};
	}

	/** What the view has made on the GPU: see gpuMemory.ts. */
	private readonly memory = new GpuMemory();

	/** Each draw's instances and triangles, toward the frame's stats. */
	private count(draws: Draw[]): void {
		for (const d of draws) {
			const n = this.shown(d);
			this.tally.instances += n;
			this.tally.triangles += (n * d.indexCount) / 3;
		}
	}

	/** Each solid draw's runs of instances the camera's passes draw: see culling.ts. */
	private runs = new Map<object, number[]>();
	/** The last frame's depth, small, for occlusion; and what culling left. */
	depthImage: DepthImage | null = null;
	private culled: { drawn: number; of: number } | null = null;

	/**
	 * Which of the solid parts' chunks the camera's passes draw: in view, and
	 * not hidden behind the last frame's solid parts. Found after the shadow
	 * and sky maps, which draw every part, and cleared when the frame is done.
	 */
	private cull(camera: Camera, draws: readonly { chunks?: Chunk[]; count: number }[]): void {
		this.runs.clear();
		const passes = passesOf(this.render.features);
		const distance = this.quality.distance;
		if (!passes.frustum && !passes.occlusion && distance === null) {
			this.culled = null;
			this.occlusionStale = false;
			return;
		}
		const vp = multiply(
			perspective(FOV, this.width / this.height, camera.near, camera.far, true, true),
			lookAt(camera.eye, camera.at),
		);
		const planes = sidePlanes(vp);
		const depth =
			passes.occlusion && depthFits(this.depthImage, camera.eye) ? this.depthImage : null;
		this.cullView = { vp, eye: [...camera.eye] };
		// Drawn with another view's depth: draw again once this view's arrives.
		this.occlusionStale = passes.occlusion && !sameView(depth?.viewProj, vp);
		// Past the quality level's render distance nothing is drawn, as in Studio.
		const seen = (min: readonly number[], max: readonly number[]) =>
			(distance === null || !boxBeyond(camera.eye, min, max, distance)) &&
			(!passes.frustum || boxInView(planes, min, max)) &&
			!(depth && boxHidden(depth, min, max));
		let drawn = 0;
		let of = 0;
		for (const draw of draws) {
			of += draw.count;
			if (!draw.chunks) {
				drawn += draw.count;
				continue;
			}
			const runs = visibleRuns(draw.chunks, (c) => seen(c.min, c.max));
			this.runs.set(draw, runs);
			for (let i = 1; i < runs.length; i += 2) drawn += runs[i];
		}
		// The see-through parts one by one, in the order they are drawn, back to front.
		this.sortClear(camera.eye);
		for (const c of this.clear) {
			of += c.count;
			const runs = rowRuns(c.sorted, c.count, seen);
			this.runs.set(c, runs);
			for (let i = 1; i < runs.length; i += 2) drawn += runs[i];
		}
		this.culled = { drawn, of };
	}

	/** How many of a draw's instances this frame draws. */
	private shown(draw: { count: number }): number {
		const runs = this.runs.get(draw);
		if (!runs) return draw.count;
		let n = 0;
		for (let i = 1; i < runs.length; i += 2) n += runs[i];
		return n;
	}

	/** Wireframe only: each draw's edges, found the first time they are asked for. */
	private edgeCache = new WeakMap<object, Uint32Array>();
	private wires(pass: GPURenderPassEncoder, draws: Draw[]): void {
		for (const draw of draws) {
			if (!draw.edges) {
				let found = this.edgeCache.get(draw.mesh);
				if (!found) {
					found = featureEdges(draw.mesh);
					this.edgeCache.set(draw.mesh, found);
				}
				draw.edges = { buffer: this.make(found, BUFFER.INDEX), count: found.length };
			}
			if (draw.edges.count === 0) continue;
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.edges.buffer, "uint32");
			const runs = this.runs.get(draw);
			if (!runs) {
				pass.drawIndexed(draw.edges.count, draw.count);
				this.tally.draws++;
				continue;
			}
			for (let i = 0; i < runs.length; i += 2)
				pass.drawIndexed(draw.edges.count, runs[i + 1], 0, 0, runs[i]);
			this.tally.draws += runs.length / 2;
		}
		this.count(draws);
	}

	/**
	 * The GPU's time for each pass, where the browser can time passes: a pair
	 * of stamps a pass, read back a frame or so later and summed by kind.
	 */
	private static readonly STAMPS = 128;
	/**
	 * The stamps' query set and resolve buffer, and buffers to read them back
	 * in: a few, so a frame's stamps are read while the last frame's still are.
	 */
	private timing?: { set: GPUQuerySet; resolve: GPUBuffer; free: GPUBuffer[]; made: number };
	private static readonly STAMP_READS = 4;
	/**
	 * Each stamped pass's kind, for Automatic (null: stamped only for a
	 * profile), and its profile stage, given when the stage is cut.
	 */
	private stamps: ("shadows" | "scene" | "post" | null)[] = [];
	private stampStages: (Stage | undefined)[] = [];
	private gpuTimes: RenderStats["gpu"] = null;
	/** While profiling: each frame's GPU time by stage, from the stamps. */
	private gpuSink: StageSink | null = null;
	private stamp(
		kind: "shadows" | "scene" | "post" | null,
	): GPURenderPassTimestampWrites | undefined {
		const t = this.timing;
		if (kind === null && !this.gpuSink) return undefined;
		if (!t || (this.stamps.length + 1) * 2 > WebGpuView.STAMPS) return undefined;
		const at = this.stamps.length * 2;
		this.stamps.push(kind);
		return { querySet: t.set, beginningOfPassWriteIndex: at, endOfPassWriteIndex: at + 1 };
	}
	/** The passes stamped since the last cut belong to `stage`. */
	private stampsAre(stage: Stage): void {
		for (let i = this.stampStages.length; i < this.stamps.length; i++) this.stampStages[i] = stage;
	}
	private readStamps(encoder: GPUCommandEncoder): (() => void) | undefined {
		const t = this.timing;
		const kinds = this.stamps;
		const stages = this.stampStages;
		const gpuSink = this.gpuSink;
		this.stamps = [];
		this.stampStages = [];
		if (!t || kinds.length === 0) return undefined;
		let read = t.free.pop();
		if (!read && t.made < WebGpuView.STAMP_READS) {
			t.made++;
			read = this.device.createBuffer({
				size: WebGpuView.STAMPS * 8,
				usage: BUFFER.MAP_READ | BUFFER.COPY_DST,
			});
		}
		// Every buffer still being read: this frame goes untimed.
		if (!read) return undefined;
		const into = read;
		const bytes = kinds.length * 16;
		encoder.resolveQuerySet(t.set, 0, kinds.length * 2, t.resolve, 0);
		encoder.copyBufferToBuffer(t.resolve, 0, into, 0, bytes);
		return () => {
			into.mapAsync(MAP_READ, 0, bytes).then(
				() => {
					const ns = new BigUint64Array(into.getMappedRange(0, bytes));
					const sum = { shadows: 0, scene: 0, post: 0 };
					const byStage: StageFrame = {};
					// Each pass from where the one before it ended: see passTimes.
					const times = passTimes(ns);
					kinds.forEach((kind, j) => {
						const took = times[j];
						if (!Number.isFinite(took)) return;
						if (kind) sum[kind] += took;
						const stage = stages[j];
						if (stage) byStage[stage] = (byStage[stage] ?? 0) + took;
					});
					into.unmap();
					t.free.push(into);
					this.gpuTimes = sum;
					gpuSink?.(byStage);
				},
				() => {
					t.free.push(into);
				},
			);
		};
	}
	/** The glow the place's BloomEffect asks for: see `glowShape`. */
	private shape: GlowShape = glowShape(undefined, false);
	/** The glow's width the blur's parameters were last written for. */
	private shapeSpread = -1;
	/** The glow's source at the view's size, resolved, before it is averaged down. */
	private glowFull?: GPUTexture;
	private glow?: {
		a: GPUTexture;
		b: GPUTexture;
		/** The wide blur, and its spare: a quarter of the view's size (qw x qh). */
		c: GPUTexture;
		d: GPUTexture;
		qw: number;
		qh: number;
		groups: GPUBindGroup[];
		/** The bloom's bright-pass: the frame and Neon's glow source. */
		bright: GPUBindGroup;
		w: number;
		h: number;
	};
	private edges!: { vertices: GPUBuffer; indices: GPUBuffer; indexCount: number };
	private selection: { buffer: GPUBuffer; count: number } | null = null;
	private msaa?: GPUTexture;
	private depth?: GPUTexture;
	private pickTarget?: GPUTexture;
	private pickDepth?: GPUTexture;
	private pickRead!: GPUBuffer;
	private width = 1;
	private height = 1;

	private canvas: HTMLCanvasElement | null = null;

	private linesBehind!: GPURenderPipeline;
	private outlineWidth = SELECT_WIDTH;
	private hideBehind = false;

	setOutline(width: number, hideBehind: boolean): void {
		this.outlineWidth = width;
		this.hideBehind = hideBehind;
	}

	setGlassHides(on: boolean): void {
		if (on === this.glassHides) return;
		this.glassHides = on;
		if (this.scene) this.setScene(this.scene);
	}

	/** The outline's width in the canvas's own pixels. */
	private band(): number {
		return this.outlineWidth * (this.width / (this.canvas?.clientWidth || this.width));
	}

	/**
	 * The lit pipelines -- the solid parts, the see-through ones and Glass --
	 * as described, to build them again for one set of switches; and those
	 * built, by the switches' bits. Null while one compiles: the pipelines
	 * built for every switch draw meanwhile.
	 */
	private litDescs: Partial<Record<LitKind, GPURenderPipelineDescriptor>> = {};
	private litBuilt = new Map<number, Record<LitKind, GPURenderPipeline> | null>();
	private litPending = new Map<number, Promise<void>>();

	pipelinesReady(): Promise<void> {
		const bits = this.litBits();
		this.litFor(bits);
		return this.litPending.get(bits) ?? Promise.resolve();
	}

	/** Asked for when something it waited for is ready: a pipeline built for the switches. */
	onRedraw?: () => void;

	/** Whether any of the place's materials has grain or a pattern: see sceneGrainy. */
	private grainy = true;

	/** Whether the place has any PointLight, SpotLight or SurfaceLight: see setLights. */
	private hasLights = true;

	/**
	 * The switches' bits the lit pipelines are built for: those on, less the
	 * ones for what the place has none of -- lights, Neon, CrackedLava -- whose
	 * code would only take room.
	 */
	private litBits(features: RenderFeatures = this.render.features): number {
		let bits = featureBits(features);
		if (!this.hasLights)
			bits &= ~(
				FEATURE_BIT.pointLights |
				FEATURE_BIT.spotLights |
				FEATURE_BIT.surfaceLights |
				FEATURE_BIT.lightHighlights
			);
		if (!this.glowing) bits &= ~(FEATURE_BIT.neon | FEATURE_BIT.neonGlow | FEATURE_BIT.lava);
		if (!this.grainy) bits &= ~FEATURE_BIT.grain;
		return bits;
	}

	private lit(kind: LitKind, desc: GPURenderPipelineDescriptor): GPURenderPipelineDescriptor {
		this.litDescs[kind] = desc;
		return desc;
	}

	/**
	 * The lit pipelines for these switches: built for them once compiled, the
	 * ones for every switch until then. A set built is kept, so turning a
	 * switch back is no wait.
	 */
	private litFor(bits: number): Record<LitKind, GPURenderPipeline> {
		const generic = {
			solid: this.solid,
			solidWrite: this.solidWrite,
			blended: this.blended,
			glassBlended: this.glassBlended,
			lamps: this.lampsPipe,
		};
		const built = this.litBuilt.get(bits);
		if (built) return built;
		if (built === undefined) {
			this.litBuilt.set(bits, null);
			const d = this.device;
			const kinds = Object.keys(this.litDescs) as LitKind[];
			const pending = Promise.all(
				kinds.map((kind) => {
					const desc = this.litDescs[kind]!;
					const fragment = desc.fragment!;
					return d.createRenderPipelineAsync({
						...desc,
						fragment: { ...fragment, constants: { ...fragment.constants, FEATURES: bits } },
					});
				}),
			).then(
				(pipes) => {
					this.litBuilt.set(
						bits,
						Object.fromEntries(kinds.map((k, i) => [k, pipes[i]])) as Record<
							LitKind,
							GPURenderPipeline
						>,
					);
					this.onRedraw?.();
				},
				// Not built: the pipelines for every switch go on drawing.
				(err) => console.warn("Place Editor: the pipelines for these switches did not build.", err),
			);
			this.litPending.set(bits, pending);
		}
		return generic;
	}

	/**
	 * The lit pipelines for each set of switches, built ahead (a quality
	 * level's, for this place), and upscaling's: so changing level later
	 * waits for none. `progress` hears each set as it is built. Answers how
	 * many pipelines were asked for.
	 */
	async warmShaders(
		sets: readonly RenderFeatures[],
		progress?: (done: number, of: number) => void,
	): Promise<number> {
		const bits = [...new Set(sets.map((f) => this.litBits(f)))];
		this.makeUpscale();
		const jobs: Promise<unknown>[] = [
			...bits.map((b) => {
				this.litFor(b);
				return this.litPending.get(b) ?? Promise.resolve();
			}),
			...this.compiling.splice(0),
		];
		let done = 0;
		progress?.(0, jobs.length);
		const step = () => progress?.(++done, jobs.length);
		await Promise.all(jobs.map((job) => job.then(step, step)));
		return bits.length * Object.keys(this.litDescs).length + Object.keys(this.upPipes).length;
	}

	/** The pipelines init asked for, compiling side by side: see pipeline. */
	private compiling: Promise<void>[] = [];

	/**
	 * A pipeline compiled away from the page, put where `set` puts it once it
	 * is: for init's pipelines only, as init waits for them. One the device
	 * turns down is made as before, so it fails as it did.
	 */
	private pipeline(set: (p: GPURenderPipeline) => void, desc: GPURenderPipelineDescriptor): void {
		const d = this.device;
		this.compiling.push(
			d.createRenderPipelineAsync(desc).then(set, () => set(d.createRenderPipeline(desc))),
		);
	}

	/** Waits for the pipelines asked for, telling `progress` the share compiled as each is. */
	private async compiled(progress?: (shaders: number) => void): Promise<void> {
		const all = this.compiling;
		this.compiling = [];
		let done = 0;
		progress?.(0);
		await Promise.all(all.map((p) => p.then(() => progress?.(++done / all.length))));
	}

	async init(
		canvas: HTMLCanvasElement,
		scene: PlaceScene,
		progress?: (shaders: number) => void,
	): Promise<void> {
		this.canvas = canvas;
		const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
		if (!adapter) throw new Error("no WebGPU adapter");
		const info = (
			adapter as { info?: { vendor?: string; architecture?: string; description?: string } }
		).info;
		// Safari gives the same word for all three: "apple".
		this.gpuName =
			[...new Set([info?.vendor, info?.architecture, info?.description].filter((s) => !!s))].join(
				" ",
			) || "Not given";
		// Timestamps where the adapter has them, for the Rendering panel's GPU times.
		const timed = adapter.features.has("timestamp-query");
		this.halfOn = this.half && adapter.features.has("shader-f16");
		const features: GPUFeatureName[] = [];
		if (timed) features.push("timestamp-query");
		if (this.halfOn) features.push("shader-f16");
		this.device = await adapter.requestDevice(
			features.length > 0 ? { requiredFeatures: features } : undefined,
		);
		// Before anything is made, so all of it is counted.
		trackWebGpu(this.device, this.memory);
		if (timed) {
			const n = WebGpuView.STAMPS;
			this.timing = {
				set: this.device.createQuerySet({ type: "timestamp", count: n }),
				resolve: this.device.createBuffer({
					size: n * 8,
					usage: BUFFER.QUERY_RESOLVE | BUFFER.COPY_SRC,
				}),
				free: [],
				made: 0,
			};
		}
		this.context = canvas.getContext("webgpu") as GPUCanvasContext;
		if (!this.context) throw new Error("no WebGPU context");
		this.format = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });

		const d = this.device;
		const module = await this.shaderModule();
		const buffers: GPUVertexBufferLayout[] = [
			{
				arrayStride: 24,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: "float32x3" },
					{ shaderLocation: 1, offset: 12, format: "float32x3" },
				],
			},
			{
				arrayStride: SCENE_STRIDE * 4,
				stepMode: "instance",
				attributes: [
					{ shaderLocation: 2, offset: 0, format: "float32x3" },
					{ shaderLocation: 3, offset: 12, format: "float32x3" },
					{ shaderLocation: 4, offset: 24, format: "float32x3" },
					{ shaderLocation: 5, offset: 36, format: "float32x3" },
					{ shaderLocation: 6, offset: 48, format: "unorm8x4" },
					{ shaderLocation: 7, offset: 52, format: "uint32" },
					{ shaderLocation: 8, offset: 56, format: "uint32" },
				],
			},
		];
		const layout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.VERTEX | STAGE.FRAGMENT, buffer: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, texture: { viewDimension: "2d-array" } },
				{ binding: 2, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 3, visibility: STAGE.FRAGMENT, texture: { viewDimension: "2d-array" } },
				{ binding: 4, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 5, visibility: STAGE.FRAGMENT, texture: {} },
				{
					binding: 6,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "depth", viewDimension: "2d-array" },
				},
				{ binding: 7, visibility: STAGE.FRAGMENT, sampler: { type: "comparison" } },
				{ binding: 8, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 9, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
				{ binding: 10, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
				{ binding: 11, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
				{
					binding: 12,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "depth", viewDimension: "2d-array" },
				},
				{ binding: 13, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 14, visibility: STAGE.FRAGMENT, texture: { viewDimension: "3d" } },
				{ binding: 15, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 16, visibility: STAGE.FRAGMENT, texture: { viewDimension: "cube" } },
				{ binding: 17, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 18, visibility: STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
				{ binding: 19, visibility: STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
			],
		});
		this.layout = layout;
		this.makeLampTargets();
		this.makeReflections(module, layout, buffers);
		this.makeAntialias();
		// The lighting cells, two: one read while the other is filled. See fillCells.
		this.cells = [0, 1].map(() =>
			d.createTexture({
				size: [SKY_CELLS[0], SKY_CELLS[2], SKY_CELLS[1]],
				dimension: "3d",
				format: "r8unorm",
				usage: TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT,
			}),
		);
		this.cellSampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		this.pipeline((p) => (this.cellPipe = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
			vertex: { module, entryPoint: "vsCell" },
			fragment: { module, entryPoint: "fsCell", targets: [{ format: "r8unorm" }] },
			primitive: { topology: "triangle-list" },
		});
		void this.makeCellSteps(module, layout);
		this.makeSkyMaps(buffers);
		this.setLights(undefined);
		const pipelineLayout = d.createPipelineLayout({ bindGroupLayouts: [layout] });
		const depth = {
			format: "depth32float" as const,
			depthWriteEnabled: true,
			depthCompare: "greater" as const,
		};
		this.pipeline((p) => (this.solidDepth = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fsNothing",
				targets: [{ format: this.format, writeMask: 0 }],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: this.samples },
		});
		// Lit only where the pre-pass found it nearest.
		this.pipeline(
			(p) => (this.solid = p),
			this.lit("solid", {
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vs", buffers },
				fragment: { module, entryPoint: "fs", targets: [{ format: this.format }] },
				primitive: { topology: "triangle-list", cullMode: "back" },
				depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "equal" },
				multisample: { count: this.samples },
			}),
		);
		// The half-size lamp pass (see lampsAt): one sample, its own depth.
		this.pipeline(
			(p) => (this.lampsPipe = p),
			this.lit("lamps", {
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vs", buffers },
				fragment: {
					module,
					entryPoint: "fsLamps",
					targets: [{ format: "rgba16float" }, { format: "rgba16float" }],
				},
				primitive: { topology: "triangle-list", cullMode: "back" },
				depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" },
			}),
		);
		// The lean path's (see leanDepth): shaded and depth-tested in one draw,
		// for a tile-based GPU that hides what is behind before it shades.
		this.pipeline(
			(p) => (this.solidWrite = p),
			this.lit("solidWrite", {
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vs", buffers },
				fragment: { module, entryPoint: "fs", targets: [{ format: this.format }] },
				primitive: { topology: "triangle-list", cullMode: "back" },
				depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" },
				multisample: { count: this.samples },
			}),
		);
		// The lean path's occlusion depth: small, one sample, no colour.
		this.pipeline((p) => (this.farDepthPipe = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" },
		});
		// The see-through parts: blended over what is behind them, hidden by
		// what is in front, and hiding nothing themselves.
		this.pipeline(
			(p) => (this.blended = p),
			this.lit("blended", {
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vs", buffers },
				fragment: {
					module,
					entryPoint: "fs",
					targets: [
						{
							format: this.format,
							blend: {
								color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
								alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							},
						},
					],
				},
				primitive: { topology: "triangle-list", cullMode: "back" },
				depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
				multisample: { count: this.samples },
			}),
		);
		// The heatmaps' see-through parts: each one's share added to what is behind it.
		this.pipeline((p) => (this.heatAdded = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fs",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "one", dstFactor: "one" },
							alpha: { srcFactor: "one", dstFactor: "one" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: this.samples },
		});
		// Wireframe only: every edge, those behind others included.
		this.pipeline((p) => (this.wire = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fsWire",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "line-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: this.samples },
		});
		// Decals and Textures: blended onto their faces, hidden by what is in
		// front, hiding nothing. Their own vertices, and their image in group 1.
		this.imageLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.FRAGMENT, texture: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, sampler: {} },
			],
		});
		// Mipmapped, as the material textures are: a 1024 image on a far face
		// sampled at full size sparkled, and cost the iPad 3.7 ms for 162 faces.
		this.imageSampler = d.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
			maxAnisotropy: 4,
			addressModeU: "repeat",
			addressModeV: "repeat",
		});
		this.pipeline((p) => (this.imagePipeline = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fsImage",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: this.samples },
		});
		this.pipeline((p) => (this.imageDepth = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fsImageDepth",
				targets: [{ format: this.format, writeMask: 0 }],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" },
			multisample: { count: this.samples },
		});
		// The same images on the reflection cube's faces: its formats, and both
		// sides, as the faces mirror some triangles' winding (see makeReflections).
		if (this.reflFaceLayout)
			this.pipeline((p) => (this.reflImagePipe = p), {
				layout: d.createPipelineLayout({
					bindGroupLayouts: [layout, this.imageLayout, this.reflFaceLayout],
				}),
				vertex: {
					module,
					entryPoint: "vsImageRefl",
					buffers: [
						{
							arrayStride: IMAGE_VERTEX * 4,
							attributes: [
								{ shaderLocation: 0, offset: 0, format: "float32x3" },
								{ shaderLocation: 1, offset: 12, format: "float32x3" },
								{ shaderLocation: 2, offset: 24, format: "float32x2" },
								{ shaderLocation: 3, offset: 32, format: "float32x4" },
							],
						},
					],
				},
				fragment: {
					module,
					entryPoint: "fsImageRefl",
					targets: [
						{
							format: "rgba16float",
							blend: {
								color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
								alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							},
						},
					],
				},
				primitive: { topology: "triangle-list", cullMode: "none" },
				depthStencil: {
					format: "depth32float",
					depthWriteEnabled: false,
					depthCompare: "less-equal",
				},
			});
		this.viewPipelines(module, layout, buffers);
		this.effects = new GpuEffects({
			device: d,
			format: this.format,
			samples: this.samples,
			imageLayout: this.imageLayout,
			imageSampler: this.imageSampler,
			pipeline: (set, desc) => this.pipeline(set, desc),
			imageGroup: (asset) => this.imageGroups.get(asset)?.group,
		});
		// See-through Glass: the nearest's depth, then its colour blended at that depth.
		this.pipeline((p) => (this.glassDepth = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fs", targets: [{ format: this.format, writeMask: 0 }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: this.samples },
		});
		this.pipeline(
			(p) => (this.glassBlended = p),
			this.lit("glassBlended", {
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vs", buffers },
				fragment: {
					module,
					entryPoint: "fs",
					targets: [
						{
							format: this.format,
							blend: {
								color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
								alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							},
						},
					],
				},
				primitive: { topology: "triangle-list", cullMode: "back" },
				depthStencil: {
					format: "depth32float",
					depthWriteEnabled: false,
					depthCompare: "greater-equal",
				},
				multisample: { count: this.samples },
			}),
		);
		// Over everything, as Studio's selection box is.
		// Through everything, as Studio's selection box is, or hidden by what is in front.
		const line = (set: (p: GPURenderPipeline) => void, depthCompare: GPUCompareFunction) =>
			this.pipeline(set, {
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vsLine", buffers },
				fragment: {
					module,
					entryPoint: "fsLine",
					targets: [
						{
							format: this.format,
							blend: {
								color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
								alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							},
						},
					],
				},
				primitive: { topology: "triangle-list" },
				depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare },
				multisample: { count: this.samples },
			});
		line((p) => (this.lines = p), "always");
		line((p) => (this.linesBehind = p), "greater-equal");
		this.partModule = module;
		this.partBuffers = buffers;
		this.pipeline((p) => (this.ids = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsId", targets: [{ format: "r32uint" }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
		});
		this.pipeline((p) => (this.over = p), {
			layout: pipelineLayout,
			vertex: {
				module,
				entryPoint: "vsOver",
				buffers: [
					{
						arrayStride: 24,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
						],
					},
				],
			},
			fragment: { module, entryPoint: "fsOver", targets: [{ format: this.format }] },
			primitive: { topology: "line-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: this.samples },
		});
		this.pipeline((p) => (this.handle = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsHandle", buffers },
			fragment: {
				module,
				entryPoint: "fsHandle",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: this.samples },
		});
		this.pipeline((p) => (this.skyPipeline = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsSky", buffers: [] },
			fragment: { module, entryPoint: "fsSky", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: this.samples },
		});
		// The glow's passes: the place drawn small in what it gives off, then blurred and added.
		// Half floats, so six passes of blur do not round the glow's fall into steps.
		// Drawn at the view's size, antialiased as the frame is, so a sliver of
		// Neon through a seam glows by as much of a pixel as it covers.
		const glowTarget = { format: this.format };
		const glowSamples = { count: this.samples };
		this.pipeline((p) => (this.glowSolid = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsGlow", targets: [glowTarget] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: glowSamples,
		});
		// Over what is behind it, as in the frame: what glows behind a
		// see-through part is dimmed by it, and a see-through Neon part adds its own.
		const over = {
			color: { srcFactor: "one" as const, dstFactor: "one-minus-src-alpha" as const },
			alpha: { srcFactor: "one" as const, dstFactor: "one-minus-src-alpha" as const },
		};
		this.pipeline((p) => (this.glowSeen = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fsGlowSeen",
				// What images cover is left as it is: a see-through part is not an image.
				targets: [
					{
						...glowTarget,
						blend: { color: over.color, alpha: { srcFactor: "zero", dstFactor: "one" } },
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: glowSamples,
		});
		this.pipeline((p) => (this.glowGlassDepth = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsGlow", targets: [{ ...glowTarget, writeMask: 0 }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: glowSamples,
		});
		// Decals and Textures in the glow's pass: what they cover glows no more.
		this.pipeline((p) => (this.imageVeil = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: { module, entryPoint: "fsImageVeil", targets: [{ ...glowTarget, blend: over }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: glowSamples,
		});
		const post = d.createShaderModule({ code: POST });
		const postEntries: GPUBindGroupLayoutEntry[] = [
			{ binding: 0, visibility: STAGE.FRAGMENT, texture: {} },
			{ binding: 1, visibility: STAGE.FRAGMENT, sampler: {} },
			{ binding: 2, visibility: STAGE.FRAGMENT, buffer: {} },
		];
		this.postLayout = d.createBindGroupLayout({ entries: postEntries });
		this.compositeLayout = d.createBindGroupLayout({
			entries: [
				...postEntries,
				{ binding: 3, visibility: STAGE.FRAGMENT, texture: {} },
				{ binding: 4, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 5, visibility: STAGE.FRAGMENT, texture: {} },
			],
		});
		const postPipeline = d.createPipelineLayout({ bindGroupLayouts: [this.postLayout] });
		// Half floats, so the blur's long soft fall does not round into steps.
		const halfTarget = { format: "rgba16float" as const };
		this.pipeline((p) => (this.down = p), {
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsDown", targets: [halfTarget] },
			primitive: { topology: "triangle-list" },
		});
		this.pipeline((p) => (this.blur = p), {
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsBlur", targets: [halfTarget] },
			primitive: { topology: "triangle-list" },
		});
		this.pipeline((p) => (this.bright = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [this.compositeLayout] }),
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: {
				module: post,
				entryPoint: "fsBright",
				targets: [
					{
						...halfTarget,
						blend: {
							color: { srcFactor: "one", dstFactor: "one" },
							alpha: { srcFactor: "one", dstFactor: "one" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list" },
		});
		this.pipeline((p) => (this.composite = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [this.compositeLayout] }),
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsComposite", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list" },
			// Under the selection and the handles, in their pass: see draw.
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: this.samples },
		});
		this.sampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		// Across, down, and the strength the glow is added at.
		// The glow's blur across and down, the strength it is added at, and a
		// BlurEffect's blur of the frame across and down.
		// And the bloom's bright-pass: Threshold, exposure, steepness and strength.
		this.postParams = [0, 1, 2, 3, 4, 5, 6, 7].map(() =>
			d.createBuffer({ size: 16, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
		);
		this.gradeBuffer = d.createBuffer({ size: 32, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
		this.pipeline((p) => (this.blurFrame = p), {
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsBlur", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list" },
		});
		this.uniform = d.createBuffer({
			size: UNIFORM_MATERIALS + MATERIALS.length * 48,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		d.queue.writeBuffer(this.uniform, UNIFORM_MATERIALS, materialBlock());
		this.makeLooks(1);
		this.lookSampler = d.createSampler({
			addressModeU: "repeat",
			addressModeV: "repeat",
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
			maxAnisotropy: 4,
		});
		// Clamped, so a face's edge does not wrap round to its other side.
		this.skySampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		this.setSunImage(null);
		this.setSky(null);

		this.setScene(scene);
		const e = boxEdges();
		this.edges = {
			vertices: this.make(e.vertices, BUFFER.VERTEX),
			indices: this.make(e.indices, BUFFER.INDEX),
			indexCount: e.indices.length,
		};
		this.pickRead = d.createBuffer({ size: 256, usage: BUFFER.COPY_DST | BUFFER.MAP_READ });
		for (const kind of HANDLE_KINDS) {
			const m = handleMesh(kind);
			this.handleMeshes.push({
				kind,
				vertices: this.make(m.vertices, BUFFER.VERTEX),
				indices: this.make(m.indices, BUFFER.INDEX),
				indexCount: m.indices.length,
			});
		}
		this.resize(canvas.width, canvas.height);
		await this.compiled(progress);
	}

	setLighting(lighting: LightingParams): void {
		this.lighting = lighting;
		this.reflStale();
		const sun = lighting.sun.join(",");
		if (sun !== this.sunKey) {
			this.sunKey = sun;
			this.sunDirty = true;
		}
	}

	setHandles(handles: Handles): void {
		for (const h of this.handleDraws) h.buffer.destroy();
		this.handleDraws = [];
		this.handleMeshes.forEach((m, mesh) => {
			const data = handles[m.kind];
			const count = data.length / SCENE_STRIDE;
			if (count > 0) this.handleDraws.push({ mesh, buffer: this.make(data, BUFFER.VERTEX), count });
		});
	}

	setScene(scene: PlaceScene, moving = false): void {
		for (const d of [...this.draws, ...this.clear, ...this.glass, ...this.ghosts]) {
			for (const b of [d.vertices, d.indices, d.instances]) b.destroy();
			d.edges?.buffer.destroy();
		}
		this.scene = scene;
		// The sky's maps again only when the parts moved, not for an edit to Lighting,
		// and not while a drag is moving them: once, when it is let go.
		const key = sceneFingerprint(scene);
		if (!moving && key !== this.skyKey) {
			this.skyKey = key;
			this.skyDirty = true;
			this.box = sceneBox(scene);
		}
		this.setLights(scene.lights);
		if (this.skyImages && this.sunTexture) this.rebind();
		this.setImages(scene);
		this.effects?.setEffects(scene.effects);
		this.draws = [];
		this.clear = [];
		this.glass = [];
		this.clearEye = null;
		this.glowing = sceneGlows(scene);
		this.grainy = sceneGrainy(scene);
		const sets = seeThroughSets(scene, this.glassHides);
		const lit = new Set<number>();
		for (const h of scene.highlights ?? [])
			for (const id of [...h.parts, ...h.seeThrough]) lit.add(id);
		type Rows = { data: Float32Array; count: number };
		const add = (
			mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array },
			solid: Rows,
			seen: Rows,
			glass: Rows,
		) => {
			const shape = () => ({
				mesh,
				vertices: this.make(mesh.vertices, BUFFER.VERTEX),
				indices: this.make(mesh.indices, BUFFER.INDEX),
				indexCount: mesh.indices.length,
				format: (mesh.indices instanceof Uint32Array ? "uint32" : "uint16") as GPUIndexFormat,
			});
			if (glass.count > 0) {
				const chunked = chunkRows(glass.data, glass.count);
				this.glass.push({
					...shape(),
					instances: this.make(chunked.data, BUFFER.VERTEX),
					count: glass.count,
					highlighted: rowsIn(chunked.data, glass.count, lit),
					chunks: chunked.chunks,
				});
			}
			if (solid.count > 0) {
				// Sorted into chunks of nearby parts, for culling.
				const chunked = chunkRows(solid.data, solid.count);
				this.draws.push({
					...shape(),
					instances: this.make(chunked.data, BUFFER.VERTEX),
					count: solid.count,
					highlighted: rowsIn(chunked.data, solid.count, lit),
					chunks: chunked.chunks,
				});
			}
			if (seen.count > 0)
				this.clear.push({
					...shape(),
					instances: this.make(seen.data, BUFFER.VERTEX),
					count: seen.count,
					highlighted: rowsIn(seen.data, seen.count, lit),
					source: seen.data,
					sorted: new Float32Array(seen.data.length),
				});
		};
		for (const kind of SCENE_KINDS) {
			if (kind !== "mesh") {
				add(meshFor(kind), scene.kinds[kind], sets.clear[kind], sets.glass[kind]);
				continue;
			}
			// A MeshPart or FileMesh whose mesh is here draws it; the rest, their box.
			const ready = (slot: number) => this.meshes.has(slot);
			const solid = splitByMesh(scene.kinds.mesh, ready);
			const seen = splitByMesh(sets.clear.mesh, ready);
			const glass = splitByMesh(sets.glass.mesh, ready);
			add(meshFor("mesh"), solid.rest, seen.rest, glass.rest);
			const none = { data: new Float32Array(0), count: 0 };
			for (const [slot, mesh] of this.meshes)
				add(
					mesh,
					solid.meshes.get(slot) ?? none,
					seen.meshes.get(slot) ?? none,
					glass.meshes.get(slot) ?? none,
				);
		}
		this.ghosts = [];
		const ghost = (
			mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array },
			rows: { data: Float32Array; count: number },
		) => {
			if (rows.count === 0) return;
			this.ghosts.push({
				mesh,
				vertices: this.make(mesh.vertices, BUFFER.VERTEX),
				indices: this.make(mesh.indices, BUFFER.INDEX),
				indexCount: mesh.indices.length,
				format: mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
				instances: this.make(rows.data, BUFFER.VERTEX),
				count: rows.count,
				highlighted: true,
			});
		};
		const ghosts = scene.ghosts;
		if (ghosts)
			for (const kind of SCENE_KINDS) {
				if (kind !== "mesh") {
					ghost(meshFor(kind), ghosts[kind]);
					continue;
				}
				const split = splitByMesh(ghosts.mesh, (slot) => this.meshes.has(slot));
				ghost(meshFor("mesh"), split.rest);
				for (const [slot, mesh] of this.meshes) {
					const rows = split.meshes.get(slot);
					if (rows) ghost(mesh, rows);
				}
			}
		this.setHighlights(scene.highlights);
	}

	// -- Highlight instances: a mask of the parts each covers, then its fill and outline --

	/** The highlights' rows and colours on the GPU; null, none in the place. */
	private hl: {
		rows: GPUBuffer;
		params: GPUBuffer;
		data: Float32Array;
		onTop: boolean;
		occluded: boolean;
	} | null = null;
	/** The mask, its pipelines and their groups, made when first drawn. */
	private hlMask?: GPUTexture;
	private hlPipes?: {
		samples: number;
		onTop: GPURenderPipeline;
		occluded: GPURenderPipeline;
		rows: GPURenderPipeline;
		overlay: GPURenderPipeline;
		maskLayout: GPUBindGroupLayout;
		rowsLayout: GPUBindGroupLayout;
		overlayLayout: GPUBindGroupLayout;
	};
	/**
	 * Along each row, the nearest highlighted pixel within the outline's
	 * width: its Highlight, and how far plus one (0, none). The overlay looks
	 * up and down these, so the outline is 2 x (2r + 1) reads a pixel rather
	 * than (2r + 1)^2: 81 at a Retina screen's 4 pixel outline, about 5 ms of
	 * an iPad Mini's frame (Benchmark 1).
	 */
	private hlRows?: GPUTexture;
	private hlGroups: { mask: GPUBindGroup; rows: GPUBindGroup; overlay: GPUBindGroup } | null = null;
	/** The parts' shader module and vertex buffers, for pipelines made later. */
	private partModule?: GPUShaderModule;
	private partBuffers?: GPUVertexBufferLayout[];

	private setHighlights(list: readonly SceneHighlight[] | undefined): void {
		this.hl?.rows.destroy();
		this.hl?.params.destroy();
		this.hl = null;
		this.hlGroups = null;
		if (!list || list.length === 0) return;
		const shown = list.slice(0, HIGHLIGHT_LIMIT);
		let top = 0;
		for (const h of shown) for (const id of [...h.parts, ...h.seeThrough]) top = Math.max(top, id);
		const rows = new Uint32Array(top + 1);
		// Slot 0 unused; then each slot's fill and outline, then the info vec4.
		const data = new Float32Array(32 * 8 + 4);
		shown.forEach((h, i) => {
			const slot = i + 1;
			const top = h.onTop ? 512 : 0;
			for (const id of h.parts) rows[id] = slot | top;
			for (const id of h.seeThrough) rows[id] = slot | top | 256;
			data.set(
				[...h.fill, 1 - h.fillTransparency, ...h.outline, 1 - h.outlineTransparency],
				slot * 8,
			);
		});
		const params = this.device.createBuffer({
			size: data.byteLength,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		this.hl = {
			rows: this.make(rows, BUFFER.STORAGE),
			params,
			data,
			onTop: shown.some((h) => h.onTop),
			occluded: shown.some((h) => !h.onTop),
		};
	}

	/** The mask's two pipelines and the overlay's, for this view's samples. */
	private highlightPipes(): NonNullable<WebGpuView["hlPipes"]> | null {
		if (this.hlPipes?.samples === this.samples) return this.hlPipes;
		const module = this.partModule;
		const buffers = this.partBuffers;
		if (!module || !buffers) return null;
		const d = this.device;
		const maskLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 2, visibility: STAGE.VERTEX, buffer: { type: "read-only-storage" } },
				{ binding: 3, visibility: STAGE.VERTEX, buffer: {} },
			],
		});
		const mask = (onTop: boolean) =>
			d.createRenderPipeline({
				layout: d.createPipelineLayout({ bindGroupLayouts: [this.layout, maskLayout] }),
				vertex: { module, entryPoint: "vsMask", buffers, constants: { HL_ON_TOP: onTop ? 1 : 0 } },
				fragment: { module, entryPoint: "fsMask", targets: [{ format: "r8uint" }] },
				primitive: { topology: "triangle-list", cullMode: "back" },
				// Occluded: where the part is the nearest thing drawn, as the parts' own depths say.
				depthStencil: {
					format: "depth32float",
					depthWriteEnabled: false,
					depthCompare: onTop ? "always" : "greater-equal",
				},
				multisample: { count: this.samples },
			});
		const many = this.samples > 1;
		const overlayModule = d.createShaderModule({
			code: /* wgsl */ `
struct HlSlot { fill: vec4f, outline: vec4f };
struct HlU { slots: array<HlSlot, 32>, info: vec4f };
@group(0) @binding(0) var mask: ${many ? "texture_multisampled_2d<u32>" : "texture_2d<u32>"};
@group(0) @binding(1) var<uniform> hl: HlU;
@group(0) @binding(2) var rows: texture_2d<u32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
	let q = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	return vec4f(q * 2.0 - 1.0, 0.0, 1.0);
}
fn at(c: vec2i) -> u32 {
	let size = vec2i(textureDimensions(mask));
	if (any(c < vec2i(0)) || any(c >= size)) { return 0u; }
	return textureLoad(mask, c, 0).r;
}
// Along the row: the nearest highlighted pixel within the outline's width,
// its Highlight and how far, plus one; (0, 0) where there is none.
@fragment fn fsRows(@builtin(position) pos: vec4f) -> @location(0) vec4u {
	let c = vec2i(pos.xy);
	let n = i32(ceil(hl.info.y));
	var best = 0u;
	var far = 1000;
	for (var dx = -n; dx <= n; dx++) {
		let t = at(c + vec2i(dx, 0));
		if (t != 0u && abs(dx) < far) { best = t; far = abs(dx); }
	}
	return vec4u(best, select(0u, u32(far) + 1u, best != 0u), 0u, 0u);
}
// Over the finished picture: the fill where a Highlight's parts are; its
// outline in the pixels just outside them, hl.info.y wide (2 of the page's
// pixels, as Studio's), the nearest Highlight's: the rows' nearest, up and
// down, by their distance.
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	let c = vec2i(pos.xy);
	let s = at(c);
	if (s != 0u) {
		let f = hl.slots[s].fill;
		if (f.a <= 0.0) { discard; }
		return f;
	}
	let r = hl.info.y;
	let n = i32(ceil(r));
	let size = vec2i(textureDimensions(rows));
	var best = 0u;
	var near = 1e9;
	for (var dy = -n; dy <= n; dy++) {
		let q = c + vec2i(0, dy);
		if (q.y < 0 || q.y >= size.y) { continue; }
		let row = textureLoad(rows, q, 0);
		if (row.g == 0u) { continue; }
		let dx = f32(row.g - 1u);
		let d = dx * dx + f32(dy * dy);
		if (d > r * r + 0.5 || d >= near) { continue; }
		best = row.r;
		near = d;
	}
	if (best == 0u) { discard; }
	let o = hl.slots[best].outline;
	if (o.a <= 0.0) { discard; }
	return o;
}`,
		});
		const rowsLayout = d.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "uint", multisampled: many },
				},
				{ binding: 1, visibility: STAGE.FRAGMENT, buffer: {} },
			],
		});
		const rows = d.createRenderPipeline({
			layout: d.createPipelineLayout({ bindGroupLayouts: [rowsLayout] }),
			vertex: { module: overlayModule, entryPoint: "vs" },
			fragment: { module: overlayModule, entryPoint: "fsRows", targets: [{ format: "rg8uint" }] },
			primitive: { topology: "triangle-list" },
		});
		const overlayLayout = d.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "uint", multisampled: many },
				},
				{ binding: 1, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 2, visibility: STAGE.FRAGMENT, texture: { sampleType: "uint" } },
			],
		});
		const overlay = d.createRenderPipeline({
			layout: d.createPipelineLayout({ bindGroupLayouts: [overlayLayout] }),
			vertex: { module: overlayModule, entryPoint: "vs" },
			fragment: {
				module: overlayModule,
				entryPoint: "fs",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "zero", dstFactor: "one" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list" },
		});
		this.hlPipes = {
			samples: this.samples,
			onTop: mask(true),
			occluded: mask(false),
			rows,
			overlay,
			maskLayout,
			rowsLayout,
			overlayLayout,
		};
		this.hlGroups = null;
		return this.hlPipes;
	}

	/**
	 * The Highlights over the finished picture in `target`: the parts each
	 * covers into the mask, tested against the parts' depth where it is
	 * Occluded, then its fill and outline blended over. As Studio's, measured.
	 */
	private drawHighlights(encoder: GPUCommandEncoder, target: GPUTextureView): void {
		const hl = this.hl;
		const pipes = this.highlightPipes();
		if (!hl || !pipes || !this.depth) return;
		const d = this.device;
		const mask = this.hlMask;
		if (
			!mask ||
			mask.width !== this.width ||
			mask.height !== this.height ||
			mask.sampleCount !== this.samples
		) {
			mask?.destroy();
			this.hlRows?.destroy();
			this.hlMask = d.createTexture({
				size: [this.width, this.height],
				format: "r8uint",
				sampleCount: this.samples,
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
			this.hlRows = d.createTexture({
				size: [this.width, this.height],
				format: "rg8uint",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
			this.hlGroups = null;
		}
		const view = this.hlMask!.createView();
		const rowsView = this.hlRows!.createView();
		if (!this.hlGroups)
			this.hlGroups = {
				mask: d.createBindGroup({
					layout: pipes.maskLayout,
					entries: [
						{ binding: 2, resource: { buffer: hl.rows } },
						{ binding: 3, resource: { buffer: hl.params } },
					],
				}),
				rows: d.createBindGroup({
					layout: pipes.rowsLayout,
					entries: [
						{ binding: 0, resource: view },
						{ binding: 1, resource: { buffer: hl.params } },
					],
				}),
				overlay: d.createBindGroup({
					layout: pipes.overlayLayout,
					entries: [
						{ binding: 0, resource: view },
						{ binding: 1, resource: { buffer: hl.params } },
						{ binding: 2, resource: rowsView },
					],
				}),
			};
		const seeThrough = featureOn(this.render.features, "seeThroughHighlights");
		// The outline 2 of the page's pixels wide, as Studio's at 100%: more of the canvas's on a Retina screen.
		const css = this.canvas?.clientWidth || this.width;
		const wide = Math.max(1, Math.min(4, (2 * this.width) / Math.max(1, css)));
		hl.data.set([seeThrough ? 1 : 0, wide, 0, 0], 32 * 8);
		d.queue.writeBuffer(hl.params, 0, hl.data);
		const pass = encoder.beginRenderPass({
			timestampWrites: this.stamp(null),
			colorAttachments: [
				{ view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
			],
			depthStencilAttachment: {
				view: this.depth.createView(),
				depthLoadOp: "load",
				depthStoreOp: "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setBindGroup(1, this.hlGroups.mask);
		const lists = [this.draws, this.glass, this.clear, ...(seeThrough ? [this.ghosts] : [])].map(
			(list) => list.filter((draw) => draw.highlighted),
		);
		for (const [on, pipe] of [
			[hl.occluded, pipes.occluded],
			[hl.onTop, pipes.onTop],
		] as const) {
			if (!on) continue;
			pass.setPipeline(pipe);
			for (const list of lists) this.solids(pass, list, true);
		}
		pass.end();
		const along = encoder.beginRenderPass({
			timestampWrites: this.stamp(null),
			colorAttachments: [
				{
					view: rowsView,
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		along.setPipeline(pipes.rows);
		along.setBindGroup(0, this.hlGroups.rows);
		along.draw(3);
		along.end();
		const over = encoder.beginRenderPass({
			timestampWrites: this.stamp(null),
			colorAttachments: [{ view: target, loadOp: "load", storeOp: "store" }],
		});
		over.setPipeline(pipes.overlay);
		over.setBindGroup(0, this.hlGroups.overlay);
		over.draw(3);
		over.end();
	}

	/** The meshes rows name, by their place in the scene's list. */
	private meshes: ReadonlyMap<number, MeshGeometry> = new Map();

	setMeshes(meshes: ReadonlyMap<number, MeshGeometry>): void {
		this.meshes = meshes;
		this.skyDirty = true;
		if (this.scene) this.setScene(this.scene);
	}

	/** The see-through parts sorted again when the camera has moved. */
	private sortClear(eye: number[]): void {
		const was = this.clearEye;
		if (was && Math.hypot(eye[0] - was[0], eye[1] - was[1], eye[2] - was[2]) < 0.01) return;
		this.clearEye = [...eye];
		for (const c of this.clear) {
			backToFront(c.source, c.count, eye, c.sorted);
			this.device.queue.writeBuffer(c.instances, 0, c.sorted);
		}
	}

	setOverlay(lines: Float32Array): void {
		this.overlay?.buffer.destroy();
		const count = lines.length / 6;
		this.overlay = count > 0 ? { buffer: this.make(lines, BUFFER.VERTEX), count } : null;
	}

	// Writes are in whole words, and an index list can end halfway through one.
	private make(bytes: ArrayBufferView, usage: number): GPUBuffer {
		const size = Math.max(4, Math.ceil(bytes.byteLength / 4) * 4);
		const b = this.device.createBuffer({ size, usage: usage | BUFFER.COPY_DST });
		const padded = new Uint8Array(size);
		padded.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		this.device.queue.writeBuffer(b, 0, padded);
		return b;
	}

	resize(width: number, height: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.makeLampTargets();
		if (this.bind) this.rebind();
		this.makeAaTargets();
		this.makeUpTargets();
		for (const t of [
			this.msaa,
			this.depth,
			this.pickTarget,
			this.pickDepth,
			this.frame,
			this.frameAcross,
			this.glowFull,
		])
			t?.destroy();
		const size = [this.width, this.height];
		const d = this.device;
		this.msaa = d.createTexture({
			size,
			sampleCount: this.samples,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT,
		});
		this.depth = d.createTexture({
			size,
			sampleCount: this.samples,
			format: "depth32float",
			// Read by occlusion's depth image: see drawFar.
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		// The place drawn and resolved, for the glow to be added to, and the
		// glow's own source, resolved the same way.
		this.frame = d.createTexture({
			size,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		this.frameAcross = d.createTexture({
			size,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		const blurGroup = (tex: GPUTexture, params: GPUBuffer) =>
			d.createBindGroup({
				layout: this.postLayout,
				entries: [
					{ binding: 0, resource: tex.createView() },
					{ binding: 1, resource: this.sampler },
					{ binding: 2, resource: { buffer: params } },
				],
			});
		this.frameBlurGroups = [
			blurGroup(this.frame, this.postParams[3]),
			blurGroup(this.frameAcross, this.postParams[4]),
		];
		// Its bind groups name the source just made: made again with it.
		for (const t of [this.glow?.a, this.glow?.b, this.glow?.c, this.glow?.d]) t?.destroy();
		this.glow = undefined;
		this.pickTarget = d.createTexture({
			size,
			format: "r32uint",
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.COPY_SRC,
		});
		this.pickDepth = d.createTexture({
			size,
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT,
		});
		this.makeGlowSource();
	}

	/** The glow's targets, half the view's size, and what reads them. */
	private sizeGlow(): void {
		// A quarter of the view where it is drawn at more pixels than the screen has points.
		const share = this.quality.glowCoarse ? 4 : 2;
		const w = Math.max(1, Math.round(this.width / share));
		const h = Math.max(1, Math.round(this.height / share));
		if (this.glow && this.glow.w === w && this.glow.h === h) return;
		const d = this.device;
		for (const t of [this.glow?.a, this.glow?.b, this.glow?.c, this.glow?.d]) t?.destroy();
		const target = () =>
			d.createTexture({
				size: [w, h],
				format: "rgba16float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
		const a = target();
		const b = target();
		// The wide blur at a quarter of the view's size: its input is the narrow
		// blur, with nothing fine left to lose, and a quarter of the pixels at
		// half the taps cost an eighth. At an iPad's Native it was 27 reads a
		// half-size pixel each way, most of what Neon's glow cost a frame.
		const qw = Math.max(1, Math.round(w / 2));
		const qh = Math.max(1, Math.round(h / 2));
		const quarter = () =>
			d.createTexture({
				size: [qw, qh],
				format: "rgba16float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
		const c = quarter();
		const spare = quarter();
		this.shapeSpread = -1;
		const group = (tex: GPUTexture, params: GPUBuffer) =>
			d.createBindGroup({
				layout: this.postLayout,
				entries: [
					{ binding: 0, resource: tex.createView() },
					{ binding: 1, resource: this.sampler },
					{ binding: 2, resource: { buffer: params } },
				],
			});
		// The source averaged down into A, A across into B, and B down into A,
		// which is added over the frame.
		// The source down to a; blurred narrow across into b and down into a;
		// then a blurred on across into the quarter-size spare and down into c,
		// the wide blur.
		const groups = [
			group(this.glowFull!, this.postParams[0]),
			group(a, this.postParams[0]),
			group(b, this.postParams[1]),
			group(a, this.postParams[5]),
			group(spare, this.postParams[6]),
		];
		// The bloom's bright-pass: Neon's glow source and the finished frame.
		const bright = d.createBindGroup({
			layout: this.compositeLayout,
			entries: [
				{ binding: 0, resource: this.glowFull!.createView() },
				{ binding: 1, resource: this.sampler },
				{ binding: 2, resource: { buffer: this.postParams[7] } },
				{ binding: 3, resource: this.frame!.createView() },
				{ binding: 4, resource: { buffer: this.gradeBuffer } },
				{ binding: 5, resource: c.createView() },
			],
		});
		this.glow = { a, b, c, d: spare, qw, qh, groups, bright, w, h };
	}

	/**
	 * The place drawn in the light it gives off, under the see-through parts
	 * and the Decals and Textures that cover it, in the frame's own targets
	 * before the frame is; then averaged down to half and blurred both ways.
	 */
	private drawGlow(encoder: GPUCommandEncoder): void {
		const glow = this.glow;
		if (!glow || !this.glowFull) return;
		const pass = encoder.beginRenderPass({
			timestampWrites: this.stamp("post"),
			colorAttachments: [
				{
					...this.into(this.glowFull.createView()),
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: "clear",
				},
			],
			depthStencilAttachment: {
				view: (this.glowDepth ?? this.depth!).createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.glowSolid);
		this.solids(pass);
		if (this.glass.length > 0) {
			pass.setPipeline(this.glowGlassDepth);
			this.solids(pass, this.glass);
		}
		if (this.clear.length > 0) {
			pass.setPipeline(this.glowSeen);
			this.solids(pass, this.clear);
		}
		this.veilImages(pass);
		pass.end();
		this.glowSteps(encoder, [[this.down, 0, glow.a, false]]);
	}

	/**
	 * The glow blurred, once the place is drawn: narrow across and down, then on
	 * to the wide; with `bloom`, the finished frame's bright-pass added to its
	 * source first.
	 */
	private blurGlow(encoder: GPUCommandEncoder, bloom: boolean): void {
		const glow = this.glow;
		if (!glow) return;
		const steps: [GPURenderPipeline, number, GPUTexture, boolean][] = [];
		if (bloom) steps.push([this.bright, -1, glow.a, true]);
		steps.push([this.blur, 1, glow.b, false], [this.blur, 2, glow.a, false]);
		steps.push([this.blur, 3, glow.d, false], [this.blur, 4, glow.c, false]);
		this.glowSteps(encoder, steps);
	}

	private glowSteps(
		encoder: GPUCommandEncoder,
		steps: readonly (readonly [GPURenderPipeline, number, GPUTexture, boolean])[],
	): void {
		const glow = this.glow;
		if (!glow) return;
		for (const [pipeline, from, into, add] of steps) {
			const step = encoder.beginRenderPass({
				timestampWrites: this.stamp("post"),
				colorAttachments: [
					{
						view: into.createView(),
						loadOp: add ? "load" : "clear",
						storeOp: "store",
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
					},
				],
			});
			step.setPipeline(pipeline);
			step.setBindGroup(0, from < 0 ? glow.bright : glow.groups[from]);
			step.draw(3);
			step.end();
		}
	}

	/** A BlurEffect: the frame blurred across into its spare, and back down into itself. */
	private blurTheFrame(encoder: GPUCommandEncoder): void {
		const size = this.lighting?.post.blur ?? 0;
		if (size <= 0 || !this.frame || !this.frameAcross) return;
		const sigma = blurSigma(size, this.height);
		const q = this.device.queue;
		q.writeBuffer(this.postParams[3], 0, new Float32Array([1 / this.width, 0, 0, sigma]));
		q.writeBuffer(this.postParams[4], 0, new Float32Array([0, 1 / this.height, 0, sigma]));
		for (const [from, into] of [
			[0, this.frameAcross],
			[1, this.frame],
		] as const) {
			const step = encoder.beginRenderPass({
				timestampWrites: this.stamp("post"),
				colorAttachments: [
					{
						view: into.createView(),
						loadOp: "clear",
						storeOp: "store",
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
					},
				],
			});
			step.setPipeline(this.blurFrame);
			step.setBindGroup(0, this.frameBlurGroups[from]);
			step.draw(3);
			step.end();
		}
	}

	setSelection(boxes: Float32Array): void {
		this.selection?.buffer.destroy();
		const count = boxes.length / SCENE_STRIDE;
		this.selection = count > 0 ? { buffer: this.make(boxes, BUFFER.VERTEX), count } : null;
	}

	/** The textures' mip bias: see U.lod. */
	private lodBias = 0;

	private setCamera(camera: Camera): void {
		const vp = jitterClip(
			multiply(
				perspective(FOV, this.width / this.height, camera.near, camera.far, true, true),
				lookAt(camera.eye, camera.at),
			),
			this.jitter,
			this.width,
			this.height,
		);
		const u = new Float32Array(UNIFORM_MATERIALS / 4);
		u.set(vp, 0);
		u.set(invert(vp), 16);
		u.set(lightingBlock(this.lighting, camera.eye, SELECT, HANDLE_ALPHA), 32);
		const skyImages = this.skyOn && passesOf(this.render.features).skyImages;
		const sky = skyImages ? (this.lighting.skyboxSun ? 2 : 1) : 0;
		u.set([this.width, this.height, this.band(), sky], 76);
		u.set(this.shape.gate, 80);
		u.set(renderDebug(this.render), 84);
		u.set([this.lodBias, 0, 0, 0], 88);
		this.device.queue.writeBuffer(this.uniform, 0, u);
	}

	private solids(pass: GPURenderPassEncoder, draws: Draw[] = this.draws, all = false): void {
		for (const draw of draws) {
			const runs = all ? undefined : this.runs.get(draw);
			if (runs && runs.length === 0) continue;
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.indices, draw.format);
			if (!runs) {
				pass.drawIndexed(draw.indexCount, draw.count);
				this.tally.draws++;
				continue;
			}
			for (let i = 0; i < runs.length; i += 2)
				pass.drawIndexed(draw.indexCount, runs[i + 1], 0, 0, runs[i]);
			this.tally.draws += runs.length / 2;
		}
	}

	draw(camera: Camera, still = false): void {
		const started = performance.now();
		this.cpuEffects = 0;
		this.cpuCulling = 0;
		// Still-frame TAA: a frame aside by a fraction of a pixel, while the
		// camera and the place are as they were; otherwise a fresh one.
		const aaPass = antialiasInfo(this.aaMode).pass;
		// Upscaling gathers still frames' samples itself: TAA's own average is not drawn as well.
		const up = this.upscaling();
		this.taaWeight = 1;
		this.jitter = [0, 0];
		let upStep: UpStep = { fresh: true, settled: false, moving: false };
		if (aaPass === "taa" || up) {
			const moving = this.effects?.last.moving ?? false;
			const step = this.still.next(
				still,
				`${camera.eye.join(",")} ${camera.at.join(",")} ${this.width}x${this.height} ${up ? `${this.upOut?.width}x${this.upOut?.height}` : ""}`,
				moving,
			);
			this.jitter = step.jitter;
			this.taaWeight = step.weight;
			upStep = { fresh: this.still.count <= 1, settled: step.weight === 0, moving };
		}
		// Gathered still frames: textures as sharp as the screen's pixels, and
		// no pass over each frame, as the gathering smooths the edges itself.
		const gathering = up && !upStep.fresh;
		this.lodBias = gathering ? Math.log2(this.width / (this.upOut?.width ?? this.width)) : 0;
		this.tally = { draws: 0, instances: 0, triangles: 0 };
		const { mode } = this.render;
		const show = passesOf(this.render.features);
		const heat = sharesView(mode);
		const wire = mode === "wireframe";
		// Highlight instances, over the picture as Studio draws them: not on a heatmap or the wireframe.
		const hlOn =
			this.hl !== null && !heat && !wire && featureOn(this.render.features, "highlightObjects");
		// The heatmaps and the wireframe are the place's shapes alone; the sun
		// maps' tints are left as they are drawn.
		const tinted = mode === "sunMaps";
		// A probe is the parts alone: no glow or post pass over them.
		const postOn = this.postOn && show.post && !heat && !wire && !tinted && !this.probe;
		this.shape = glowShape(this.lighting?.post, postOn);
		this.setCamera(camera);
		let encoder = this.device.createCommandEncoder();
		const lit = this.litFor(this.litBits());
		const clock = this.clock;
		clock?.start();
		const canvasView = this.context.getCurrentTexture().createView();
		// Everything is drawn into the frame the render scale's size; upscaled, that is not the canvas.
		const final = up ? this.upIn!.createView() : canvasView;
		if (this.probe === "empty") {
			this.drawEmpty(encoder, started, final, up ? canvasView : null);
			return;
		}
		const partsMoved = this.skyDirty;
		const sunMoved = this.sunDirty;
		const centre = nearSkyCentre(
			camera.eye,
			this.nearFill?.centre ?? this.nearCentre,
			this.heading.update(camera.eye),
		);
		const nearMoved = !this.nearCentre || centre.some((v, a) => v !== this.nearCentre![a]);
		// The place or the sun changed, or nothing drawn yet: every map at once.
		// The camera moved on alone: the near maps a share a frame (nearFillStep).
		const mapsDue = this.skyDirty || this.sunDirty || !this.nearCentre;
		if (!mapsDue && (nearMoved || this.nearFill)) encoder = this.nearFillStep(encoder, centre);
		if (mapsDue) this.nearFill = null;
		if (mapsDue)
			encoder = this.drawSkyMaps(
				encoder,
				{
					far: this.skyDirty,
					sun: this.skyDirty || this.sunDirty,
					near: this.skyDirty || nearMoved,
				},
				centre,
			);
		// While the stages are profiled, the sun's maps are drawn every frame,
		// as when the camera moves: a still camera draws them only once.
		this.drawCascades(encoder, camera, partsMoved || this.clock !== null);
		// The parts moved or the light changed: the cube shows them again. Not
		// when only the near maps moved with the camera: the cube follows it
		// by PROBE_STEP, and the near maps changed what it showed by little.
		if (partsMoved || sunMoved) this.reflStale();
		this.drawReflections(encoder, camera);
		encoder = this.cut(encoder, "shadows");
		// The camera's passes from here draw only the chunks in view.
		const culling = performance.now();
		this.cull(camera, [...this.draws, ...this.glass]);
		this.cpuCulling += performance.now() - culling;
		// The lights at half size, before the passes that read them.
		if (this.litBits() & FEATURE_BIT.halfLamps && !this.probe && !heat && !wire)
			this.drawLamps(encoder, lit.lamps);
		// Occlusion: the solid parts' depth first, in a pass of its own.
		const passes = passesOf(this.render.features);
		// Made in every view, so occlusion works in each; only the picture's
		// and the wireframe's passes go on from its depth.
		const lean = this.leanDepth();
		const early = passes.occlusion && !lean;
		const load = early && mode !== "overdraw" && mode !== "density";
		// Antialiasing by a pass over the frame: everything is drawn into its
		// input, and the pass draws the canvas.
		const aaOn =
			aaPass !== "none" &&
			!(aaPass === "taa" && up) &&
			!gathering &&
			!!this.aaColour &&
			!this.probe;
		const screen = aaOn ? this.aaColour!.createView() : final;
		// A BloomEffect blooms the whole picture, Neon or not: see fsBright.
		const bloom = postOn && !!this.lighting?.post.bloom && show.glow && !heat && !wire && !tinted;
		const glowing =
			(this.glowing || bloom) &&
			!!this.glow &&
			show.glow &&
			!heat &&
			!wire &&
			!tinted &&
			!this.probe;
		const post = postActive(this.lighting?.post, postOn);
		// The place is drawn into its own texture first when anything is added
		// to it after: Neon's glow, or a post effect; or a heatmap's colours.
		const glow = glowing || post || heat ? this.compositeGroup : undefined;
		const q = this.device.queue;
		q.writeBuffer(
			this.postParams[2],
			0,
			new Float32Array([0, 0, glowing ? this.shape.gain : 0, sharesComposite(mode)]),
		);
		if (this.glow && this.shapeSpread !== this.shape.spread) {
			const { w, h, qw, qh } = this.glow;
			const spread = glowSpread(h, this.shape);
			// The narrow blur, then what takes it on to the wide one.
			const narrow = spread * GLOW_NARROW.width;
			const more = spread * Math.sqrt(GLOW_WIDE.width ** 2 - GLOW_NARROW.width ** 2);
			q.writeBuffer(this.postParams[0], 0, new Float32Array([1 / w, 0, 0, narrow]));
			q.writeBuffer(this.postParams[1], 0, new Float32Array([0, 1 / h, 0, narrow]));
			// The wide blur's own, a quarter of the view: its texels twice as wide.
			const moreQ = (more * qh) / h;
			q.writeBuffer(this.postParams[5], 0, new Float32Array([1 / qw, 0, 0, moreQ]));
			q.writeBuffer(this.postParams[6], 0, new Float32Array([0, 1 / qh, 0, moreQ]));
			this.shapeSpread = this.shape.spread;
		}
		q.writeBuffer(this.gradeBuffer, 0, gradeBlock(this.lighting?.post, postOn));
		if (glowing) {
			if (this.clear.length > 0) this.sortClear(camera.eye);
			this.drawGlow(encoder);
			encoder = this.cut(encoder, "glowSources");
		}
		// After the glow, which clears the same depth for its own pass.
		const readBack =
			passes.occlusion && (lean ? this.drawFarSmall(encoder) : this.drawFar(encoder));
		if (passes.occlusion) encoder = this.cut(encoder, "occlusion");
		let pass = encoder.beginRenderPass({
			timestampWrites: this.stamp("scene"),
			colorAttachments: [
				{
					...this.into(glow ? this.frame!.createView() : screen),
					clearValue: heat
						? { r: 0, g: 0, b: 0, a: 1 }
						: wire
							? { r: 0.06, g: 0.07, b: 0.09, a: 1 }
							: show.sky
								? { r: 0.56, g: 0.71, b: 0.86, a: 1 }
								: { r: 0.16, g: 0.17, b: 0.19, a: 1 },
					loadOp: "clear",
				},
			],
			depthStencilAttachment: {
				view: this.depth!.createView(),
				depthClearValue: 0,
				depthLoadOp: load ? "load" : "clear",
				// Kept for the glow, and for a Highlight with DepthMode Occluded.
				depthStoreOp: glow || hlOn ? "store" : "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		const images = show.images && !heat;
		if (show.sky && !heat && !wire) {
			pass.setPipeline(this.skyPipeline);
			pass.draw(3);
		}
		if (wire) {
			pass.setPipeline(this.wire);
			this.wires(
				pass,
				show.seeThrough ? [...this.draws, ...this.glass, ...this.clear] : this.draws,
			);
			// The wireframe is the place's shapes alone: no effects, and nothing to animate.
			this.drawEffects(pass, camera);
		} else if (mode === "overdraw") {
			this.drawOverdraw(pass, camera);
		} else if (mode === "density") {
			this.drawDensity(pass);
			// None drawn: the parts alone; this only clears the last frame's count.
			this.drawEffects(pass, camera);
		} else if (this.probe === "depth") {
			// A profile's: the parts' depth alone, no colour worked out for any pixel.
			pass.setPipeline(this.solidDepth);
			this.solids(pass);
		} else {
			// The solid parts' depth, unless occlusion's pass has drawn it, or
			// the lean path shades and tests depth in one draw.
			if (!load && !lean) {
				pass.setPipeline(this.solidDepth);
				this.solids(pass);
			}
			pass.setPipeline(lean ? lit.solidWrite : lit.solid);
			this.solids(pass);
			this.count(this.draws);
			if (images) this.drawImages(pass, "solid", camera.eye);
			if (show.seeThrough && heat) {
				// Each see-through layer adds its own share, Glass's included.
				pass.setPipeline(this.heatAdded);
				this.solids(pass, this.glass);
				this.solids(pass, this.clear);
				this.count(this.glass);
				this.count(this.clear);
			} else if (show.seeThrough) {
				if (this.glass.length > 0) {
					pass.setPipeline(this.glassDepth);
					this.solids(pass, this.glass);
					pass.setPipeline(lit.glassBlended);
					this.solids(pass, this.glass);
					this.count(this.glass);
				}
				if (this.clear.length > 0) {
					this.sortClear(camera.eye);
					pass.setPipeline(lit.blended);
					this.solids(pass, this.clear);
					this.count(this.clear);
				}
			}
			// Over the see-through parts they are on.
			if (images) this.drawImages(pass, "seeThrough", camera.eye);
			// Beams and particles, over everything see-through, farthest first.
			this.drawEffects(pass, camera);
		}
		// The glow is part of the place, added once the place is drawn; what
		// marks the place goes over it, against the place's own depth.
		if (glow) {
			pass.end();
			encoder = this.cut(encoder, "place");
			if (glowing) {
				const b = this.lighting?.post.bloom;
				q.writeBuffer(
					this.postParams[7],
					0,
					new Float32Array([bloomStart(b?.threshold ?? 2), 0, BLOOM_STEEP, BLOOM_STRENGTH]),
				);
				this.blurGlow(encoder, bloom);
			}
			if (post) this.blurTheFrame(encoder);
			pass = encoder.beginRenderPass({
				timestampWrites: this.stamp("post"),
				colorAttachments: [
					{
						...this.into(screen),
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						loadOp: "clear",
					},
				],
				depthStencilAttachment: {
					view: this.depth!.createView(),
					depthLoadOp: "load",
					depthStoreOp: hlOn ? "store" : "discard",
				},
			});
			pass.setPipeline(this.composite);
			pass.setBindGroup(0, glow);
			pass.draw(3);
			pass.setBindGroup(0, this.bind);
		}
		if (this.selection) {
			pass.setPipeline(this.hideBehind ? this.linesBehind : this.lines);
			pass.setVertexBuffer(0, this.edges.vertices);
			pass.setVertexBuffer(1, this.selection.buffer);
			pass.setIndexBuffer(this.edges.indices, "uint16");
			pass.drawIndexed(this.edges.indexCount, this.selection.count);
		}
		if (this.handleDraws.length > 0) {
			pass.setPipeline(this.handle);
			for (const h of this.handleDraws) {
				const m = this.handleMeshes[h.mesh];
				pass.setVertexBuffer(0, m.vertices);
				pass.setVertexBuffer(1, h.buffer);
				pass.setIndexBuffer(m.indices, "uint16");
				pass.drawIndexed(m.indexCount, h.count);
			}
		}
		if (this.overlay) {
			pass.setPipeline(this.over);
			pass.setVertexBuffer(0, this.overlay.buffer);
			pass.draw(this.overlay.count);
		}
		pass.end();
		if (aaOn) this.antialiasPasses(encoder, final);
		if (hlOn) this.drawHighlights(encoder, final);
		let last: Stage = glow ? "composite" : "place";
		if (up) {
			this.stampsAre(last);
			encoder = this.cut(encoder, last);
			this.upscalePasses(encoder, canvasView, upStep);
			last = "upscale";
		}
		this.stampsAre(last);
		const read = this.readStamps(encoder);
		this.device.queue.submit([encoder.finish()]);
		if (clock) {
			clock.submitted(last, this.device.queue.onSubmittedWorkDone());
			clock.end();
		}
		read?.();
		if (readBack) this.readFar();
		this.lastTally = this.tally;
		this.runs.clear();
		this.cpuMs = performance.now() - started;
		this.cpuSteps = {
			effects: this.cpuEffects,
			culling: this.cpuCulling,
			...(this.effects && this.cpuEffects > 0 ? { fx: this.effects.steps() } : {}),
		};
	}

	settled(): Promise<void> {
		return this.device.queue.onSubmittedWorkDone();
	}

	/**
	 * Profiling, stage by stage: see `profile.ts`. Each stage's commands are
	 * submitted on their own, and the queue says when each is done. The sky,
	 * the parts, the images and the effects share one pass here, so they are
	 * one stage; the steps sweep tells them apart.
	 */
	private clock: QueueClock | null = null;
	private gpuName = "";

	setProfiling(sink: StageSink | null, gpu: StageSink | null = null): void {
		this.clock = sink ? new QueueClock(sink) : null;
		// The GPU's times alone (no sink) leave the frame in one submission.
		this.gpuSink = this.timing ? gpu : null;
	}

	finished(): Promise<void> {
		return this.device.queue.onSubmittedWorkDone();
	}

	private probe: Probe | null = null;

	setProbe(probe: Probe | null): boolean {
		this.probe = probe;
		return true;
	}

	/** A profile's empty frame: the targets cleared and resolved to the screen, nothing drawn. */
	private drawEmpty(
		encoder: GPUCommandEncoder,
		started: number,
		target: GPUTextureView,
		upTo: GPUTextureView | null,
	): void {
		const pass = encoder.beginRenderPass({
			timestampWrites: this.stamp(null),
			colorAttachments: [
				{
					...this.into(target),
					clearValue: { r: 0.16, g: 0.17, b: 0.19, a: 1 },
					loadOp: "clear",
				},
			],
			depthStencilAttachment: {
				view: this.depth!.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.end();
		if (upTo) this.upscalePasses(encoder, upTo, { fresh: true, settled: false, moving: false });
		this.device.queue.submit([encoder.finish()]);
		if (this.clock) {
			this.clock.submitted("place", this.device.queue.onSubmittedWorkDone());
			this.clock.end();
		}
		this.lastTally = this.tally;
		this.cpuMs = performance.now() - started;
		this.cpuSteps = {
			effects: this.cpuEffects,
			culling: this.cpuCulling,
			...(this.effects && this.cpuEffects > 0 ? { fx: this.effects.steps() } : {}),
		};
	}

	deviceFacts(): {
		gpu: string;
		timers: boolean;
		samples: number;
		half?: boolean;
		glowHalf?: boolean;
	} {
		return {
			gpu: this.gpuName,
			timers: !!this.timing,
			samples: this.samples,
			half: this.halfOn,
			glowHalf: this.glowHalf(),
		};
	}

	/** While profiling, ends a stage: what it encoded is submitted, and drawing goes on in a new encoder. */
	private cut(encoder: GPUCommandEncoder, stage: Stage): GPUCommandEncoder {
		const clock = this.clock;
		if (!clock) return encoder;
		this.stampsAre(stage);
		this.device.queue.submit([encoder.finish()]);
		clock.submitted(stage, this.device.queue.onSubmittedWorkDone());
		return this.device.createCommandEncoder();
	}

	/** The place's Beams and ParticleEmitters: see `effectsGpu.ts`. */
	private effects?: GpuEffects;

	private drawEffects(pass: GPURenderPassEncoder, camera: Camera): void {
		const fx = this.effects;
		if (!fx) return;
		const show = passesOf(this.render.features);
		const on = { beams: show.beams, particles: show.particles };
		const simulating = performance.now();
		fx.draw(
			pass,
			camera,
			this.width,
			this.height,
			this.lighting,
			this.render,
			on,
			performance.now() / 1000,
		);
		this.cpuEffects += performance.now() - simulating;
		if (fx.last.draws === 0) return;
		pass.setBindGroup(0, this.bind);
		this.tally.draws += fx.last.draws;
		this.tally.triangles += fx.last.quads * 2;
	}

	animates(): boolean {
		return (
			(this.effects?.last.moving ?? false) ||
			this.occlusionStale ||
			((antialiasInfo(this.aaMode).pass === "taa" || this.upscaling()) && this.still.settling)
		);
	}

	// -- occlusion: the solid parts' depth, small, read back a frame late ----------

	private farTex?: GPUTexture;
	private farUniform?: GPUBuffer;
	private farRead?: GPUBuffer;
	private farBusy = false;
	private farCells = { cols: 0, rows: 0, bytesPerRow: 0 };
	/** The view the culling used this frame, and whether its depth image was another view's. */
	private cullView: { vp: Float32Array; eye: number[] } | null = null;
	private occlusionStale = false;

	/**
	 * The solid parts' depth in a pass of its own, so Glass and the rest drawn
	 * after do not hide what is behind them; then made small. The main pass
	 * goes on from this depth. Returns whether the image is to be read back.
	 */
	private drawFar(encoder: GPUCommandEncoder): boolean {
		const pass = encoder.beginRenderPass({
			timestampWrites: this.stamp(null),
			colorAttachments: [
				{
					view: this.msaa!.createView(),
					loadOp: "clear",
					storeOp: "discard",
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
				},
			],
			depthStencilAttachment: {
				view: this.depth!.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.solidDepth);
		this.solids(pass);
		pass.end();
		return this.reduceFar(encoder, this.depth!, this.width, this.height, this.samples);
	}

	/**
	 * The lean path's occlusion depth: the solid parts into a small target of
	 * their own, one sample, no colour, then reduced as the full one is.
	 */
	private drawFarSmall(encoder: GPUCommandEncoder): boolean {
		if (!this.farDepthPipe) return false;
		const { cols } = depthCells(this.width, this.height);
		const w = Math.min(this.width, cols * 4);
		const h = Math.max(1, Math.round((w * this.height) / this.width));
		if (!this.farSmall || this.farSmall.width !== w || this.farSmall.height !== h) {
			this.farSmall?.destroy();
			this.farSmall = this.device.createTexture({
				size: [w, h],
				format: "depth32float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
		}
		const pass = encoder.beginRenderPass({
			timestampWrites: this.stamp(null),
			colorAttachments: [],
			depthStencilAttachment: {
				view: this.farSmall.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.farDepthPipe);
		this.solids(pass);
		pass.end();
		return this.reduceFar(encoder, this.farSmall, w, h, 1);
	}

	/** The far reduction's pipelines, by samples a pixel of the depth it reads. */
	private farPipes = new Map<number, { pipe: GPURenderPipeline; layout: GPUBindGroupLayout }>();

	/** A depth texture reduced into occlusion's image, and copied out to read back. */
	private reduceFar(
		encoder: GPUCommandEncoder,
		depth: GPUTexture,
		width: number,
		height: number,
		samples: number,
	): boolean {
		const d = this.device;
		if (!this.cullView) return false;
		const { cols, rows } = depthCells(this.width, this.height);
		let far = this.farPipes.get(samples);
		if (!far) {
			const module = d.createShaderModule({ code: farShader(samples) });
			const layout = d.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: STAGE.FRAGMENT,
						texture: { sampleType: "depth", multisampled: samples > 1 },
					},
					{ binding: 1, visibility: STAGE.FRAGMENT, buffer: {} },
				],
			});
			const pipe = d.createRenderPipeline({
				layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
				vertex: { module, entryPoint: "vsFar" },
				fragment: { module, entryPoint: "fsFar", targets: [{ format: "r32float" }] },
				primitive: { topology: "triangle-list" },
			});
			far = { pipe, layout };
			this.farPipes.set(samples, far);
		}
		this.farUniform ??= d.createBuffer({ size: 96, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
		if (this.farCells.cols !== cols || this.farCells.rows !== rows) {
			this.farTex?.destroy();
			if (!this.farBusy) this.farRead?.destroy();
			const bytesPerRow = Math.ceil((cols * 4) / 256) * 256;
			this.farTex = d.createTexture({
				size: [cols, rows],
				format: "r32float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.COPY_SRC,
			});
			this.farRead = d.createBuffer({
				size: bytesPerRow * rows,
				usage: BUFFER.MAP_READ | BUFFER.COPY_DST,
			});
			this.farBusy = false;
			this.farCells = { cols, rows, bytesPerRow };
		}
		const { vp, eye } = this.cullView;
		const u = new Float32Array(24);
		u.set(invert(vp), 0);
		u.set([eye[0], eye[1], eye[2], 0], 16);
		u.set([width, height, cols, rows], 20);
		d.queue.writeBuffer(this.farUniform!, 0, u);
		const group = d.createBindGroup({
			layout: far.layout,
			entries: [
				{ binding: 0, resource: depth.createView() },
				{ binding: 1, resource: { buffer: this.farUniform! } },
			],
		});
		const reduce = encoder.beginRenderPass({
			timestampWrites: this.stamp(null),
			colorAttachments: [
				{
					view: this.farTex!.createView(),
					loadOp: "clear",
					storeOp: "store",
					clearValue: { r: 1e30, g: 0, b: 0, a: 1 },
				},
			],
		});
		reduce.setPipeline(far.pipe);
		reduce.setBindGroup(0, group);
		reduce.draw(3);
		reduce.end();
		if (this.farBusy) return false;
		encoder.copyTextureToBuffer(
			{ texture: this.farTex! },
			{ buffer: this.farRead!, bytesPerRow: this.farCells.bytesPerRow },
			[cols, rows],
		);
		return true;
	}

	/** Reads the image just made back, once the GPU is done with it, for the next frame's culling. */
	private readFar(): void {
		const buffer = this.farRead;
		const view = this.cullView;
		if (!buffer || !view) return;
		const { cols, rows, bytesPerRow } = this.farCells;
		this.farBusy = true;
		buffer
			.mapAsync(MAP_READ)
			.then(() => {
				const bytes = new Float32Array(buffer.getMappedRange());
				const far = new Float32Array(cols * rows);
				const stride = bytesPerRow / 4;
				for (let r = 0; r < rows; r++)
					far.set(bytes.subarray(r * stride, r * stride + cols), r * cols);
				buffer.unmap();
				this.depthImage = { cols, rows, far, viewProj: view.vp, eye: view.eye };
			})
			.catch(() => {})
			.finally(() => {
				if (this.farRead === buffer) this.farBusy = false;
				else buffer.destroy();
			});
	}

	// The Overdraw and Triangle density views: see renderViews.ts.
	private countSolid?: GPURenderPipeline;
	private imageCount?: GPURenderPipeline;
	private density?: GPURenderPipeline;
	private densityLayout!: GPUBindGroupLayout;
	private densityTris?: { buffer: GPUBuffer; group: GPUBindGroup; room: number };

	/** The views' pipelines: overdraw's counts, added up, and triangle density's colours. */
	private viewPipelines(
		module: GPUShaderModule,
		layout: GPUBindGroupLayout,
		buffers: GPUVertexBufferLayout[],
	): void {
		const d = this.device;
		const added: GPUColorTargetState = {
			format: this.format,
			blend: {
				color: { srcFactor: "one", dstFactor: "one" },
				alpha: { srcFactor: "one", dstFactor: "one" },
			},
		};
		// Every fragment of the solid parts, as the depth pre-pass draws them, before its depth test.
		this.pipeline((p) => (this.countSolid = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsCount", targets: [added] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: this.samples },
		});
		// Every fragment of an image in front of the solid parts.
		this.pipeline((p) => (this.imageCount = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: { module, entryPoint: "fsCount", targets: [added] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: this.samples },
		});
		// Each draw's triangles, at its own offset: a draw is one mesh.
		this.densityLayout = d.createBindGroupLayout({
			entries: [
				{
					binding: 2,
					visibility: STAGE.VERTEX,
					buffer: { hasDynamicOffset: true, minBindingSize: 16 },
				},
			],
		});
		this.pipeline((p) => (this.density = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.densityLayout] }),
			vertex: { module, entryPoint: "vsDensity", buffers },
			fragment: { module, entryPoint: "fsDensity", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" },
			multisample: { count: this.samples },
		});
	}

	/**
	 * Overdraw: every fragment of the solid parts, as the depth pre-pass draws
	 * them before its depth test hides any; then, in front of them, each
	 * see-through part, image, beam and particle; each adding one.
	 */
	private drawOverdraw(pass: GPURenderPassEncoder, camera: Camera): void {
		const show = passesOf(this.render.features);
		if (!this.countSolid || !this.imageCount) return;
		pass.setPipeline(this.countSolid);
		this.solids(pass);
		pass.setPipeline(this.solidDepth);
		this.solids(pass);
		this.count(this.draws);
		if (show.images) this.drawImages(pass, "solid", camera.eye, this.imageCount);
		if (show.seeThrough) {
			pass.setPipeline(this.heatAdded);
			this.solids(pass, this.glass);
			this.solids(pass, this.clear);
			this.count(this.glass);
			this.count(this.clear);
		}
		if (show.images) this.drawImages(pass, "seeThrough", camera.eye, this.imageCount);
		this.drawEffects(pass, camera);
	}

	/**
	 * Triangle density: every part, see-through ones as if solid, coloured by
	 * its mesh's triangles against its size (vsDensity).
	 */
	private drawDensity(pass: GPURenderPassEncoder): void {
		const all = passesOf(this.render.features).seeThrough
			? [...this.draws, ...this.glass, ...this.clear]
			: this.draws;
		if (!this.density || all.length === 0) return;
		// A slot a draw, at the 256 bytes dynamic offsets keep to.
		const slot = 256;
		const d = this.device;
		if (!this.densityTris || this.densityTris.room < all.length) {
			this.densityTris?.buffer.destroy();
			const room = Math.max(all.length, (this.densityTris?.room ?? 0) * 2, 64);
			const buffer = d.createBuffer({ size: room * slot, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
			const group = d.createBindGroup({
				layout: this.densityLayout,
				entries: [{ binding: 2, resource: { buffer, size: 16 } }],
			});
			this.densityTris = { buffer, group, room };
		}
		const tris = new Float32Array((all.length * slot) / 4);
		all.forEach((draw, k) => {
			tris[(k * slot) / 4] = draw.indexCount / 3;
		});
		d.queue.writeBuffer(this.densityTris.buffer, 0, tris);
		pass.setPipeline(this.density);
		all.forEach((draw, k) => {
			// Culled as the picture is: see cull.
			const runs = this.runs.get(draw);
			if (runs && runs.length === 0) return;
			pass.setBindGroup(1, this.densityTris!.group, [k * slot]);
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.indices, draw.format);
			if (!runs) {
				pass.drawIndexed(draw.indexCount, draw.count);
				this.tally.draws++;
				return;
			}
			for (let i = 0; i < runs.length; i += 2)
				pass.drawIndexed(draw.indexCount, runs[i + 1], 0, 0, runs[i]);
			this.tally.draws += runs.length / 2;
		});
		this.count(all);
	}

	private imageLayout!: GPUBindGroupLayout;
	private imageSampler!: GPUSampler;
	private imagePipeline!: GPURenderPipeline;
	private imageDepth!: GPURenderPipeline;
	private imageVertices: GPUBuffer | null = null;
	private imageList: ImageQuad[] = [];
	private imageGroups = new Map<string, { texture: GPUTexture; group: GPUBindGroup }>();

	/** The scene's Decals and Textures, as triangles grouped by image. */
	private setImages(scene: PlaceScene): void {
		this.imageVertices?.destroy();
		this.imageVertices = null;
		const { vertices, quads } = imageQuads(scene.images ?? []);
		this.imageList = quads;
		if (vertices.length === 0) return;
		this.imageVertices = this.device.createBuffer({
			size: vertices.byteLength,
			usage: BUFFER.VERTEX | BUFFER.COPY_DST,
		});
		this.device.queue.writeBuffer(this.imageVertices, 0, vertices);
	}

	setImage(asset: string, image: ImageBitmap): void {
		if (this.imageGroups.has(asset)) return;
		const levels = Math.floor(Math.log2(Math.max(image.width, image.height, 1))) + 1;
		const texture = this.device.createTexture({
			size: [image.width, image.height],
			format: "rgba8unorm",
			mipLevelCount: levels,
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		this.device.queue.copyExternalImageToTexture(
			{ source: image },
			{ texture, premultipliedAlpha: false },
			[image.width, image.height],
		);
		this.makeImageMips(texture, levels);
		const group = this.device.createBindGroup({
			layout: this.imageLayout,
			entries: [
				{ binding: 0, resource: texture.createView() },
				{ binding: 1, resource: this.imageSampler },
			],
		});
		this.imageGroups.set(asset, { texture, group });
		// The reflection cube shows the images too: drawn again with this one.
		if (this.imageList.some((quad) => quad.asset === asset)) this.reflStale();
	}

	private imageHalve: { pipe: GPURenderPipeline; layout: GPUBindGroupLayout } | null = null;

	/**
	 * An image's mip levels, each from the one above it: a texel's four,
	 * averaged by the sampler halfway between them, as WebGL2's
	 * generateMipmap makes them.
	 */
	private makeImageMips(texture: GPUTexture, levels: number): void {
		if (levels < 2) return;
		const d = this.device;
		if (!this.imageHalve) {
			const module = d.createShaderModule({
				code: `@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
struct O { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> O {
	var o: O;
	let q = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	o.pos = vec4f(q * 2.0 - 1.0, 0.0, 1.0);
	o.uv = vec2f(q.x, 1.0 - q.y);
	return o;
}
@fragment fn fs(o: O) -> @location(0) vec4f { return textureSampleLevel(src, samp, o.uv, 0.0); }`,
			});
			const layout = d.createBindGroupLayout({
				entries: [
					{ binding: 0, visibility: STAGE.FRAGMENT, texture: {} },
					{ binding: 1, visibility: STAGE.FRAGMENT, sampler: {} },
				],
			});
			const pipe = d.createRenderPipeline({
				layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
				vertex: { module, entryPoint: "vs" },
				fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
				primitive: { topology: "triangle-list" },
			});
			this.imageHalve = { pipe, layout };
		}
		const { pipe, layout } = this.imageHalve;
		const encoder = d.createCommandEncoder();
		for (let level = 1; level < levels; level++) {
			const group = d.createBindGroup({
				layout,
				entries: [
					{
						binding: 0,
						resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }),
					},
					{ binding: 1, resource: this.skySampler },
				],
			});
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
						loadOp: "clear",
						storeOp: "store",
						clearValue: { r: 0, g: 0, b: 0, a: 0 },
					},
				],
			});
			pass.setPipeline(pipe);
			pass.setBindGroup(0, group);
			pass.draw(3);
			pass.end();
		}
		d.queue.submit([encoder.finish()]);
	}

	/** One layer's images whose texture has arrived, onto their faces, farthest first. */
	private drawImages(
		pass: GPURenderPassEncoder,
		layer: ImageLayer,
		eye: number[],
		colour: GPURenderPipeline = this.imagePipeline,
	): void {
		if (!this.imageVertices || this.imageList.length === 0) return;
		const order = imageOrder(this.imageList, layer, eye, (asset) => this.imageGroups.has(asset));
		if (order.length === 0) return;
		pass.setVertexBuffer(0, this.imageVertices);
		// The solid parts' images then go into the depth, for the see-through parts drawn after.
		for (const pipeline of layer === "solid" ? [colour, this.imageDepth] : [colour]) {
			pass.setPipeline(pipeline);
			let bound = "";
			for (const q of order) {
				const asset = this.imageList[q].asset;
				if (asset !== bound) {
					pass.setBindGroup(1, this.imageGroups.get(asset)!.group);
					bound = asset;
				}
				pass.draw(6, 1, q * 6);
			}
		}
	}

	/**
	 * The solid parts' Decals and Textures on a face of the reflection cube,
	 * over the parts just drawn, farthest from its middle first.
	 */
	private reflectImages(pass: GPURenderPassEncoder, face: GPUBindGroup, at: number[]): void {
		if (!this.reflImagePipe || !this.imageVertices || this.imageList.length === 0) return;
		if (!passesOf(this.render.features).images) return;
		const order = imageOrder(this.imageList, "solid", at, (asset) => this.imageGroups.has(asset));
		if (order.length === 0) return;
		pass.setPipeline(this.reflImagePipe);
		pass.setBindGroup(2, face);
		pass.setVertexBuffer(0, this.imageVertices);
		let bound = "";
		for (const q of order) {
			const asset = this.imageList[q].asset;
			if (asset !== bound) {
				pass.setBindGroup(1, this.imageGroups.get(asset)!.group);
				bound = asset;
			}
			pass.draw(6, 1, q * 6);
		}
	}

	private reflFaceLayout: GPUBindGroupLayout | null = null;
	private reflImagePipe: GPURenderPipeline | null = null;

	/** Every image whose texture has arrived, over what glows, in the glow's pass. */
	private veilImages(pass: GPURenderPassEncoder): void {
		if (!this.imageVertices || this.imageList.length === 0) return;
		pass.setPipeline(this.imageVeil);
		pass.setVertexBuffer(0, this.imageVertices);
		this.imageList.forEach((quad, q) => {
			const held = this.imageGroups.get(quad.asset);
			if (!held) return;
			pass.setBindGroup(1, held.group);
			pass.draw(6, 1, q * 6);
		});
	}

	private looks!: GPUTexture;
	private loaded = new Set<number>();
	private layout!: GPUBindGroupLayout;
	private lookSampler!: GPUSampler;
	private skySampler!: GPUSampler;
	private skyImages?: GPUTexture;
	private skyOn = false;

	setSky(faces: readonly ImageBitmap[] | null): void {
		const d = this.device;
		this.skyImages?.destroy();
		const [w, h] = faces ? [faces[0].width, faces[0].height] : [1, 1];
		this.skyImages = d.createTexture({
			size: [w, h, 6],
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		faces?.forEach((source, layer) => {
			d.queue.copyExternalImageToTexture(
				{ source },
				{ texture: this.skyImages!, origin: [0, 0, layer], premultipliedAlpha: false },
				[w, h],
			);
		});
		this.skyOn = faces !== null;
		this.rebind();
	}

	private sunTexture?: GPUTexture;

	setSunImage(image: ImageBitmap | null): void {
		const d = this.device;
		this.sunTexture?.destroy();
		const [w, h] = image ? [image.width, image.height] : [1, 1];
		this.sunTexture = d.createTexture({
			size: [w, h],
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		if (image)
			d.queue.copyExternalImageToTexture(
				{ source: image },
				{ texture: this.sunTexture, premultipliedAlpha: false },
				[w, h],
			);
		if (this.skyImages) this.rebind();
	}

	// -- antialiasing by a pass over the frame: see antialias.ts --------------------------

	private aaPipes: Partial<
		Record<"copy" | "fxaa" | "edges" | "weights" | "blend" | "taa", GPURenderPipeline>
	> = {};
	private aaLayout: GPUBindGroupLayout | null = null;
	private aaUniform: GPUBuffer | null = null;
	private aaLinear: GPUSampler | null = null;
	private aaPoint: GPUSampler | null = null;
	/** The frame as drawn, before the pass: in the canvas's format. */
	private aaColour: GPUTexture | null = null;
	private aaEdges: GPUTexture | null = null;
	private aaWeights: GPUTexture | null = null;
	/** TAA's average, two to read one and write the other. */
	private aaHistory: GPUTexture[] = [];
	private aaHistoryRead = 0;
	private aaArea: GPUTexture | null = null;
	private aaSearch: GPUTexture | null = null;
	private aaBlank: GPUTexture | null = null;
	private still = new StillFrames();
	private jitter: [number, number] = [0, 0];
	private taaWeight = 1;

	/** The sun's cascades, one layer each, `shadowMap` texels a side. */
	private makeSunMaps(): void {
		this.sunMaps = this.device.createTexture({
			size: [this.mapSide, this.mapSide, SUN_CASCADES.length],
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
	}

	/** What every pass shares: the layout, the uniform, the samplers, a blank texture. */
	private makeAaShared(tex: { readonly texture: object }): void {
		const d = this.device;
		this.aaLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, ...tex },
				{ binding: 2, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 3, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 4, visibility: STAGE.FRAGMENT, ...tex },
				{ binding: 5, visibility: STAGE.FRAGMENT, ...tex },
				{ binding: 6, visibility: STAGE.FRAGMENT, ...tex },
				{ binding: 7, visibility: STAGE.FRAGMENT, ...tex },
				{ binding: 8, visibility: STAGE.FRAGMENT, ...tex },
			],
		});
		this.aaUniform = d.createBuffer({ size: 32, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
		this.aaLinear = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		this.aaPoint = d.createSampler({ magFilter: "nearest", minFilter: "nearest" });
		this.aaBlank = d.createTexture({
			size: [1, 1],
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING,
		});
	}

	/**
	 * The passes' pipelines for `mode`, and SMAA's tables once they are
	 * unpacked; then its targets, unless `targets` is false (setAntialias
	 * makes them once the pipelines are compiled). The layout, uniform and
	 * samplers every pass shares are made once, so a mode still drawing keeps
	 * working while another's pipelines compile.
	 */
	private makeAntialias(mode: AntialiasMode = this.aaMode, targets = true): void {
		const pass = antialiasInfo(mode).pass;
		if (pass === "none") return;
		const d = this.device;
		const module = d.createShaderModule({ code: AA_WGSL });
		const tex = { texture: {} } as const;
		if (!this.aaLayout) this.makeAaShared(tex);
		const layout = d.createPipelineLayout({ bindGroupLayouts: [this.aaLayout!] });
		const make = (entry: string, format: GPUTextureFormat, key: keyof WebGpuView["aaPipes"]) =>
			this.pipeline((p) => (this.aaPipes[key] = p), {
				layout,
				vertex: { module, entryPoint: "vs" },
				fragment: { module, entryPoint: entry, targets: [{ format }] },
				primitive: { topology: "triangle-list" },
			});
		make("fsCopy", this.format, "copy");
		if (pass === "fxaa") make("fsFxaa", this.format, "fxaa");
		if (pass === "smaa") {
			make("fsEdges", "rg8unorm", "edges");
			make("fsWeights", "rgba8unorm", "weights");
			make("fsBlend", this.format, "blend");
			void smaaTables().then(({ area, search }) => {
				const upload = (
					bytes: Uint8Array,
					size: { width: number; height: number; channels: number },
					format: GPUTextureFormat,
				) => {
					const texture = d.createTexture({
						size: [size.width, size.height],
						format,
						usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
					});
					d.queue.writeTexture({ texture }, bytes, { bytesPerRow: size.width * size.channels }, [
						size.width,
						size.height,
					]);
					return texture;
				};
				this.aaArea = upload(area, SMAA_AREA, "rg8unorm");
				this.aaSearch = upload(search, SMAA_SEARCH, "r8unorm");
				this.onRedraw?.();
			});
		}
		if (pass === "taa") make("fsTaa", "rgba16float", "taa");
		if (targets) this.makeAaTargets();
	}

	/** The passes' targets, the canvas's size; none, with no pass. */
	private makeAaTargets(): void {
		const pass = antialiasInfo(this.aaMode).pass;
		for (const t of [this.aaColour, this.aaEdges, this.aaWeights, ...this.aaHistory]) t?.destroy();
		this.aaColour = null;
		this.aaEdges = null;
		this.aaWeights = null;
		this.aaHistory = [];
		if (pass === "none" || !this.aaLayout) return;
		const d = this.device;
		const size = [this.width, this.height];
		const target = (format: GPUTextureFormat) =>
			d.createTexture({ size, format, usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING });
		this.aaColour = target(this.format);
		this.aaEdges = pass === "smaa" ? target("rg8unorm") : null;
		this.aaWeights = pass === "smaa" ? target("rgba8unorm") : null;
		this.aaHistory = pass === "taa" ? [target("rgba16float"), target("rgba16float")] : [];
		this.still.reset();
	}

	/** The pass over the frame, into the canvas: FXAA's, SMAA's three, or TAA's average and its copy. */
	private antialiasPasses(encoder: GPUCommandEncoder, canvas: GPUTextureView): void {
		const d = this.device;
		const pass = antialiasInfo(this.aaMode).pass;
		const blank = this.aaBlank!.createView();
		d.queue.writeBuffer(
			this.aaUniform!,
			0,
			new Float32Array([
				1 / this.width,
				1 / this.height,
				this.width,
				this.height,
				this.taaWeight,
				0,
				0,
				0,
			]),
		);
		const group = (t: {
			colour?: GPUTexture;
			edges?: GPUTexture;
			blend?: GPUTexture;
			history?: GPUTexture;
			tables?: boolean;
		}) =>
			d.createBindGroup({
				layout: this.aaLayout!,
				entries: [
					{ binding: 0, resource: { buffer: this.aaUniform! } },
					{ binding: 1, resource: t.colour?.createView() ?? blank },
					{ binding: 2, resource: this.aaLinear! },
					{ binding: 3, resource: this.aaPoint! },
					{ binding: 4, resource: t.edges?.createView() ?? blank },
					{ binding: 5, resource: t.blend?.createView() ?? blank },
					{ binding: 6, resource: t.tables ? this.aaArea!.createView() : blank },
					{ binding: 7, resource: t.tables ? this.aaSearch!.createView() : blank },
					{ binding: 8, resource: t.history?.createView() ?? blank },
				],
			});
		const run = (
			pipe: GPURenderPipeline | undefined,
			into: GPUTextureView,
			bind: GPUBindGroup,
			clear = false,
		): boolean => {
			if (!pipe) return false;
			const p = encoder.beginRenderPass({
				timestampWrites: this.stamp(null),
				colorAttachments: [
					{
						view: into,
						loadOp: clear ? "clear" : "load",
						clearValue: { r: 0, g: 0, b: 0, a: 0 },
						storeOp: "store",
					},
				],
			});
			p.setPipeline(pipe);
			p.setBindGroup(0, bind);
			p.draw(3);
			p.end();
			return true;
		};
		const colour = this.aaColour!;
		const copy = () => run(this.aaPipes.copy, canvas, group({ colour }), true);
		if (pass === "fxaa") {
			if (!run(this.aaPipes.fxaa, canvas, group({ colour }), true)) copy();
			return;
		}
		if (pass === "smaa") {
			const { edges, weights, blend } = this.aaPipes;
			if (!edges || !weights || !blend || !this.aaArea || !this.aaSearch) {
				copy();
				return;
			}
			run(edges, this.aaEdges!.createView(), group({ colour }), true);
			run(
				weights,
				this.aaWeights!.createView(),
				group({ edges: this.aaEdges!, tables: true }),
				true,
			);
			run(blend, canvas, group({ colour, blend: this.aaWeights! }), true);
			return;
		}
		// TAA: this frame into the average, then the average onto the canvas.
		const from = this.aaHistory[this.aaHistoryRead];
		const into = this.aaHistory[1 - this.aaHistoryRead];
		if (!this.aaPipes.taa || !from || !into) {
			copy();
			return;
		}
		run(this.aaPipes.taa, into.createView(), group({ colour, history: from }), true);
		this.aaHistoryRead = 1 - this.aaHistoryRead;
		run(this.aaPipes.copy, canvas, group({ colour: into }), true);
	}

	// -- upscaling: the frame brought up to the screen's pixels; see upscale.ts -----------

	private upOut: { width: number; height: number } | null = null;
	private upMode: UpscaleMode = "off";
	/** The frame as drawn, the render scale's size, before it is brought up. */
	private upIn: GPUTexture | null = null;
	/** Still frames' samples so far, the screen's size: two, to read one and write the other. */
	private upHistory: GPUTexture[] = [];
	private upRead = 0;
	private upPipes: Partial<
		Record<"stretch" | "sharp" | "accumulate" | "resolve", GPURenderPipeline>
	> = {};
	private upLayout: GPUBindGroupLayout | null = null;
	private upUniform: GPUBuffer | null = null;
	private upLinear: GPUSampler | null = null;

	setUpscale(output: { width: number; height: number } | null, mode: UpscaleMode): void {
		const same =
			this.upMode === mode &&
			this.upOut?.width === output?.width &&
			this.upOut?.height === output?.height;
		this.upOut = output;
		this.upMode = mode;
		if (!same) this.makeUpTargets();
	}

	/** Whether the frame is drawn smaller than the canvas and brought up to it. */
	private upscaling(): boolean {
		const out = this.upOut;
		return (
			this.upMode !== "off" &&
			out !== null &&
			(out.width > this.width || out.height > this.height) &&
			!!this.upIn
		);
	}

	private makeUpscale(): void {
		if (this.upLayout) return;
		const d = this.device;
		const module = d.createShaderModule({ code: UPSCALE_WGSL });
		this.upLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, texture: {} },
				{ binding: 2, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 3, visibility: STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
			],
		});
		this.upUniform = d.createBuffer({ size: 48, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
		this.upLinear = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		const layout = d.createPipelineLayout({ bindGroupLayouts: [this.upLayout] });
		const make = (entry: string, format: GPUTextureFormat, key: keyof WebGpuView["upPipes"]) =>
			this.pipeline((p) => (this.upPipes[key] = p), {
				layout,
				vertex: { module, entryPoint: "vs" },
				fragment: { module, entryPoint: entry, targets: [{ format }] },
				primitive: { topology: "triangle-list" },
			});
		make("fsStretch", this.format, "stretch");
		make("fsSharp", this.format, "sharp");
		make("fsAccumulate", "rgba16float", "accumulate");
		make("fsResolve", this.format, "resolve");
	}

	/** The frame the render scale's size, and the history the canvas's. */
	private makeUpTargets(): void {
		for (const t of [this.upIn, ...this.upHistory]) t?.destroy();
		this.upIn = null;
		this.upHistory = [];
		const out = this.upOut;
		if (!this.device || this.upMode === "off" || !out) return;
		if (out.width <= this.width && out.height <= this.height) return;
		this.makeUpscale();
		const d = this.device;
		this.upIn = d.createTexture({
			size: [this.width, this.height],
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		const history = () =>
			d.createTexture({
				size: [out.width, out.height],
				format: "rgba16float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
		this.upHistory = [history(), history()];
		this.still.reset();
	}

	/**
	 * The frame onto the canvas: a moving frame stretched (or sharpened,
	 * Always); a still one's samples into the history, which is drawn. The
	 * first still frame after a move is not jittered: it is shown stretched,
	 * and the history starts from the next.
	 */
	private upscalePasses(encoder: GPUCommandEncoder, canvas: GPUTextureView, step: UpStep): void {
		const out = this.upOut;
		const frame = this.upIn;
		if (!out || !frame) return;
		const d = this.device;
		const second = !step.fresh && this.still.count === 2;
		d.queue.writeBuffer(
			this.upUniform!,
			0,
			new Float32Array([
				this.width,
				this.height,
				1 / this.width,
				1 / this.height,
				out.width,
				out.height,
				1 / out.width,
				1 / out.height,
				// The jitter moves clip space up, so the picture down: rows run down the frame.
				this.jitter[0],
				-this.jitter[1],
				step.moving ? MOVING_DECAY : 1,
				second ? 1 : 0,
			]),
		);
		const group = (history: GPUTexture) =>
			d.createBindGroup({
				layout: this.upLayout!,
				entries: [
					{ binding: 0, resource: { buffer: this.upUniform! } },
					{ binding: 1, resource: frame.createView() },
					{ binding: 2, resource: this.upLinear! },
					{ binding: 3, resource: history.createView() },
				],
			});
		const run = (pipe: GPURenderPipeline | undefined, into: GPUTextureView, bind: GPUBindGroup) => {
			if (!pipe) return false;
			const p = encoder.beginRenderPass({
				timestampWrites: this.stamp(null),
				colorAttachments: [
					{ view: into, loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" },
				],
			});
			p.setPipeline(pipe);
			p.setBindGroup(0, bind);
			p.draw(3);
			p.end();
			return true;
		};
		const [from, into] = [this.upHistory[this.upRead], this.upHistory[1 - this.upRead]];
		const moving = this.upMode === "always" ? this.upPipes.sharp : this.upPipes.stretch;
		if (step.fresh || !from || !into) {
			if (!run(moving, canvas, group(from ?? frame)))
				run(this.upPipes.stretch, canvas, group(frame));
			return;
		}
		if (!step.settled && run(this.upPipes.accumulate, into.createView(), group(from)))
			this.upRead = 1 - this.upRead;
		if (!run(this.upPipes.resolve, canvas, group(this.upHistory[this.upRead])))
			run(this.upPipes.stretch, canvas, group(from));
	}

	/** The shaders' textures and samplers, made again when one is replaced. */
	private rebind(): void {
		this.bind = this.bindWith(this.reflCube, this.skyUniform, true);
		this.lampBind = this.bindWith(this.reflCube);
		// The cube's own faces are drawn with a blank one in its place.
		this.reflBind = this.bindWith(this.reflBlank);
	}

	/**
	 * `lamps`: the half-size lamp pass's textures, for the camera's passes;
	 * otherwise blank ones, for a pass that draws them or never reads them.
	 */
	private bindWith(
		cube: GPUTexture,
		sky: GPUBuffer = this.skyUniform,
		lamps = false,
	): GPUBindGroup {
		const light = lamps ? this.lampLight : this.lampBlank;
		const shine = lamps ? this.lampShine : this.lampBlank;
		return this.device.createBindGroup({
			layout: this.layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: this.looks.createView({ dimension: "2d-array" }) },
				{ binding: 2, resource: this.lookSampler },
				{ binding: 3, resource: this.skyImages!.createView({ dimension: "2d-array" }) },
				{ binding: 4, resource: this.skySampler },
				{ binding: 5, resource: this.sunTexture!.createView() },
				{ binding: 6, resource: this.skyMaps.createView({ dimension: "2d-array" }) },
				{ binding: 7, resource: this.skyCompare },
				{ binding: 8, resource: { buffer: sky } },
				{ binding: 9, resource: { buffer: this.lightBuffers.data } },
				{ binding: 10, resource: { buffer: this.lightBuffers.table } },
				{ binding: 11, resource: { buffer: this.lightBuffers.index } },
				{ binding: 12, resource: this.sunMaps.createView({ dimension: "2d-array" }) },
				{ binding: 13, resource: { buffer: this.cascadeUniform } },
				{ binding: 14, resource: this.cells[this.cellsRead].createView({ dimension: "3d" }) },
				{ binding: 15, resource: this.cellSampler },
				{ binding: 16, resource: cube.createView({ dimension: "cube" }) },
				{ binding: 17, resource: this.reflSampler },
				{ binding: 18, resource: light.createView() },
				{ binding: 19, resource: shine.createView() },
			],
		});
	}

	// -- the lamp light at half size: see lampsAt ---------------------------------------

	private lampLight!: GPUTexture;
	private lampShine!: GPUTexture;
	private lampDepth!: GPUTexture;
	private lampBlank!: GPUTexture;
	/** Group 0 for the lamp pass, with blank lamp textures: it draws the real ones. */
	private lampBind!: GPUBindGroup;
	private lampsPipe!: GPURenderPipeline;

	/** The lamp pass's targets, half the frame across and down. */
	private makeLampTargets(): void {
		const d = this.device;
		for (const t of [this.lampLight, this.lampShine, this.lampDepth]) t?.destroy();
		this.lampBlank ??= d.createTexture({
			size: [1, 1],
			format: "rgba16float",
			usage: TEXTURE.TEXTURE_BINDING,
		});
		const size = [Math.max(1, Math.ceil(this.width / 2)), Math.max(1, Math.ceil(this.height / 2))];
		const target = (format: GPUTextureFormat, binding: boolean) =>
			d.createTexture({
				size,
				format,
				usage: TEXTURE.RENDER_ATTACHMENT | (binding ? TEXTURE.TEXTURE_BINDING : 0),
			});
		this.lampLight = target("rgba16float", true);
		this.lampShine = target("rgba16float", true);
		this.lampDepth = target("depth32float", false);
	}

	/** The solid parts' lamp light at half size, for the camera's passes to read. */
	private drawLamps(encoder: GPUCommandEncoder, pipe: GPURenderPipeline): void {
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.lampLight.createView(),
					// No distance agrees with -1: nothing drawn there is worked out where it is read.
					clearValue: { r: 0, g: 0, b: 0, a: -1 },
					loadOp: "clear",
					storeOp: "store",
				},
				{
					view: this.lampShine.createView(),
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: this.lampDepth.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.setPipeline(pipe);
		pass.setBindGroup(0, this.lampBind);
		this.solids(pass);
		pass.end();
	}

	// -- scene reflections: see PROBE_SIZE ----------------------------------------------

	/** The cube the shaders read, and the one its next faces are drawn into. */
	private reflCube!: GPUTexture;
	private reflNext!: GPUTexture;
	private reflBlank!: GPUTexture;
	private reflDepth!: GPUTexture;
	private reflSampler!: GPUSampler;
	private reflBind!: GPUBindGroup;
	private reflPipe: GPURenderPipeline | null = null;
	private reflHalve: GPURenderPipeline | null = null;
	/** For each cube, each face's smaller levels, and the level above each to read. */
	private reflLevels = new Map<GPUTexture, { target: GPUTextureView; group: GPUBindGroup }[][]>();
	/**
	 * The cube being drawn again, a face a frame into reflNext, all from one
	 * centre; read once its sixth face is done. A redraw of all six at once
	 * is six passes of the place and thirty of its levels, which every frame
	 * of an orbit asked for.
	 */
	private reflFill: { at: number[]; face: number; again: boolean } | null = null;
	/** Whether any cube has been drawn yet: the first is drawn whole. */
	private reflEver = false;
	/** What has been drawn again, counted: see ViewRenderer.redraws. */
	private redrawn = { probeFaces: 0, nearMaps: 0, sunMaps: 0 };

	redraws(): { probeFaces: number; nearMaps: number; sunMaps: number } {
		return { ...this.redrawn };
	}
	private reflGroups: { buffer: GPUBuffer; group: GPUBindGroup }[] = [];
	/** Where the cube was last drawn from; null, to be drawn again. */
	private reflAt: number[] | null = null;

	private makeReflections(
		module: GPUShaderModule,
		layout: GPUBindGroupLayout,
		buffers: GPUVertexBufferLayout[],
	): void {
		const d = this.device;
		const cube = (size: number, levels: number) =>
			d.createTexture({
				size: [size, size, 6],
				format: "rgba16float",
				mipLevelCount: levels,
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
		this.reflCube = cube(PROBE_SIZE, PROBE_LEVELS);
		this.reflNext = cube(PROBE_SIZE, PROBE_LEVELS);
		this.reflBlank = cube(1, 1);
		this.reflFill = null;
		this.reflEver = false;
		this.reflDepth = d.createTexture({
			size: [PROBE_SIZE, PROBE_SIZE],
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT,
		});
		this.reflSampler = d.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
		});
		// Each level from the one above it, a face at a time: a texel's four,
		// averaged by the sampler halfway between them.
		const halve = d.createShaderModule({
			code: `@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
struct O { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> O {
	var o: O;
	let q = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	o.pos = vec4f(q * 2.0 - 1.0, 0.0, 1.0);
	o.uv = vec2f(q.x, 1.0 - q.y);
	return o;
}
@fragment fn fs(o: O) -> @location(0) vec4f { return textureSampleLevel(src, samp, o.uv, 0.0); }`,
		});
		const halveLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.FRAGMENT, texture: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, sampler: {} },
			],
		});
		this.pipeline((p) => (this.reflHalve = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [halveLayout] }),
			vertex: { module: halve, entryPoint: "vs" },
			fragment: { module: halve, entryPoint: "fs", targets: [{ format: "rgba16float" }] },
			primitive: { topology: "triangle-list" },
		});
		const halveSampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		this.reflLevels.clear();
		for (const into of [this.reflCube, this.reflNext]) {
			const view = (level: number, face: number) =>
				into.createView({
					dimension: "2d",
					baseMipLevel: level,
					mipLevelCount: 1,
					baseArrayLayer: face,
					arrayLayerCount: 1,
				});
			this.reflLevels.set(
				into,
				[0, 1, 2, 3, 4, 5].map((face) =>
					Array.from({ length: PROBE_LEVELS - 1 }, (_, i) => ({
						target: view(i + 1, face),
						group: d.createBindGroup({
							layout: halveLayout,
							entries: [
								{ binding: 0, resource: view(i, face) },
								{ binding: 1, resource: halveSampler },
							],
						}),
					})),
				),
			);
		}
		const faceLayout = d.createBindGroupLayout({
			entries: [{ binding: 0, visibility: STAGE.VERTEX, buffer: {} }],
		});
		this.reflFaceLayout = faceLayout;
		this.reflGroups = [0, 1, 2, 3, 4, 5].map(() => {
			const buffer = d.createBuffer({ size: 64, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
			return {
				buffer,
				group: d.createBindGroup({
					layout: faceLayout,
					entries: [{ binding: 0, resource: { buffer } }],
				}),
			};
		});
		this.pipeline((p) => (this.reflPipe = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, faceLayout] }),
			vertex: { module, entryPoint: "vsRefl", buffers },
			fragment: { module, entryPoint: "fsRefl", targets: [{ format: "rgba16float" }] },
			// The faces mirror some triangles' winding: both sides drawn.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
		});
	}

	/**
	 * The reflection cube's six faces, when scene reflections are on and the
	 * camera is PROBE_STEP studs from where it was last drawn, or what it
	 * shows changed. Every part, culled for none of the faces.
	 */
	private drawReflections(encoder: GPUCommandEncoder, camera: Camera): void {
		if (!this.reflPipe || !this.reflBind || !featureOn(this.render.features, "sceneReflections"))
			return;
		if (!this.reflFill) {
			const at = this.reflAt;
			if (at && Math.hypot(...camera.eye.map((v, a) => v - at[a])) < PROBE_STEP) return;
			this.reflFill = { at: [...camera.eye], face: 0, again: false };
		}
		const fill = this.reflFill;
		// The first cube whole, so the place never reflects an empty one.
		const until = this.reflEver ? fill.face + 1 : 6;
		const faces = probeFaces(fill.at, false);
		const into = this.reflNext;
		const levels = this.reflLevels.get(into) ?? [];
		const q = this.device.queue;
		for (let k = fill.face; k < until; k++) {
			const { buffer, group } = this.reflGroups[k];
			q.writeBuffer(buffer, 0, faces[k]);
			const pass = encoder.beginRenderPass({
				timestampWrites: this.stamp(null),
				colorAttachments: [
					{
						view: into.createView({
							dimension: "2d",
							baseMipLevel: 0,
							mipLevelCount: 1,
							baseArrayLayer: k,
							arrayLayerCount: 1,
						}),
						clearValue: { r: 0, g: 0, b: 0, a: 0 },
						loadOp: "clear",
						storeOp: "store",
					},
				],
				depthStencilAttachment: {
					view: this.reflDepth.createView(),
					depthClearValue: 1,
					depthLoadOp: "clear",
					depthStoreOp: "discard",
				},
			});
			pass.setPipeline(this.reflPipe);
			pass.setBindGroup(0, this.reflBind);
			pass.setBindGroup(1, group);
			this.solids(pass, this.draws, true);
			this.reflectImages(pass, group, fill.at);
			pass.end();
			this.redrawn.probeFaces++;
			// Its smaller levels, each from the one above it.
			if (this.reflHalve)
				for (const level of levels[k] ?? []) {
					const step = encoder.beginRenderPass({
						timestampWrites: this.stamp(null),
						colorAttachments: [{ view: level.target, loadOp: "clear", storeOp: "store" }],
					});
					step.setPipeline(this.reflHalve);
					step.setBindGroup(0, level.group);
					step.draw(3);
					step.end();
				}
		}
		fill.face = until;
		if (fill.face < 6) return;
		// All six: read from here on, and where they were drawn from with them.
		this.reflNext = this.reflCube;
		this.reflCube = into;
		this.reflEver = true;
		this.reflAt = fill.again ? null : fill.at;
		this.reflFill = null;
		q.writeBuffer(this.skyUniform, SKY_BLOCK * 4, new Float32Array([...fill.at, 1]));
		this.rebind();
	}

	/** What the cube shows changed: drawn again, after any fill under way, which started before. */
	private reflStale(): void {
		this.reflAt = null;
		if (this.reflFill) this.reflFill.again = true;
	}

	// -- the lighting cells: see SKY_CELL ---------------------------------------------

	private cells: GPUTexture[] = [];
	private cellsRead = 0;
	private cellSampler!: GPUSampler;
	private cellPipe?: GPURenderPipeline;
	/**
	 * The cells in two steps, eight slices a pass (fsCellOwn, fsCellAround):
	 * where the browser lets one pass draw into eight slices of a 3D texture.
	 * Otherwise fsCell, a slice a pass, each cell sampling the maps 27 times.
	 */
	private cellSteps: {
		own: GPUTexture;
		ownPipe: GPURenderPipeline;
		aroundPipe: GPURenderPipeline;
		aroundGroup: GPUBindGroup;
	} | null = null;

	private async makeCellSteps(module: GPUShaderModule, layout: GPUBindGroupLayout): Promise<void> {
		const d = this.device;
		const [w, h, s] = [SKY_CELLS[0] + 2, SKY_CELLS[2] + 2, Math.ceil((SKY_CELLS[1] + 2) / 8) * 8];
		const own = d.createTexture({
			size: [w, h, s],
			dimension: "3d",
			format: "r8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT,
		});
		// Eight slices of one 3D texture in one pass: tried once, as a browser may refuse it.
		d.pushErrorScope("validation");
		const trial = d.createCommandEncoder();
		const view = own.createView({ dimension: "3d" });
		trial
			.beginRenderPass({
				colorAttachments: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
					view,
					depthSlice: i,
					loadOp: "clear" as const,
					storeOp: "store" as const,
				})),
			})
			.end();
		d.queue.submit([trial.finish()]);
		if (await d.popErrorScope()) {
			own.destroy();
			return;
		}
		const targets = Array.from({ length: 8 }, () => ({ format: "r8unorm" as GPUTextureFormat }));
		const ownLayout = d.createBindGroupLayout({
			entries: [{ binding: 1, visibility: STAGE.FRAGMENT, texture: { viewDimension: "3d" } }],
		});
		try {
			const [ownPipe, aroundPipe] = await Promise.all([
				d.createRenderPipelineAsync({
					layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
					vertex: { module, entryPoint: "vsCell" },
					fragment: { module, entryPoint: "fsCellOwn", targets },
					primitive: { topology: "triangle-list" },
				}),
				d.createRenderPipelineAsync({
					layout: d.createPipelineLayout({ bindGroupLayouts: [layout, ownLayout] }),
					vertex: { module, entryPoint: "vsCell" },
					fragment: { module, entryPoint: "fsCellAround", targets },
					primitive: { topology: "triangle-list" },
				}),
			]);
			this.cellSteps = {
				own,
				ownPipe,
				aroundPipe,
				aroundGroup: d.createBindGroup({
					layout: ownLayout,
					entries: [{ binding: 1, resource: view }],
				}),
			};
			// Cells filled before these were ready: filled again with them.
			this.skyDirty = true;
			this.onRedraw?.();
		} catch {
			own.destroy();
		}
	}

	/** Eight slices of `texture` from `first`, as one pass's targets. */
	private eightSlices(texture: GPUTexture, first: number): GPURenderPassColorAttachment[] {
		const view = texture.createView({ dimension: "3d" });
		return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
			view,
			depthSlice: first + i,
			loadOp: "clear",
			storeOp: "store",
			clearValue: { r: 1, g: 0, b: 0, a: 1 },
		}));
	}

	/**
	 * Each lighting cell the share of the sky its middle sees, from the maps
	 * just drawn: into the cells not being read, a slice a pass, then read.
	 */
	/**
	 * `part` of the cells: each cell's own share, the averages round them, or
	 * both; from the sky block `bind` names. Read at once unless `swap` is off,
	 * when nearFillStep swaps them with the maps they came from.
	 */
	private fillCells(
		encoder: GPUCommandEncoder,
		bind: GPUBindGroup = this.bind,
		part: "all" | "own" | "around" = "all",
		swap = true,
	): void {
		const steps = this.cellSteps;
		if (steps) {
			const target = this.cells[1 - this.cellsRead];
			const own = steps.own.depthOrArrayLayers;
			for (let s = 0; part !== "around" && s * 8 < own; s++) {
				const pass = encoder.beginRenderPass({
					timestampWrites: this.stamp(null),
					colorAttachments: this.eightSlices(steps.own, s * 8),
				});
				pass.setPipeline(steps.ownPipe);
				pass.setBindGroup(0, bind);
				pass.draw(3, 1, 0, s);
				pass.end();
			}
			for (let s = 0; part !== "own" && s * 8 < SKY_CELLS[1]; s++) {
				const pass = encoder.beginRenderPass({
					timestampWrites: this.stamp(null),
					colorAttachments: this.eightSlices(target, s * 8),
				});
				pass.setPipeline(steps.aroundPipe);
				pass.setBindGroup(0, bind);
				pass.setBindGroup(1, steps.aroundGroup);
				pass.draw(3, 1, 0, s);
				pass.end();
			}
			if (swap && part !== "own") {
				this.cellsRead = 1 - this.cellsRead;
				this.rebind();
			}
			return;
		}
		// One slice a pass, each cell sampling the maps itself: all in the second half.
		if (!this.cellPipe || part === "own") return;
		const target = this.cells[1 - this.cellsRead];
		for (let y = 0; y < SKY_CELLS[1]; y++) {
			const pass = encoder.beginRenderPass({
				timestampWrites: this.stamp(null),
				colorAttachments: [
					{
						view: target.createView({ dimension: "3d" }),
						depthSlice: y,
						loadOp: "clear",
						storeOp: "store",
						clearValue: { r: 1, g: 0, b: 0, a: 1 },
					},
				],
			});
			pass.setPipeline(this.cellPipe);
			pass.setBindGroup(0, bind);
			pass.draw(3, 1, 0, y);
			pass.end();
		}
		if (!swap) return;
		this.cellsRead = 1 - this.cellsRead;
		this.rebind();
	}

	// -- sky visibility: see skyBlock ------------------------------------------------

	private skyMaps!: GPUTexture;
	private skyCompare!: GPUSampler;
	private skyUniform!: GPUBuffer;
	private skyUniformNext!: GPUBuffer;
	private skyDepth!: GPURenderPipeline;
	/** Which set of near map layers the shaders read: 0, or 1 (SKY_VIEWS layers on). */
	private nearSet = 0;
	/**
	 * The near maps being drawn again into the set not read, two a frame with
	 * their thin parts taken out, then their cells in two halves, then read:
	 * six frames. Drawn whole, an orbit far out redrew them nearly every
	 * frame, about 20 ms of an iPad's GPU each time (canary.15-17).
	 */
	private nearFill: {
		centre: number[];
		block: Float32Array;
		step: number;
		bind: GPUBindGroup;
	} | null = null;
	private skyViewGroups: { buffer: GPUBuffer; group: GPUBindGroup }[] = [];
	/** All the maps are drawn again before the next frame: the parts moved. */
	private skyDirty = true;
	/** The sun's map alone is drawn again: the sun moved. */
	private sunDirty = true;
	/** Where the near maps were last drawn round: see nearSkyCentre. */
	private nearCentre: number[] | null = null;
	/** The camera's recent way, which the near maps are put ahead along. */
	private heading = new CameraHeading();
	private skyKey = -1;
	private sunKey = "";
	private lightKey = -1;
	/** The place's lights and the grid that finds them: see lightGrid. */
	private lightBuffers!: { data: GPUBuffer; table: GPUBuffer; index: GPUBuffer };

	private setLights(lights: readonly number[] | undefined): void {
		const d = this.device;
		// The same lights again, after an edit elsewhere: the grid already holds them.
		const key = fingerprint(lights);
		if (key === this.lightKey && this.lightKey !== -1) return;
		this.hasLights = !!lights && lights.length > 0;
		this.lightKey = key;
		const old = this.lightBuffers;
		const grid = lightGridFor(lights);
		const store = (data: Float32Array | Uint32Array) => {
			const buffer = d.createBuffer({
				size: Math.max(16, data.byteLength),
				usage: BUFFER.STORAGE | BUFFER.COPY_DST,
			});
			d.queue.writeBuffer(buffer, 0, data);
			return buffer;
		};
		this.lightBuffers = {
			data: store(new Float32Array(lights && lights.length > 0 ? lights : [0, 0, 0, 0])),
			table: store(grid.table),
			index: store(grid.index),
		};
		if (old) for (const b of [old.data, old.table, old.index]) b.destroy();
	}

	private makeSkyMaps(buffers: GPUVertexBufferLayout[]): void {
		const d = this.device;
		this.skyMaps = d.createTexture({
			// The near maps twice: one set read, the other drawn (nearFillStep).
			size: [SKY_MAP, SKY_MAP, SKY_LAYERS + SKY_VIEWS],
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		this.skyCompare = d.createSampler({
			compare: "less-equal",
			magFilter: "linear",
			minFilter: "linear",
		});
		// The sky block, then the reflection cube's centre and the near set read:
		// see SkyU. The second, the block for the near maps being drawn, which
		// their cells are found from.
		const skyBuffer = () =>
			d.createBuffer({ size: SKY_BLOCK * 4 + 32, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
		this.skyUniform = skyBuffer();
		this.skyUniformNext = skyBuffer();
		const layout = d.createBindGroupLayout({
			entries: [{ binding: 0, visibility: STAGE.VERTEX, buffer: {} }],
		});
		const module = d.createShaderModule({
			code: `struct D { viewProj: mat4x4f };
@group(0) @binding(0) var<uniform> d: D;
struct VIn { @location(0) pos: vec3f, @location(2) c0: vec3f, @location(3) c1: vec3f, @location(4) c2: vec3f, @location(5) p: vec3f, @location(8) look: u32 };
@vertex fn vsDepth(v: VIn) -> @builtin(position) vec4f {
	// A part with CastShadow off (NO_SHADOW) is left out, past the far plane.
	if ((v.look & 0x80000000u) != 0u) { return vec4f(0.0, 0.0, 2.0, 1.0); }
	return d.viewProj * vec4f(mat3x3f(v.c0, v.c1, v.c2) * v.pos + v.p, 1.0);
}`,
		});
		this.pipeline((p) => (this.skyDepth = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
			vertex: { module, entryPoint: "vsDepth", buffers },
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
		});
		this.makeSunMaps();
		this.cascadeUniform = d.createBuffer({
			size: CASCADE_BLOCK * 4,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		this.cascadeGroups = SUN_CASCADES.map(() => {
			const buffer = d.createBuffer({ size: 64, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
			return {
				buffer,
				group: d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] }),
			};
		});
		this.skyViewGroups = Array.from({ length: SKY_LAYERS }, () => {
			const buffer = d.createBuffer({ size: 64, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
			return {
				buffer,
				group: d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] }),
			};
		});
		this.makeSkyOpen();
	}

	// -- the near sky maps opened: thin occluders taken out ---------------------------

	/** Two float scratch maps, and each pass's pipeline and bind groups. */
	private skyOpen?: {
		fromDepth: GPURenderPipeline;
		float: GPURenderPipeline;
		toDepth: GPURenderPipeline;
		scratch: [GPUTexture, GPUTexture];
		/** Pass 1 a near layer: its own depth into scratch 0. */
		first: GPUBindGroup[];
		/** Passes 2, 3 and 4: scratch 0 into 1, 1 into 0, 0 into the layer. */
		rest: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
		/** Scratch 1 into the layer as it is: the compute version's last step. */
		copy: GPUBindGroup;
	};

	/**
	 * Opening each near sky map (the farthest depth over a few texels, then the
	 * nearest): what is thinner than SKY_OPEN studs across, seen from the sky,
	 * no longer hides it, as Studio's coarse lighting lets the sky past window
	 * struts and rails; walls, floors and roofs still do.
	 */
	private makeSkyOpen(): void {
		const d = this.device;
		const module = d.createShaderModule({
			code: /* wgsl */ `
@group(0) @binding(0) var srcDepth: texture_depth_2d_array;
@group(0) @binding(1) var srcFloat: texture_2d<f32>;
// The step across the map, how many texels either side, and 1 for the nearest.
@group(0) @binding(2) var<uniform> f: vec4f;
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
	return vec4f(xy, 0.0, 1.0);
}
fn texelAt(c: vec2i) -> vec2i { return clamp(c, vec2i(0), vec2i(${SKY_MAP - 1})); }
@fragment fn fsFromDepth(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	let c = vec2i(pos.xy);
	let st = vec2i(f.xy);
	let r = i32(f.z);
	var m = 0.0;
	for (var j = -r; j <= r; j++) { m = max(m, textureLoad(srcDepth, texelAt(c + st * j), 0, 0)); }
	return vec4f(m, 0.0, 0.0, 1.0);
}
fn along(pos: vec4f) -> f32 {
	let c = vec2i(pos.xy);
	let st = vec2i(f.xy);
	let r = i32(f.z);
	let least = f.w > 0.5;
	var m = select(0.0, 2.0, least);
	for (var j = -r; j <= r; j++) {
		let v = textureLoad(srcFloat, texelAt(c + st * j), 0).r;
		m = select(max(m, v), min(m, v), least);
	}
	return m;
}
@fragment fn fsFloat(@builtin(position) pos: vec4f) -> @location(0) vec4f { return vec4f(along(pos), 0.0, 0.0, 1.0); }
@fragment fn fsToDepth(@builtin(position) pos: vec4f) -> @builtin(frag_depth) f32 { return along(pos); }
`,
		});
		const layout = d.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "depth", viewDimension: "2d-array" },
				},
				{ binding: 1, visibility: STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
				{ binding: 2, visibility: STAGE.FRAGMENT, buffer: {} },
			],
		});
		const pipelineLayout = d.createPipelineLayout({ bindGroupLayouts: [layout] });
		const toFloat = (entryPoint: string) =>
			d.createRenderPipeline({
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vsFull" },
				fragment: { module, entryPoint, targets: [{ format: "r32float" }] },
				primitive: { topology: "triangle-list" },
			});
		const toDepth = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsFull" },
			fragment: { module, entryPoint: "fsToDepth", targets: [] },
			primitive: { topology: "triangle-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "always" },
		});
		const scratch = [0, 1].map(() =>
			d.createTexture({
				size: [SKY_MAP, SKY_MAP],
				format: "r32float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING | TEXTURE.STORAGE_BINDING,
			}),
		) as [GPUTexture, GPUTexture];
		// SKY_OPEN studs across, as near maps' texels: see nearSkyInto.
		const texel = (2 * SKY_NEAR * 1.75) / SKY_MAP;
		const r = Math.max(1, Math.round(SKY_OPEN / 2 / texel));
		const uniform = (v: number[]) => this.make(new Float32Array(v), BUFFER.UNIFORM);
		const across = uniform([1, 0, r, 0]);
		const passes = [uniform([0, 1, r, 0]), uniform([1, 0, r, 1]), uniform([0, 1, r, 1])];
		// A layer not drawn into here, where a pass needs a depth view bound but reads none.
		const idle = this.skyMaps.createView({
			dimension: "2d-array",
			baseArrayLayer: 0,
			arrayLayerCount: 1,
		});
		const group = (depth: GPUTextureView, from: GPUTexture, buffer: GPUBuffer) =>
			d.createBindGroup({
				layout,
				entries: [
					{ binding: 0, resource: depth },
					{ binding: 1, resource: from.createView() },
					{ binding: 2, resource: { buffer } },
				],
			});
		this.skyOpen = {
			fromDepth: toFloat("fsFromDepth"),
			float: toFloat("fsFloat"),
			toDepth,
			scratch,
			first: Array.from({ length: 2 * SKY_VIEWS }, (_, k) =>
				group(
					this.skyMaps.createView({
						dimension: "2d-array",
						baseArrayLayer: SKY_NEAR_LAYER + k,
						arrayLayerCount: 1,
					}),
					scratch[1],
					across,
				),
			),
			rest: [
				group(idle, scratch[0], passes[0]),
				group(idle, scratch[1], passes[1]),
				group(idle, scratch[0], passes[2]),
			],
			copy: group(idle, scratch[1], uniform([0, 1, 0, 1])),
		};
		// The four passes until it is built, and where it cannot be.
		this.makeSkyOpenCompute(r).catch(() => {
			this.skyOpenCompute = null;
		});
	}

	/**
	 * The near maps opened in compute, where the device can: the farthest
	 * depth over a square of texels, then the nearest over a square of that,
	 * each square a tile in workgroup memory, then copied into the map. The
	 * same as the four passes (a square is its two strokes, the map's edge
	 * clamped along each), in one compute pass and one render pass a map
	 * rather than four render passes, each a full map in and out of memory:
	 * on an iPad, 12-14 ms of a near map redraw's 20 (canary.16).
	 */
	private skyOpenCompute: {
		dilate: GPUComputePipeline;
		erode: GPUComputePipeline;
		dilateGroups: GPUBindGroup[];
		erodeGroup: GPUBindGroup;
		copyGroup: GPUBindGroup;
	} | null = null;

	private async makeSkyOpenCompute(r: number): Promise<void> {
		const o = this.skyOpen;
		if (!o) return;
		const d = this.device;
		const tile = 16;
		const wide = tile + 2 * r;
		const entry = (name: string, load: string, op: string) => /* wgsl */ `
@compute @workgroup_size(${tile}, ${tile}) fn ${name}(
	@builtin(workgroup_id) wg: vec3u,
	@builtin(local_invocation_id) lid: vec3u,
	@builtin(local_invocation_index) li: u32,
) {
	let origin = vec2i(wg.xy) * ${tile};
	for (var i = li; i < ${wide * wide}u; i += ${tile * tile}u) {
		let c = clamp(origin - ${r} + vec2i(i32(i % ${wide}u), i32(i / ${wide}u)), vec2i(0), vec2i(${SKY_MAP - 1}));
		square[i] = ${load};
	}
	workgroupBarrier();
	for (var i = li; i < ${tile * wide}u; i += ${tile * tile}u) {
		let x = i % ${tile}u;
		let y = i / ${tile}u;
		var m = square[y * ${wide}u + x];
		for (var j = 1u; j <= ${2 * r}u; j++) { m = ${op}(m, square[y * ${wide}u + x + j]); }
		rows[y * ${tile}u + x] = m;
	}
	workgroupBarrier();
	var m = rows[lid.y * ${tile}u + lid.x];
	for (var j = 1u; j <= ${2 * r}u; j++) { m = ${op}(m, rows[(lid.y + j) * ${tile}u + lid.x]); }
	textureStore(dst, origin + vec2i(lid.xy), vec4f(m, 0.0, 0.0, 1.0));
}`;
		const module = d.createShaderModule({
			code: /* wgsl */ `
@group(0) @binding(0) var srcDepth: texture_depth_2d_array;
@group(0) @binding(1) var srcFloat: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<r32float, write>;
var<workgroup> square: array<f32, ${wide * wide}>;
var<workgroup> rows: array<f32, ${tile * wide}>;
${entry("csDilate", "textureLoad(srcDepth, c, 0, 0)", "max")}
${entry("csErode", "textureLoad(srcFloat, c, 0).r", "min")}
`,
		});
		const store = {
			binding: 2,
			visibility: STAGE.COMPUTE,
			storageTexture: { access: "write-only" as const, format: "r32float" as const },
		};
		const dilateLayout = d.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: STAGE.COMPUTE,
					texture: { sampleType: "depth", viewDimension: "2d-array" },
				},
				store,
			],
		});
		const erodeLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 1, visibility: STAGE.COMPUTE, texture: { sampleType: "unfilterable-float" } },
				store,
			],
		});
		const [dilate, erode] = await Promise.all([
			d.createComputePipelineAsync({
				layout: d.createPipelineLayout({ bindGroupLayouts: [dilateLayout] }),
				compute: { module, entryPoint: "csDilate" },
			}),
			d.createComputePipelineAsync({
				layout: d.createPipelineLayout({ bindGroupLayouts: [erodeLayout] }),
				compute: { module, entryPoint: "csErode" },
			}),
		]);
		const [s0, s1] = o.scratch;
		this.skyOpenCompute = {
			dilate,
			erode,
			dilateGroups: Array.from({ length: 2 * SKY_VIEWS }, (_, k) =>
				d.createBindGroup({
					layout: dilateLayout,
					entries: [
						{
							binding: 0,
							resource: this.skyMaps.createView({
								dimension: "2d-array",
								baseArrayLayer: SKY_NEAR_LAYER + k,
								arrayLayerCount: 1,
							}),
						},
						{ binding: 2, resource: s0.createView() },
					],
				}),
			),
			erodeGroup: d.createBindGroup({
				layout: erodeLayout,
				entries: [
					{ binding: 1, resource: s0.createView() },
					{ binding: 2, resource: s1.createView() },
				],
			}),
			copyGroup: o.copy,
		};
		// The near maps opened before it was ready: opened again with it.
		this.skyDirty = true;
		this.onRedraw?.();
	}

	/**
	 * Opens the near maps just drawn, `count` of them from the near layer
	 * `from` (either set's): see makeSkyOpen.
	 */
	private openNearMaps(encoder: GPUCommandEncoder, from = 0, count = SKY_VIEWS): void {
		const o = this.skyOpen;
		if (!o) return;
		// Not on Apple's GPUs: an iPad Mini's took 17-19 ms in compute against
		// 12-14 ms for the four passes (canary.17).
		const cs = /apple/i.test(this.gpuName) ? null : this.skyOpenCompute;
		if (cs) {
			const groups = SKY_MAP / 16;
			for (let k = from; k < from + count; k++) {
				const pass = encoder.beginComputePass({
					timestampWrites: this.stamp(null) as GPUComputePassTimestampWrites | undefined,
				});
				pass.setPipeline(cs.dilate);
				pass.setBindGroup(0, cs.dilateGroups[k]);
				pass.dispatchWorkgroups(groups, groups);
				pass.setPipeline(cs.erode);
				pass.setBindGroup(0, cs.erodeGroup);
				pass.dispatchWorkgroups(groups, groups);
				pass.end();
				const copy = encoder.beginRenderPass({
					timestampWrites: this.stamp(null),
					colorAttachments: [],
					depthStencilAttachment: {
						view: this.skyMaps.createView({
							dimension: "2d",
							baseArrayLayer: SKY_NEAR_LAYER + k,
							arrayLayerCount: 1,
						}),
						depthLoadOp: "load",
						depthStoreOp: "store",
					},
				});
				copy.setPipeline(o.toDepth);
				copy.setBindGroup(0, cs.copyGroup);
				copy.draw(3);
				copy.end();
			}
			return;
		}
		const toScratch = (k: 0 | 1) => ({
			colorAttachments: [
				{ view: o.scratch[k].createView(), loadOp: "clear" as const, storeOp: "store" as const },
			],
		});
		for (let k = from; k < from + count; k++) {
			const steps: [GPURenderPassDescriptor, GPURenderPipeline, GPUBindGroup][] = [
				[toScratch(0), o.fromDepth, o.first[k]],
				[toScratch(1), o.float, o.rest[0]],
				[toScratch(0), o.float, o.rest[1]],
				[
					{
						colorAttachments: [],
						depthStencilAttachment: {
							view: this.skyMaps.createView({
								dimension: "2d",
								baseArrayLayer: SKY_NEAR_LAYER + k,
								arrayLayerCount: 1,
							}),
							depthLoadOp: "load",
							depthStoreOp: "store",
						},
					},
					o.toDepth,
					o.rest[2],
				],
			];
			for (const [desc, pipeline, bound] of steps) {
				const pass = encoder.beginRenderPass({ ...desc, timestampWrites: this.stamp(null) });
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, bound);
				pass.draw(3);
				pass.end();
			}
		}
	}

	// -- the sun's cascades: see cascadeBlock ----------------------------------------

	private sunMaps!: GPUTexture;
	private cascadeUniform!: GPUBuffer;
	private cascadeGroups: { buffer: GPUBuffer; group: GPUBindGroup }[] = [];
	/** The cascades last drawn, to draw them again only when they moved. */
	private cascadeLast: Float32Array = new Float32Array(CASCADE_BLOCK);
	private cadence = new CascadeCadence();
	/** The place's box, kept with its fingerprint. */
	private box: { min: number[]; max: number[] } | null = null;

	/** The sun's cascades for this view, drawn again when they or the parts moved. */
	private drawCascades(encoder: GPUCommandEncoder, camera: Camera, partsMoved: boolean): void {
		// Shadows frozen from the Rendering panel: the maps drawn last are sampled as they are.
		if (this.render.freezeShadows) return;
		const l = this.lighting;
		const fresh = cascadeBlock(
			camera,
			this.width / this.height,
			l?.sun ?? [0, 1, 0],
			this.box,
			l?.shadowSoftness ?? 0.2,
			l?.sunShadows ?? true,
			true,
			this.quality,
			this.shadowMap,
		);
		// While only the camera moves, the far cascades on a cadence: see CascadeCadence.
		const step = this.cadence.next(fresh, this.cascadeLast, l?.sun ?? [0, 1, 0], partsMoved);
		if (!step) return;
		const { block, due } = step;
		this.cascadeLast = block;
		this.redrawn.sunMaps++;
		const q = this.device.queue;
		q.writeBuffer(this.cascadeUniform, 0, block);
		// One frame more once the camera stops, for the cascades still behind.
		if (step.again) this.onRedraw?.();
		if (block[SUN_CASCADES.length * 16 + 7] !== 1) return;
		this.cascadeGroups.forEach(({ buffer, group }, k) => {
			if (!due[k]) return;
			q.writeBuffer(buffer, 0, block.subarray(k * 16, k * 16 + 16));
			const pass = encoder.beginRenderPass({
				timestampWrites: this.stamp("shadows"),
				colorAttachments: [],
				depthStencilAttachment: {
					view: this.sunMaps.createView({ dimension: "2d", baseArrayLayer: k, arrayLayerCount: 1 }),
					depthClearValue: 1,
					depthLoadOp: "clear",
					depthStoreOp: "store",
				},
			});
			pass.setPipeline(this.skyDepth);
			pass.setBindGroup(0, group);
			this.solids(pass);
			pass.end();
		});
	}

	/**
	 * A frame's share of the near maps drawn again for the camera's new
	 * centre, into the set not read: two maps a frame with their thin parts,
	 * then the cells' own shares, then their averages, and all read at once.
	 */
	private nearFillStep(encoder: GPUCommandEncoder, centre: number[]): GPUCommandEncoder {
		if (this.render.freezeShadows) return encoder;
		const box = this.scene ? sceneBox(this.scene) : null;
		if (!box) return encoder;
		const q = this.device.queue;
		const other = (1 - this.nearSet) * SKY_VIEWS;
		if (!this.nearFill) {
			const block = skyBlock(box, this.lighting?.sun ?? [0, 1, 0], true);
			nearSkyInto(block, box, centre, true);
			q.writeBuffer(this.skyUniformNext, 0, block);
			q.writeBuffer(this.skyUniformNext, SKY_BLOCK * 4 + 16, new Float32Array([other, 0, 0, 0]));
			this.nearFill = {
				centre,
				block,
				step: 0,
				bind: this.bindWith(this.reflCube, this.skyUniformNext),
			};
		}
		const fill = this.nearFill;
		let at = encoder;
		// One map a frame, then the cells in two: a re-centre spread thin, not a hitch.
		if (fill.step < SKY_VIEWS) {
			const from = fill.step;
			for (let j = from; j < from + 1; j++) {
				const k = SKY_NEAR_LAYER + j;
				const { buffer, group } = this.skyViewGroups[k];
				q.writeBuffer(buffer, 0, fill.block.subarray(k * 16, k * 16 + 16));
				const pass = at.beginRenderPass({
					timestampWrites: this.stamp(null),
					colorAttachments: [],
					depthStencilAttachment: {
						view: this.skyMaps.createView({
							dimension: "2d",
							baseArrayLayer: k + other,
							arrayLayerCount: 1,
						}),
						depthClearValue: 1,
						depthLoadOp: "clear",
						depthStoreOp: "store",
					},
				});
				pass.setPipeline(this.skyDepth);
				pass.setBindGroup(0, group);
				this.solids(pass);
				pass.end();
			}
			at = this.cut(at, "skyMaps");
			if (passesOf(this.render.features).thinParts) {
				this.openNearMaps(at, other + from, 1);
				at = this.cut(at, "skyOpen");
			}
			fill.step++;
			return at;
		}
		if (fill.step === SKY_VIEWS) {
			this.fillCells(at, fill.bind, "own", false);
			fill.step++;
			return this.cut(at, "skyCells");
		}
		this.fillCells(at, fill.bind, "around", false);
		at = this.cut(at, "skyCells");
		// All drawn: the maps, their block and their cells read from here on.
		q.writeBuffer(this.skyUniform, 0, fill.block);
		q.writeBuffer(this.skyUniform, SKY_BLOCK * 4 + 16, new Float32Array([other, 0, 0, 0]));
		this.nearSet = 1 - this.nearSet;
		this.cellsRead = 1 - this.cellsRead;
		this.nearCentre = fill.centre;
		this.nearFill = null;
		this.redrawn.nearMaps++;
		this.rebind();
		// The cube's faces are lit by the near maps: drawn again a face a frame,
		// as a cube drawn while the camera moved shows the maps it left behind.
		this.reflStale();
		return at;
	}

	/**
	 * The place's depth from each sky direction and the sun, into the maps:
	 * the whole place's when parts moved, the sun's when it moved, and the
	 * near maps round `centre` when either did or the camera moved a step.
	 */
	private drawSkyMaps(
		encoder: GPUCommandEncoder,
		which: { far: boolean; sun: boolean; near: boolean },
		centre: number[],
	): GPUCommandEncoder {
		// Shadows frozen from the Rendering panel: the maps drawn last are sampled as they are.
		if (this.render.freezeShadows) return encoder;
		this.skyDirty = false;
		this.sunDirty = false;
		this.nearCentre = centre;
		const q = this.device.queue;
		const box = this.scene ? sceneBox(this.scene) : null;
		const block = skyBlock(box, this.lighting?.sun ?? [0, 1, 0], true);
		if (box) nearSkyInto(block, box, centre, true);
		q.writeBuffer(this.skyUniform, 0, block);
		if (!box) return encoder;
		this.skyViewGroups.forEach(({ buffer, group }, k) => {
			const drawn = k < SKY_VIEWS ? which.far : k === SKY_VIEWS ? which.sun : which.near;
			if (!drawn) return;
			q.writeBuffer(buffer, 0, block.subarray(k * 16, k * 16 + 16));
			const pass = encoder.beginRenderPass({
				timestampWrites: this.stamp("shadows"),
				colorAttachments: [],
				depthStencilAttachment: {
					view: this.skyMaps.createView({
						dimension: "2d",
						baseArrayLayer: k >= SKY_NEAR_LAYER ? k + this.nearSet * SKY_VIEWS : k,
						arrayLayerCount: 1,
					}),
					depthClearValue: 1,
					depthLoadOp: "clear",
					depthStoreOp: "store",
				},
			});
			pass.setPipeline(this.skyDepth);
			pass.setBindGroup(0, group);
			this.solids(pass);
			pass.end();
		});
		if (which.near) this.redrawn.nearMaps++;
		// While profiling, each part a stage of its own: the maps, the thin
		// parts taken out of the near ones, and the cells found from them.
		let at = this.cut(encoder, "skyMaps");
		if (which.near && passesOf(this.render.features).thinParts) {
			this.openNearMaps(at, this.nearSet * SKY_VIEWS);
			at = this.cut(at, "skyOpen");
		}
		if (which.near) {
			this.fillCells(at);
			at = this.cut(at, "skyCells");
		}
		return at;
	}

	/** Where each material texture layer is in `looks`: only the ones the place uses. */
	private lookSlots = new Map<number, number>();

	/** The material textures' array, `count` layers; empty until each is given. */
	private makeLooks(count: number): void {
		this.looks?.destroy();
		this.looks = this.device.createTexture({
			size: [TEXTURE_SIZE, TEXTURE_SIZE, Math.max(1, count)],
			mipLevelCount: TEXTURE_LEVELS,
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		this.loaded = new Set();
	}

	setLookLayers(layers: readonly number[]): boolean {
		const fresh = layers.filter((l) => !this.lookSlots.has(l));
		if (fresh.length === 0) return false;
		for (const l of fresh) this.lookSlots.set(l, this.lookSlots.size);
		this.makeLooks(this.lookSlots.size);
		this.device.queue.writeBuffer(this.uniform, UNIFORM_MATERIALS, this.lookBlock());
		if (this.bind) this.rebind();
		return true;
	}

	private lookBlock(): Float32Array {
		return materialBlock(this.loaded, (layer) => this.lookSlots.get(layer) ?? 0);
	}

	setLook(layer: number, levels: readonly (HTMLCanvasElement | ImageBitmap)[]): void {
		const slot = this.lookSlots.get(layer);
		// Not one the place said it uses: no room kept for it.
		if (slot === undefined) return;
		levels.forEach((source, mipLevel) => {
			this.device.queue.copyExternalImageToTexture(
				{ source },
				{ texture: this.looks, mipLevel, origin: [0, 0, slot] },
				[source.width, source.height],
			);
		});
		this.loaded.add(layer);
		this.device.queue.writeBuffer(this.uniform, UNIFORM_MATERIALS, this.lookBlock());
		// The reflection cube was drawn with the material's plain pattern: again, with its texture.
		this.reflStale();
	}

	destroy(): void {
		this.destroyed = true;
		this.effects?.destroy();
		this.device?.destroy();
	}

	/** Gone: a switch whose pipelines compile after leaves it alone. */
	private destroyed = false;

	async pick(camera: Camera, cx: number, cy: number): Promise<number> {
		// The canvas's pixels to the frame's, where it is upscaled.
		const out = this.upscaling() ? this.upOut : null;
		const x = out ? Math.floor((cx * this.width) / out.width) : cx;
		const y = out ? Math.floor((cy * this.height) / out.height) : cy;
		// The pick is not jittered, as no still frame's is.
		this.jitter = [0, 0];
		this.setCamera(camera);
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.pickTarget!.createView(),
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: this.pickDepth!.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.ids);
		pass.setScissorRect(Math.min(x, this.width - 1), Math.min(y, this.height - 1), 1, 1);
		this.solids(pass);
		this.solids(pass, this.clear);
		this.solids(pass, this.glass);
		pass.end();
		encoder.copyTextureToBuffer(
			{
				texture: this.pickTarget!,
				origin: { x: Math.min(x, this.width - 1), y: Math.min(y, this.height - 1) },
			},
			{ buffer: this.pickRead, bytesPerRow: 256 },
			{ width: 1, height: 1 },
		);
		this.device.queue.submit([encoder.finish()]);
		await this.pickRead.mapAsync(MAP_READ);
		const id = new Uint32Array(this.pickRead.getMappedRange().slice(0, 4))[0];
		this.pickRead.unmap();
		return id - 1;
	}
}
