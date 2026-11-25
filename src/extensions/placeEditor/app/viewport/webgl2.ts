/**
 * The viewport's renderer where WebGPU is not: WebGL2, with the same shading,
 * outline and picking as WebGpuView.
 *
 * Nothing here is Roblox's. The shaders are written for Roswaal; where a
 * number makes a place look as it does in Studio, it was fitted to Studio's
 * screen captures of test parts, taken from the same camera as Roswaal's view
 * and compared pixel for pixel. Roblox's engine, shaders and files were never
 * read.
 */

import { type LightingParams, lightingBlock } from "../../core/lighting.js";
import { MATERIALS, materialBlock } from "../../core/materials.js";
import { LIGHT_STRIDE, type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/scene.js";
import {
	AA_GLSL,
	AA_VS,
	type AntialiasMode,
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
	EyeTrack,
	occlusionTests,
	rowRuns,
	sameView,
	sidePlanes,
	visibleRuns,
} from "./culling.js";
import { GlEffects } from "./effectsGl.js";
import { boxEdges, featureEdges, meshFor, sceneGlows } from "./geometry.js";
import { canvasBytes, GpuMemory, trackWebGl2 } from "./gpuMemory.js";
import { HANDLE_KINDS, type Handles, handleMesh } from "./handles.js";
import { invert, lookAt, multiply, perspective } from "./math.js";
import {
	OCC_CELL,
	OCC_MARGIN,
	OCC_SIZE,
	OCC_STEPS,
	Occupancy,
	occupancyWrites,
} from "./occupancy.js";
import { lightGridFor } from "./prepare.js";
import { type Probe, type StageSink, WaitingClock } from "./profile.js";
import { FEATURE_BIT, featureBits, featureOn, passesOf } from "./renderFeatures.js";
import { DENSITY_FS_GLSL, DENSITY_GLSL, OVERDRAW_GLSL, VIEWS_GLSL } from "./renderViews.js";
import { SMAA_AREA, SMAA_SEARCH, smaaTables } from "./smaaTables.js";
import { TEXTURE_LEVELS, TEXTURE_SIZE } from "./textures.js";
import {
	autoLightGrid,
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
	type CascadeFit,
	COST_FULL,
	cascadeBlock,
	DEFAULT_RENDER,
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
	halfPassStep,
	IMAGE_VERTEX,
	type ImageLayer,
	type ImageQuad,
	imageOrder,
	imageQuads,
	LIGHT_CELL,
	LIGHT_GRID_CASCADES,
	LIGHT_GRID_CELLS,
	LIGHTS_FULL,
	type LightGridRegion,
	lightGridMove,
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
	REFLECTION_CACHE,
	type RenderSettings,
	type RenderStats,
	reflectionCell,
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

const COMMON = `
uniform vec4 L[11];
// The Rendering panel: its view (RENDER_MODE_CODE), its switches' bits
// (renderFeatures.ts), whether the heatmaps are linear, and the view drawn
// over it: see renderDebug.
uniform vec4 R;
// Whether a switch is on, as WebGpuView's has.
bool has(int bit) { return (int(R.y + 0.5) & bit) != 0; }
// As WebGpuView's sunLight.
vec3 sunLight(vec3 dir) {
	float a = dot(dir, L[0].xyz);
	float disc = smoothstep(L[1].w - 0.00002, L[1].w + 0.00008, a);
	float glow = pow(max(a, 0.0), 48.0) * (0.18 + L[5].w * 0.6) + pow(max(a, 0.0), 6.0) * 0.06;
	return L[1].rgb * (disc * 4.0 + glow);
}
vec3 sky(vec3 dir) {
	vec3 c = dir.y >= 0.0 ? mix(L[3].rgb, L[4].rgb, clamp(1.0 - dir.y / 0.14, 0.0, 1.0)) : mix(L[4].rgb, L[5].rgb, min(1.0, -dir.y * 5.0));
	// The sun made here, unless the Sky has a sun image of its own.
	return c + (L[6].w > 0.0 ? vec3(0.0) : sunLight(dir));
}
// Stephen Hill's fit of the ACES curve, as BakingLab (MIT) has it.
vec3 aces(vec3 colour) {
	mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
	mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
	vec3 v = i * colour;
	vec3 a = v * (v + 0.0245786) - 0.000090537;
	vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return clamp(o * (a / b), 0.0, 1.0);
}
vec3 display(vec3 c) { vec3 t = aces(c * L[3].w); return pow(t, vec3(1.0 / 2.2)); }
vec3 air(vec3 c, float d, float y) {
	if (L[8].z > 0.5) return mix(c, L[9].rgb, clamp((d - L[8].x) / max(L[8].y - L[8].x, 1.0), 0.0, 1.0));
	float thin = exp(-max(y, 0.0) * 0.004);
	return mix(c, L[10].rgb, 1.0 - exp(-d * L[4].w * thin));
}
`;
// A material's pattern, as WebGpuView's \`pattern\` draws it.
const PATTERNS = `
// Neon as measured from Studio's captures, as WebGpuView's neonLevel and neonAlpha.
vec3 neonLevel(vec3 colour, float alpha) {
	float t = 1.0 - alpha;
	return 2.74 * pow(colour, vec3(1.0 / 2.2)) * (1.0 - 0.2 * t * sqrt(t)) - 0.545;
}
float neonAlpha(float alpha) {
	float t = 1.0 - alpha;
	return pow(1.0 - t * t, 0.75);
}
// Roswaal's own hash, as WebGpuView's \`mixBits\`: see \`scripts/find-hash.mjs\`.
uint mixBits(uint v) {
	uint x = v;
	x ^= x >> 18u;
	x *= 0xe71d6283u;
	x ^= x >> 15u;
	x *= 0x1f04730du;
	x ^= x >> 18u;
	return x;
}
float toUnit(uint h) { return float(h >> 8u) / 16777216.0; }
uint cellBits(vec2 p) { uvec2 q = uvec2(ivec2(p)); return mixBits(q.x ^ mixBits(q.y)); }
float hash1(vec2 p) { return toUnit(cellBits(p)); }
vec2 hash2(vec2 p) { uint h = cellBits(p); return vec2(toUnit(h), toUnit(mixBits(h))); }
float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 w = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), w.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), w.x), w.y);
}
vec2 cells(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	float id = 0.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 r = g + hash2(i + g) - f;
			float d = dot(r, r);
			if (d < d1) { d2 = d1; d1 = d; id = hash1(i + g); } else if (d < d2) { d2 = d; }
		}
	}
	return vec2(sqrt(d2) - sqrt(d1), id);
}
float edgeOf(float v) { return min(fract(v), 1.0 - fract(v)); }
vec3 pattern(int kind, vec2 uv, float size) {
	switch (kind) {
		case 1: {
			float g = noise2(uv * vec2(0.5, 4.0) / size);
			float s = sin(uv.y * 10.0 / size + g * 7.0) * 0.5 + 0.5;
			return vec3(0.86 + 0.24 * s, 1.0, 0.0);
		}
		case 2: {
			float row = floor(uv.y);
			float x = uv.x + hash1(vec2(row, 7.0)) * 4.0;
			float line = 1.0 - smoothstep(0.02, 0.05, min(edgeOf(uv.y), edgeOf(x / 4.0) * 4.0));
			float g = noise2(vec2(x * 0.5, uv.y * 4.0) / size);
			float s = sin(uv.y * 14.0 + g * 6.0) * 0.5 + 0.5;
			float tint = 0.9 + 0.18 * hash1(vec2(row, floor(x / 4.0)));
			return vec3(tint * (0.88 + 0.16 * s) * (1.0 - 0.5 * line), 1.0 - line, 0.0);
		}
		case 3: {
			float row = floor(uv.y);
			float x = uv.x / 2.0 + 0.5 * (row - 2.0 * floor(row / 2.0));
			float mortar = 1.0 - smoothstep(0.05, 0.09, min(edgeOf(x) * 2.0, edgeOf(uv.y)));
			float tint = 0.86 + 0.24 * hash1(vec2(floor(x), row));
			return vec3(mix(tint, 1.3, mortar), 1.0 - 0.7 * mortar, 0.0);
		}
		case 4:
		case 5: {
			vec2 c = cells(uv * (kind == 5 ? 2.6 : 0.9) / size);
			float edge = 1.0 - smoothstep(0.03, 0.14, c.x);
			return vec3((0.82 + 0.3 * c.y) * (1.0 - 0.55 * edge), 1.0 - edge, 0.0);
		}
		case 6: {
			vec2 r = vec2(uv.x + uv.y, uv.x - uv.y) * 1.2;
			vec2 q = abs(fract(r) - 0.5);
			float bump = 1.0 - smoothstep(0.12, 0.18, q.x * 0.45 + q.y);
			return vec3(0.9 + 0.22 * bump, 1.0 + 0.8 * bump, 0.0);
		}
		case 7: {
			vec2 t = uv / 2.0;
			float grout = 1.0 - smoothstep(0.03, 0.06, min(edgeOf(t.x), edgeOf(t.y)) * 2.0);
			float tint = 0.94 + 0.1 * hash1(floor(t));
			return vec3(mix(tint, 0.68, grout), 1.0 - grout, 0.0);
		}
		case 8: {
			float row = floor(uv.y * 1.5);
			float x = uv.x + 0.5 * (row - 2.0 * floor(row / 2.0));
			float line = 1.0 - smoothstep(0.02, 0.05, edgeOf(x));
			float tint = 0.92 + 0.12 * hash1(vec2(floor(x), row));
			return vec3((0.72 + 0.34 * fract(uv.y * 1.5)) * tint * (1.0 - 0.35 * line), 1.0, 0.0);
		}
		case 9: {
			float w = sin(uv.x * 30.0 / size) * sin(uv.y * 30.0 / size);
			return vec3(0.93 + 0.1 * w, 1.0, 0.0);
		}
		case 10: {
			float n = noise2(uv * 4.0 / size) * 0.5 + hash1(floor(uv * 20.0 / size)) * 0.5;
			return vec3(0.86 + 0.26 * n, 1.0, 0.0);
		}
		case 11: {
			float n = noise2(uv * 0.7 / size) * 0.6 + noise2(uv * 3.0 / size) * 0.4;
			return vec3(0.78 + 0.4 * n, 1.0, 0.0);
		}
		case 12: {
			float n = noise2(uv * 0.6 / size);
			float s = hash1(floor(uv * 28.0 / size));
			return vec3((0.82 + 0.26 * n) * (0.86 + 0.26 * s), 1.0, 0.0);
		}
		case 13: {
			float n = noise2(uv * 1.1 / size) * 0.7 + noise2(uv * 5.0 / size) * 0.3;
			float b = smoothstep(0.42, 0.62, n);
			return vec3(1.0 - 0.32 * b, 1.0 - 0.6 * b, 0.0);
		}
		case 14: {
			vec2 c = cells(uv * 0.8 / size);
			float crack = 1.0 - smoothstep(0.02, 0.08, c.x);
			return vec3((0.4 + 0.25 * c.y) * (1.0 - crack), 1.0 - crack, crack);
		}
		case 15: {
			float n = noise2(uv * 0.5 / size) * 3.0 + noise2(uv * 2.0 / size);
			float vein = 1.0 - smoothstep(0.0, 0.1, abs(sin((uv.x + uv.y) * 0.7 + n * 2.0)));
			return vec3(1.0 - 0.35 * vein, 1.0, 0.0);
		}
	}
	return vec3(1.0, 1.0, 0.0);
}
vec2 faceUv(vec3 local, vec3 ln) {
	vec3 a = abs(ln);
	if (a.y >= a.x && a.y >= a.z) return local.xz;
	if (a.x >= a.z) return local.zy;
	return local.xy;
}
const vec3 LAVA = vec3(1.0, 0.1, 0.02);
const vec3 LAVA_HOT = vec3(1.0, 0.45, 0.1);
vec3 lavaLight(float m) { return mix(LAVA, LAVA_HOT, m * m) * m; }
`;
// A surface in its material, as WebGpuView's \`surface\` draws it.
// The place's depth from each sky direction, and the sun's last, as WebGpuView's skySees.
const SKY_VIS = `
uniform highp sampler2DArrayShadow skyMaps;
uniform mat4 skyViews[${SKY_LAYERS}];
uniform vec4 skyInfo;
// The near maps' texel and depth, and their box, as WebGpuView's SkyU.
uniform vec4 skyNear;
uniform vec4 skyNearAt;
float skySeesIn(int k, vec3 p, vec4 info);
float skySees(int k, vec3 p) { return skySeesIn(k, p, skyInfo); }
float skySeesIn(int k, vec3 p, vec4 info) {
	vec4 c = skyViews[k] * vec4(p, 1.0);
	vec3 q = c.xyz * 0.5 + 0.5;
	if (any(lessThan(q.xy, vec2(0.0))) || any(greaterThan(q, vec3(1.0)))) return 1.0;
	// Four taps SKY_SOFT studs apart, as WebGpuView's skySees.
	float a = float(k) * 0.785;
	float spread = clamp(${SKY_SOFT}.0 / max(info.x, 1e-3), 1.0, 6.0) * info.z;
	vec2 o = vec2(cos(a), sin(a)) * spread;
	vec2 h = vec2(-o.y, o.x) * 0.5;
	float depth = q.z - info.y * 0.25;
	float seen = 0.25 * (texture(skyMaps, vec4(q.xy + o, float(k), depth)) + texture(skyMaps, vec4(q.xy - o, float(k), depth)) + texture(skyMaps, vec4(q.xy + h, float(k), depth)) + texture(skyMaps, vec4(q.xy - h, float(k), depth)));
	// Only parts within SKY_REACH above the camera, as WebGpuView's skySeesIn.
	if (k == ${SKY_VIEWS}) return seen;
	float rise = (k == 0 || k == ${SKY_NEAR_LAYER}) ? 1.0 : 0.70711;
	float along = (L[6].y + ${SKY_REACH}.0 - p.y) / rise;
	if (along <= 0.0) return 1.0;
	float within = texture(skyMaps, vec4(q.xy, float(k), q.z - along * info.y * 0.5));
	return clamp(seen + 1.0 - within, 0.0, 1.0);
}
// The place's lights, as WebGpuView's partLights: five texels a light, a row
// each; and which reach a cell, 256 hashes a row, see lightGrid.
uniform highp sampler2D lightData;
uniform highp usampler2D lightTable;
uniform highp usampler2D lightIndex;
// The light grid's switches, as WebGpuView's GridU.info: x, the grid is
// read (see GRID_READ); y, Soft: light objects flat, partLights' too.
uniform vec4 gridInfo;
// Soft's fall over a light's Range, and a SpotLight's share under Soft, as
// WebGpuView's SOFT_FALL.
float softFall(float x) {
	return clamp(1.0 - 1.53 * (x - 0.5), 0.0, 1.0) * (1.0 - smoothstep(0.92, 1.0, x)) * 0.72;
}
float softSpot(float angle) {
	return (1.0 - cos(angle)) * 0.5;
}
uint lightCell(vec3 p) {
	ivec3 c = ivec3(floor(p / 16.0));
	uint h = (uint(c.x) * 73856093u) ^ (uint(c.y) * 19349663u) ^ (uint(c.z) * 83492791u);
	return h & 65535u;
}
// Each light's highlight too, into shine, as WebGpuView's partLights.
vec3 partLights(vec3 p, vec3 n, vec3 v, float gloss, out vec3 shine) {
	uint h = lightCell(p);
	uvec2 b = texelFetch(lightTable, ivec2(int(h & 255u), int(h >> 8u)), 0).xy;
	vec3 sum = vec3(0.0);
	shine = vec3(0.0);
	uint count = min(b.y, 64u);
	for (uint j = 0u; j < count; j++) {
		uint idx = b.x + j;
		int i = int(texelFetch(lightIndex, ivec2(int(idx & 1023u), int(idx >> 10u)), 0).r);
		vec4 a = texelFetch(lightData, ivec2(0, i), 0);
		vec4 col = texelFetch(lightData, ivec2(1, i), 0);
		vec4 d = texelFetch(lightData, ivec2(2, i), 0);
		int kind = col.w > 1.5 ? ${FEATURE_BIT.surfaceLights} : col.w > 0.5 ? ${FEATURE_BIT.spotLights} : ${FEATURE_BIT.pointLights};
		if (!has(kind)) continue;
		vec3 at = a.xyz;
		if (col.w > 1.5) {
			// Only in front of its face, as WebGpuView's partLights.
			if (dot(p - a.xyz, d.xyz) < 0.05) continue;
			vec3 u = texelFetch(lightData, ivec2(3, i), 0).xyz;
			vec3 v = texelFetch(lightData, ivec2(4, i), 0).xyz;
			vec3 off = p - a.xyz;
			at = a.xyz + u * clamp(dot(off, u) / max(dot(u, u), 1e-6), -1.0, 1.0) + v * clamp(dot(off, v) / max(dot(v, v), 1e-6), -1.0, 1.0);
		}
		vec3 to = at - p;
		float dist = length(to);
		if (dist >= a.w) continue;
		vec3 l = to / max(dist, 1e-4);
		// Soft (gridInfo.y): flat, a face lit whichever way it turns, as WebGpuView's.
		bool soft = gridInfo.y > 0.5;
		float k = soft ? softFall(dist / a.w) : max(dot(n, l), 0.0) * (1.0 - smoothstep(0.7, 1.0, dist / a.w));
		if (soft && col.w > 0.5 && col.w < 1.5) {
			k *= softSpot(d.w);
		} else if (col.w > 0.5) {
			float c = dot(-l, d.xyz);
			if (c <= 0.0) continue;
			k *= 1.0 - smoothstep(0.0, 1.0, atan(length(cross(-l, d.xyz)), c) / max(d.w, 1e-3));
		}
		sum += col.rgb * k;
		if (!soft) shine += col.rgb * k * pow(max(dot(n, normalize(l + v)), 0.0), gloss);
	}
	shine *= 1.25;
	return sum * 1.25;
}
// The Rendering panel's heatmaps, as WebGpuView's lightWork: the lights p is
// tested against, those that reach it, and those weighed by how strongly.
vec3 lightWork(vec3 p, vec3 n) {
	uint h = lightCell(p);
	uvec2 b = texelFetch(lightTable, ivec2(int(h & 255u), int(h >> 8u)), 0).xy;
	uint count = min(b.y, 64u);
	float reached = 0.0;
	float weight = 0.0;
	for (uint j = 0u; j < count; j++) {
		uint idx = b.x + j;
		int i = int(texelFetch(lightIndex, ivec2(int(idx & 1023u), int(idx >> 10u)), 0).r);
		vec4 a = texelFetch(lightData, ivec2(0, i), 0);
		vec4 col = texelFetch(lightData, ivec2(1, i), 0);
		vec4 d = texelFetch(lightData, ivec2(2, i), 0);
		int kind = col.w > 1.5 ? ${FEATURE_BIT.surfaceLights} : col.w > 0.5 ? ${FEATURE_BIT.spotLights} : ${FEATURE_BIT.pointLights};
		if (!has(kind)) continue;
		vec3 at = a.xyz;
		if (col.w > 1.5) {
			if (dot(p - a.xyz, d.xyz) < 0.05) continue;
			vec3 su = texelFetch(lightData, ivec2(3, i), 0).xyz;
			vec3 sv = texelFetch(lightData, ivec2(4, i), 0).xyz;
			vec3 off = p - a.xyz;
			at = a.xyz + su * clamp(dot(off, su) / max(dot(su, su), 1e-6), -1.0, 1.0) + sv * clamp(dot(off, sv) / max(dot(sv, sv), 1e-6), -1.0, 1.0);
		}
		vec3 to = at - p;
		float dist = length(to);
		if (dist >= a.w || dot(n, to) <= 0.0) continue;
		float k = 1.0 - smoothstep(0.7, 1.0, dist / a.w);
		if (col.w > 0.5) {
			float c = dot(-to / max(dist, 1e-4), d.xyz);
			if (c <= cos(d.w)) continue;
			k *= 1.0 - smoothstep(0.0, 1.0, atan(length(cross(-to / max(dist, 1e-4), d.xyz)), c) / max(d.w, 1e-3));
		}
		reached += 1.0;
		weight += k;
	}
	return vec3(float(count), reached, weight);
}
// The lights tested at p, blended between the eight nearest cells, as WebGpuView's testedSmooth.
float testedSmooth(vec3 p) {
	vec3 q = p / 16.0 - 0.5;
	vec3 c = floor(q);
	vec3 f = q - c;
	float sum = 0.0;
	for (int k = 0; k < 8; k++) {
		vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
		float w = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y) * mix(1.0 - f.z, f.z, o.z);
		uint h = lightCell((c + o + 0.5) * 16.0);
		sum += w * float(min(texelFetch(lightTable, ivec2(int(h & 255u), int(h >> 8u)), 0).y, 64u));
	}
	return sum;
}
float skyVisibilityMaps(vec3 p, vec3 n) {
	if (skyInfo.w < 0.5 || !has(${FEATURE_BIT.skyShadows})) return 1.0;
	// The near maps near the camera, as WebGpuView's skyVisibility.
	float edge = 2.0;
	if (skyNear.w > 0.5 && has(${FEATURE_BIT.nearSky})) {
		vec3 off = abs(p - skyNearAt.xyz);
		edge = max(off.x, max(off.y, off.z)) / skyNearAt.w;
	}
	float near = 0.0;
	if (edge < 1.0) {
		vec3 qn = p + n * skyNear.x * 1.5;
		for (int k = 0; k < 8; k++) near += skySeesIn(${SKY_NEAR_LAYER} + k, qn, skyNear);
		near /= 8.0;
		if (edge < 0.75) return near;
	}
	vec3 q = p + n * skyInfo.x * 1.5;
	float seen = 0.0;
	for (int k = 0; k < 8; k++) seen += skySees(k, q);
	seen /= 8.0;
	if (edge >= 1.0) return seen;
	return mix(near, seen, smoothstep(0.75, 1.0, edge));
}
// The lighting cells round the near maps' centre, as WebGpuView's skyVisibility reads them.
uniform highp sampler3D skyCells;
vec3 cellOrigin() { return skyNearAt.xyz - vec3(${(SKY_CELLS[0] * SKY_CELL) / 2}.0, ${(SKY_CELLS[1] * SKY_CELL) / 2}.0, ${(SKY_CELLS[2] * SKY_CELL) / 2}.0); }
float skyVisibility(vec3 p, vec3 n) {
	if (!has(${FEATURE_BIT.leak}) || skyNear.w < 0.5) return skyVisibilityMaps(p, n);
	vec3 uvw = (p + n * ${SKY_CELL / 2}.0 - cellOrigin()) / vec3(${SKY_CELLS[0] * SKY_CELL}.0, ${SKY_CELLS[1] * SKY_CELL}.0, ${SKY_CELLS[2] * SKY_CELL}.0);
	if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return skyVisibilityMaps(p, n);
	float seen = texture(skyCells, vec3(uvw.x, uvw.z, uvw.y)).r * ${SKY_LEAK.toFixed(3)};
	// As WebGpuView's: the cells' alone, easing to the maps at their edge,
	// which are read only where they show.
	float edge = min(min(uvw.x, 1.0 - uvw.x), min(min(uvw.y, 1.0 - uvw.y), min(uvw.z, 1.0 - uvw.z)));
	float k = smoothstep(0.0, 0.08, edge);
	if (k >= 1.0) return seen;
	return mix(skyVisibilityMaps(p, n), seen, k);
}
// The sun's shadow near the camera, as WebGpuView's cascadeSees.
uniform highp sampler2DArrayShadow sunMaps;
uniform mat4 cascViews[3];
uniform vec4 cascFar;
uniform vec4 cascTexel;
const vec2 POISSON[8] = vec2[8](
	vec2(-0.840, -0.074), vec2(0.962, -0.195), vec2(-0.203, 0.621), vec2(0.185, -0.893),
	vec2(-0.326, -0.406), vec2(-0.696, 0.457), vec2(0.473, -0.480), vec2(0.519, 0.767));
float cascadeSees(int k, vec3 p, vec3 n) {
	float texel = cascTexel[k];
	// As WebGpuView's cascadeSees: out along the normal by less where the sun
	// is square on, and blurred over a texel and a half at least.
	vec3 l = normalize(L[0].xyz);
	float slope = sqrt(max(1.0 - dot(n, l) * dot(n, l), 0.0));
	vec4 c = cascViews[k] * vec4(p + n * texel * (0.5 + slope), 1.0);
	vec3 q = c.xyz * 0.5 + 0.5;
	float r = max(cascFar.w / texel, 1.5) / float(textureSize(sunMaps, 0).x);
	// As WebGpuView's: four taps, and the other four only at a shadow's soft edge.
	float seen = 0.0;
	for (int j = 0; j < 4; j++) seen += texture(sunMaps, vec4(q.xy + POISSON[j] * r, float(k), q.z - 0.00005));
	if (seen < 0.001 || seen > 3.999) return seen / 4.0;
	for (int j = 4; j < 8; j++) seen += texture(sunMaps, vec4(q.xy + POISSON[j] * r, float(k), q.z - 0.00005));
	return seen / 8.0;
}
float sunSees(vec3 p, vec3 n) {
	if (skyInfo.w < 0.5 || cascTexel.w > 1.5) return 1.0;
	if (cascTexel.w > 0.5) {
		float d = length(p - L[6].xyz);
		if (d < cascFar.x) return cascadeSees(0, p, n);
		if (d < cascFar.y) return cascadeSees(1, p, n);
		if (d < cascFar.z) return cascadeSees(2, p, n);
	}
	if (!has(${FEATURE_BIT.farShadows})) return 1.0;
	vec3 q = p + n * skyInfo.x * 1.5;
	float s = skyInfo.x * 0.5;
	return 0.25 * (skySees(8, q + vec3(s, 0.0, s)) + skySees(8, q + vec3(-s, 0.0, s)) + skySees(8, q + vec3(s, 0.0, -s)) + skySees(8, q + vec3(-s, 0.0, -s)));
}
`;
const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 pos;
layout(location=2) in vec3 c0; layout(location=3) in vec3 c1; layout(location=4) in vec3 c2; layout(location=5) in vec3 p;
layout(location=8) in uint look;
uniform mat4 viewProj;
void main() {
	// A part with CastShadow off (NO_SHADOW) is left out, past the far plane.
	if ((look & 0x80000000u) != 0u) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
	gl_Position = viewProj * vec4(mat3(c0, c1, c2) * pos + p, 1.0);
}`;
const FS_DEPTH = `#version 300 es
precision highp float;
void main() {}`;
// The lights' light from the half-size pass (FEATURE_BIT.halfLamps), as
// WebGpuView's lampsAt reads it: the four nearest samples, weighted as
// bilinear filtering would, each only where it stands for this pixel, at its
// distance from the eye and facing within about 25 degrees of it (lampAgrees);
// where none does, as at an edge or a corner, worked out here. The passes
// that draw the half-size pass and the reflection cube work it out alone.
const LAMP_READ = `
#if !defined(LAMP_PASS) && !defined(REFL_PASS)
uniform highp sampler2D lampLight;
uniform highp sampler2D lampShine;
uniform highp sampler2D lampNormal;
// The pass's size over the frame's, across and down.
uniform vec2 lampScale;
bool lampAgrees(ivec2 p, float dist, float near, vec3 n) {
	if (abs(texelFetch(lampLight, p, 0).a - dist) >= near) return false;
	return dot(texelFetch(lampNormal, p, 0).xyz * 2.0 - 1.0, n) > 0.9;
}
#endif
vec3 lampsAt(vec3 world, vec3 n, vec3 v, float gloss, out vec3 shine) {
#if !defined(LAMP_PASS) && !defined(REFL_PASS)
	if (has(${FEATURE_BIT.halfLamps})) {
		ivec2 size = textureSize(lampLight, 0);
		vec2 at = gl_FragCoord.xy * lampScale - 0.5;
		ivec2 base = ivec2(floor(at));
		vec2 f = fract(at);
		float dist = length(L[6].xyz - world);
		float near = max(0.05, dist * 0.015);
		vec3 diffuse = vec3(0.0);
		vec3 spec = vec3(0.0);
		float total = 0.0;
		for (int k = 0; k < 4; k++) {
			ivec2 o = ivec2(k & 1, k >> 1);
			ivec2 p = clamp(base + o, ivec2(0), size - ivec2(1));
			if (lampAgrees(p, dist, near, n)) {
				float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
				diffuse += texelFetch(lampLight, p, 0).rgb * w;
				spec += texelFetch(lampShine, p, 0).rgb * w;
				total += w;
			}
		}
		if (total > 0.01) {
			shine = spec / total;
			return diffuse / total;
		}
	}
#endif
	return partLights(world, n, v, gloss, shine);
}
`;
const SURFACE = `
uniform vec4 M[${MATERIALS.length * 3}];
uniform mediump sampler2DArray looks;
// A Sky's six images, for reflections: 1 or more in reflSkyOn when it has
// them, 2 when Roblox's own sun is drawn over them. As WebGpuView's skyLight.
uniform mediump sampler2DArray reflSky; uniform float reflSkyOn;
vec3 reflSkyFace(vec3 d) {
	vec3 a = abs(d);
	if (a.x >= a.y && a.x >= a.z) return d.x > 0.0 ? vec3(d.z / a.x, -d.y / a.x, 3.0) : vec3(-d.z / a.x, -d.y / a.x, 4.0);
	if (a.z >= a.y) return d.z > 0.0 ? vec3(-d.x / a.z, -d.y / a.z, 0.0) : vec3(d.x / a.z, -d.y / a.z, 2.0);
	return d.y > 0.0 ? vec3(-d.z / a.y, -d.x / a.y, 5.0) : vec3(-d.z / a.y, d.x / a.y, 1.0);
}
vec3 skyLight(vec3 dir) {
	if (reflSkyOn < 0.5) return sky(dir);
	vec3 f = reflSkyFace(dir);
	vec3 c = textureLod(reflSky, vec3(f.xy * 0.5 + 0.5, f.z), 0.0).rgb;
	return pow(c, vec3(2.2)) * ${SKY_GAIN} + (reflSkyOn > 1.5 ? sunLight(dir) : vec3(0.0));
}
// Scene reflections' cube, read where the ray from p meets a sphere round the
// camera: see WebGpuView's sceneSees. Left out of the program that draws it.
#ifndef REFL_PASS
uniform highp samplerCube reflCube;
// Where the cube was drawn from: the camera's place then, or on the
// reflection grid, where the camera entered the cell.
uniform vec3 reflCentre;
#endif
vec4 sceneSees(vec3 p, vec3 dir, float lod) {
#ifdef REFL_PASS
	return vec4(0.0);
#else
	vec3 o = p - reflCentre;
	float radius = max(${PROBE_RADIUS}.0, length(o) + 50.0);
	float b = dot(o, dir);
	float t = -b + sqrt(max(b * b - dot(o, o) + radius * radius, 0.0));
	return textureLod(reflCube, o + dir * t, lod);
#endif
}
vec3 envSees(vec3 p, vec3 dir, float vis, float lod) {
	vec3 s = skyLight(dir) * max(vis, 0.05);
	if (!has(${FEATURE_BIT.sceneReflect})) return s;
	vec4 e = sceneSees(p, dir, lod);
	return s * (1.0 - e.a) + e.rgb;
}
${PATTERNS}
float hash3(vec3 p) { uvec3 q = uvec3(ivec3(p)); return toUnit(mixBits(q.x ^ mixBits(q.y ^ mixBits(q.z)))); }
float noise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 w = f * f * (3.0 - 2.0 * f);
	float x0 = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), w.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), w.x), w.y);
	float x1 = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), w.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), w.x), w.y);
	return mix(x0, x1, w.z);
}
vec4 surface(vec3 colour, vec3 n, vec3 world, float alpha, uint look, vec3 local, vec3 ln) {
	int row = int(look & 255u);
	float shine = float((look >> 8u) & 255u) / 255.0;
	vec4 a = M[row * 3];
	vec4 b = M[row * 3 + 1];
	vec4 tex = M[row * 3 + 2];
	vec3 toEye = L[6].xyz - world;
	float d = length(toEye);
	vec3 v = toEye / max(d, 1e-4);
	vec3 albedo = colour;
	if (a.w > 0.0 && has(${FEATURE_BIT.grain})) {
		float g = noise3(local / b.x) * 0.65 + noise3(local / b.x * 3.1) * 0.35;
		albedo *= 1.0 + a.w * (g - 0.5) * 2.0;
	}
	// A texture once its layer has loaded; the material's own pattern until then.
	vec2 uv = faceUv(local, ln);
	int layer = int(b.w) - 1;
	vec4 lk = texture(looks, vec3(uv / tex.x, float(max(layer, 0))));
	vec3 pat = pattern(int(b.z), uv, b.x);
	if (!has(${FEATURE_BIT.grain})) pat = vec3(1.0, 1.0, pat.z);
	if (layer >= 0 && has(${FEATURE_BIT.textures})) pat = vec3(mix(1.0, lk.r * 2.0, tex.y), 1.0, tex.z * lk.g);
	albedo *= pat.x;
	vec3 c;
	if (b.y > 0.5 && b.y < 1.5 && has(${FEATURE_BIT.neon})) {
		c = pow(clamp(neonLevel(albedo, alpha), 0.0, 1.0), vec3(2.2));
		alpha = neonAlpha(alpha);
	} else if (b.y > 2.5) {
		float edge = 1.0 - abs(dot(n, v));
		float rim = edge * edge;
		c = albedo * (0.6 + rim * 2.5);
		alpha *= clamp(0.15 + rim * 0.85, 0.0, 1.0);
	} else if (has(${FEATURE_BIT.unlit})) {
		// No light at all: the colour and material as they are.
		c = albedo;
	} else {
		vec3 l = L[0].xyz;
		float ndl = max(dot(n, l), 0.0);
		vec3 h = normalize(l + v);
		float spec = has(${FEATURE_BIT.highlights}) ? pow(max(dot(n, h), 0.0), a.y) * a.x * pat.y : 0.0;
		// Ambient everywhere, OutdoorAmbient and the sky as far as the sky
		// reaches, and the sun where it does, as WebGpuView's surface; the
		// switches as it leaves them out.
		float vis = skyVisibility(world, n);
		// Turned from the sun, its light is nothing whatever the shadow: not looked up.
		float sunK = 0.0;
		if (ndl > 0.0) sunK = sunSees(world, n);
		vec3 lit = L[1].rgb * ndl * sunK;
		vec3 fill = (vec3(L[8].w, L[9].w, L[10].w) + L[2].rgb * max(vis, ${SKY_SEEN_LEAST})) * (0.9 + 0.1 * n.y);
		vec3 lampShine = vec3(0.0);
		vec3 lamps = vec3(0.0);
		if (has(${FEATURE_BIT.pointLights} | ${FEATURE_BIT.spotLights} | ${FEATURE_BIT.surfaceLights})) {
			if (gridInfo.x > 0.5) lamps = gridLamps(world, n, v, a.y * 2.0, lampShine);
			else lamps = lampsAt(world, n, v, a.y * 2.0, lampShine);
		}
		if (!has(${FEATURE_BIT.lightHighlights})) lampShine = vec3(0.0);
		c = albedo * (1.0 - a.z * ${METAL_DIFFUSE_CUT}) * (fill + lit + lamps) + mix(vec3(1.0), albedo, a.z) * (spec * lit + lampShine * a.x * pat.y * 4.6);
		if (has(${FEATURE_BIT.reflections})) {
			float mirror = shine;
			if (b.y > 1.5) {
				float edge = 1.0 - abs(dot(n, v));
				mirror = max(mirror, 0.2 + 0.5 * edge * edge * edge);
			}
			// Only what reflects reads what is round it: see the WebGPU shader.
			vec3 r = reflect(-v, n);
			// A metal shows what is round it, blurred, in its own colour.
			if (a.z > 0.5) c += envSees(world, r, vis, ${PROBE_ROUGH.toFixed(1)}) * albedo * a.x * ${METAL_SEEN.toFixed(2)};
			if (mirror > 0.001) c = mix(c, envSees(world, r, vis, 0.0), mirror);
		}
		if (has(${FEATURE_BIT.lava})) c += lavaLight(pat.z) * 2.2;
	}
	c = air(c, d, world.y);
	return vec4(c, alpha);
}
`;
const VS = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm;
layout(location=2) in vec3 c0; layout(location=3) in vec3 c1; layout(location=4) in vec3 c2; layout(location=5) in vec3 p;
layout(location=6) in vec4 colour; layout(location=7) in uint id; layout(location=8) in uint look;
uniform mat4 viewProj; uniform float outline; uniform float handle; uniform vec3 screen; uniform vec3 eye;
// Triangle density: the draw's triangles, or 0 in every other view; see drawDensity.
uniform float tris;
out vec3 vColour; out vec3 vWorld; out vec3 vNormal; flat out uint vId; out float vAlpha; flat out uint vLook; out vec3 vLocal; out vec3 vLNormal;
out float vDepthW;
${DENSITY_GLSL}
#ifndef LOG_DEPTH
// Invariant: the depth pre-pass and the lit pass must land on the very same depths.
invariant gl_Position;
#endif
#ifdef GLOW_PASS
// A Neon part thin on the screen, in the glow's source, as WebGpuView's
// vsGlow: its edges that lie across the screen and are thinner than thin.x
// of the source's pixels (thin.yz, its size) are widened to that, across the
// screen only, and it is dimmed by the area it gained (vK), so it gives off
// the light it did; it no longer flickers in and out as the camera moves.
// Only a part thin on the screen: a Neon panel is left as it is.
uniform vec4 M[${MATERIALS.length * 3}];
uniform vec3 thin;
flat out float vK;
vec3 screenPx(vec3 q) {
	vec4 c = viewProj * vec4(q, 1.0);
	return vec3(c.xy / max(c.w, 1e-6) * 0.5 * thin.yz, c.w);
}
float crossArea(vec2 a, vec2 b) { return abs(a.x * b.y - a.y * b.x); }
#endif
void main() {
	mat3 m = mat3(c0, c1, c2);
	vec3 s = vec3(length(c0), length(c1), length(c2));
	vNormal = normalize(m * (nrm / max(s * s, vec3(1e-6))));
	vec3 origin = p;
#ifdef GLOW_PASS
	vK = 1.0;
	float shadeKind = M[int(look & 255u) * 3 + 1].y;
	if (shadeKind > 0.5 && shadeKind < 1.5 && thin.x > 0.0) {
		vec3 o0 = screenPx(p);
		vec3 e0 = screenPx(p + c0);
		vec3 e1 = screenPx(p + c1);
		vec3 e2 = screenPx(p + c2);
		if (o0.z > 0.1 && e0.z > 0.1 && e1.z > 0.1 && e2.z > 0.1) {
			vec2 a0 = e0.xy - o0.xy;
			vec2 a1 = e1.xy - o0.xy;
			vec2 a2 = e2.xy - o0.xy;
			vec3 len = vec3(length(a0), length(a1), length(a2));
			float area = crossArea(a0, a1) + crossArea(a1, a2) + crossArea(a2, a0);
			float longest = max(len.x, max(len.y, len.z));
			// How long each edge would be across the screen, were it square to the eye.
			vec3 away = normalize(eye - p);
			vec3 along = vec3(dot(c0, away) / max(s.x, 1e-6), dot(c1, away) / max(s.y, 1e-6), dot(c2, away) / max(s.z, 1e-6));
			vec3 across = sqrt(max(vec3(1.0) - along * along, vec3(0.0)));
			if (longest > 0.0 && area / longest < thin.x) {
				bvec3 grows = bvec3(len.x < thin.x && across.x > 0.5, len.y < thin.x && across.y > 0.5, len.z < thin.x && across.z > 0.5);
				vec3 grow = mix(vec3(1.0), clamp(vec3(thin.x) / max(len, vec3(1e-3)), vec3(1.0), vec3(8.0)), vec3(grows));
				// Across the screen only, at its distance from the eye: a strip set
				// into a surface spreads beside it rather than coming out of it.
				vec3 flat0 = c0 - away * dot(c0, away);
				vec3 flat1 = c1 - away * dot(c1, away);
				vec3 flat2 = c2 - away * dot(c2, away);
				origin = p + pos.x * (grow.x - 1.0) * flat0 + pos.y * (grow.y - 1.0) * flat1 + pos.z * (grow.z - 1.0) * flat2;
				vec2 b0 = a0 * grow.x;
				vec2 b1 = a1 * grow.y;
				vec2 b2 = a2 * grow.z;
				float wide = crossArea(b0, b1) + crossArea(b1, b2) + crossArea(b2, b0);
				vK = clamp(area / max(wide, 1e-6), 0.0, 1.0);
			}
		}
	}
#endif
	vWorld = m * pos + origin;
	gl_Position = viewProj * vec4(vWorld, 1.0);
	// An outline's edge as a band, as WebGpuView's vsLine draws it.
	vColour = pow(colour.rgb, vec3(2.2));
	if (outline > 0.5) {
		vec3 wa = m * pos + p;
		vec3 wb = m * nrm + p;
		wa += (eye - wa) * 0.004;
		wb += (eye - wb) * 0.004;
		vec4 a = viewProj * vec4(wa, 1.0);
		vec4 b = viewProj * vec4(wb, 1.0);
		float e = 0.001;
		bool behind = a.w < e && b.w < e;
		if (a.w < e) a = mix(a, b, (e - a.w) / (b.w - a.w));
		if (b.w < e) b = mix(b, a, (e - b.w) / (a.w - b.w));
		bool end = (gl_VertexID & 2) == 2;
		float side = (gl_VertexID & 1) == 1 ? 1.0 : -1.0;
		vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * screen.xy + vec2(1e-6, 0.0));
		vec2 off = (vec2(-dir.y, dir.x) * side + dir * (end ? 1.0 : -1.0)) * screen.z / screen.xy;
		gl_Position = end ? b : a;
		gl_Position.xy += off * gl_Position.w;
		if (behind) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		// The outline's own colour, as it is to be seen.
		vColour = colour.rgb;
	}
	// Triangle density's share, in the colour's red, as WebGpuView's vsDensity.
	if (tris > 0.5) vColour = vec3(densityShare(tris, s), 0.0, 0.0);
	vId = id;
	vAlpha = colour.a;
	vLook = look;
	vLocal = pos * s;
	vLNormal = nrm;
	// A handle's depth squeezed into the front hundredth, as in WebGpuView:
	// by 1 where depth is reversed.
#ifdef LOG_DEPTH
	if (handle > 0.5) gl_Position.z = ((gl_Position.z / gl_Position.w + 1.0) * 0.01 - 1.0) * gl_Position.w;
#else
	if (handle > 0.5) gl_Position.z = gl_Position.w - (gl_Position.w - gl_Position.z) * 0.01;
#endif
	vDepthW = 1.0 + gl_Position.w;
}`;
// Depth by the logarithm of distance, written by every pass that draws the
// place where the browser cannot reverse depth (no EXT_clip_control): WebGL2's
// depth buffer is 24 fixed bits, which the usual depth spends close to the
// camera, so two faces a thousandth of a stud apart fought a few hundred studs
// out. Spread evenly by distance, the same bits hold them apart across the
// place. Written depth turns off the early depth test, so where the browser
// can, depth is reversed into a float buffer instead, as WebGpuView's is, and
// the shaders write none: see WebGl2View's clipControl. Each program's source has
// LOG_DEPTH defined in the first case only.
const LOG_DEPTH = `
#ifdef LOG_DEPTH
in float vDepthW; uniform float logFar;
float logDepth() { return log2(max(vDepthW, 1e-6)) * logFar; }
#endif
`;
/** Occlusion's depth image: each solid part's distance from the eye, nearest kept. */
const FS_DIST = `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 eye;
${LOG_DEPTH}
out vec4 o;
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = logDepth();
#endif
	o = vec4(distance(vWorld, eye), 0.0, 0.0, 1.0);
}`;
/** A triangle over the whole target, for the depth image's reduction. */
const VS_FULL_CELLS = `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
/** Each cell the farthest of the distances over its pixels, as WebGpuView's fsFar. */
const FS_FAR_CELLS = `#version 300 es
precision highp float;
uniform highp sampler2D dist;
uniform vec4 size;
out vec4 o;
void main() {
	vec2 cell = floor(gl_FragCoord.xy);
	int x0 = int(floor(cell.x * size.x / size.z));
	int x1 = max(int(floor((cell.x + 1.0) * size.x / size.z)), x0 + 1);
	int y0 = int(floor(cell.y * size.y / size.w));
	int y1 = max(int(floor((cell.y + 1.0) * size.y / size.w)), y0 + 1);
	float far = 0.0;
	for (int y = y0; y < y1; y++) {
		for (int x = x0; x < x1; x++) far = max(far, texelFetch(dist, ivec2(x, y), 0).r);
	}
	o = vec4(far, 0.0, 0.0, 1.0);
}`;
// The light grid (Light object grid), as WebGpuView's: three cascades round
// the camera, LIGHT_GRID_CELLS a side, x along s, z along t, y along r
// within the cascade's third, each cell where its place in the world falls.
// gridA holds the light arriving at a cell, alpha its luminance; gridB the
// luminance-weighted middle of where it comes from, from the cell's middle
// in cells, times that luminance. gridC: each cascade's lowest corner and
// its cell, in studs. Units 22 and 23: see WebGl2View.gridUnits.
const GRID_READ = `
uniform highp sampler3D gridA;
uniform highp sampler3D gridB;
uniform vec4 gridC[${LIGHT_GRID_CASCADES}];
int gridWrap(int v) { return v - ${LIGHT_GRID_CELLS} * int(floor(float(v) / ${LIGHT_GRID_CELLS}.0)); }
// A cascade's light at p, as WebGpuView's gridLight: across, wrapped by the
// sampler; up and down, the two layers either side read at their middles
// and blended here, which a sampler cannot do within a third.
vec3 gridLight(int k, vec3 p, vec3 n, vec3 v, float gloss, out vec3 shine) {
	vec4 g = gridC[k];
	vec2 uv = p.xz / (g.w * ${LIGHT_GRID_CELLS}.0);
	float f = p.y / g.w - 0.5;
	float low = floor(f);
	float third = float(k) * ${LIGHT_GRID_CELLS}.0;
	float depth = ${LIGHT_GRID_CELLS}.0 * ${LIGHT_GRID_CASCADES}.0;
	float lo = (float(gridWrap(int(low))) + third + 0.5) / depth;
	float hi = (float(gridWrap(int(low) + 1)) + third + 0.5) / depth;
	float t = f - low;
	vec4 a = mix(textureLod(gridA, vec3(uv, lo), 0.0), textureLod(gridA, vec3(uv, hi), 0.0), t);
	shine = vec3(0.0);
	if (a.a <= 1e-5) return vec3(0.0);
	vec4 b = mix(textureLod(gridB, vec3(uv, lo), 0.0), textureLod(gridB, vec3(uv, hi), 0.0), t);
	vec3 to = g.w * b.xyz / a.a;
	vec3 l = to / max(length(to), 1e-3);
	// Soft (gridInfo.y): flat, as Studio's, and no highlight.
	bool even = gridInfo.y > 0.5;
	vec3 lit = a.rgb * (even ? 1.0 : max(dot(n, l), 0.0));
	if (!even) shine = lit * pow(max(dot(n, normalize(l + v)), 0.0), gloss) * 1.25;
	return lit * 1.25;
}
// The finest cascade p is a cell inside, eased into the next over two cells
// before its edge; past the coarsest, every light worked out here. Read half
// a cell out from the face, on its air side, as WebGpuView's gridLamps.
vec3 gridLamps(vec3 surface, vec3 n, vec3 v, float gloss, out vec3 shine) {
	vec3 p = surface + n * (gridC[0].w * 0.5);
	for (int k = 0; k < ${LIGHT_GRID_CASCADES}; k++) {
		vec4 g = gridC[k];
		float side = g.w * ${LIGHT_GRID_CELLS}.0 * 0.5;
		vec3 off = abs(p - (g.xyz + vec3(side)));
		float edge = side - max(off.x, max(off.y, off.z));
		if (edge <= g.w) continue;
		vec3 hereShine;
		vec3 here = gridLight(k, p, n, v, gloss, hereShine);
		float ease = clamp(1.0 - (edge - g.w) / (2.0 * g.w), 0.0, 1.0);
		if (ease <= 0.0 || k + 1 >= ${LIGHT_GRID_CASCADES}) {
			shine = hereShine;
			return here;
		}
		vec3 nextShine;
		vec3 next = gridLight(k + 1, p, n, v, gloss, nextShine);
		shine = mix(hereShine, nextShine, ease);
		return mix(here, next, ease);
	}
	return partLights(p, n, v, gloss, shine);
}
`;
// The light grid's cells, a layer of a region at a time, as WebGpuView's
// GRID_FILL: drawn n by n over the layer, x across and z up, each fragment
// the cell of the region that falls on its texel (the rest discarded).
// gSize: the cell in studs, the cascade, Soft, and the layer's cell up;
// gLo and gCount: the region's lowest cell and its cells along x, y and z;
// gOcc: the occupancy window's lowest cell, and w whether to read it (the
// finest cascade alone): see occupancy.ts.
const FS_GRID = `#version 300 es
precision highp float;
precision highp int;
${COMMON}
${SKY_VIS}
uniform vec4 gSize;
uniform vec4 gLo;
uniform vec4 gCount;
uniform vec4 gOcc;
uniform highp sampler3D occ;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
int wrapBy(int v, int n) { return v - n * int(floor(float(v) / float(n))); }
// What parts fill of the cell at p, 0 to 1: wrapped round as the grid is,
// and nothing outside the window the GPU holds.
float filled(vec3 p) {
	ivec3 c = ivec3(floor(p / ${OCC_CELL}.0));
	ivec3 rel = c - ivec3(gOcc.xyz);
	if (any(lessThan(rel, ivec3(0))) || any(greaterThanEqual(rel, ivec3(${OCC_SIZE})))) return 0.0;
	return texelFetch(occ, ivec3(wrapBy(c.x, ${OCC_SIZE}), wrapBy(c.y, ${OCC_SIZE}), wrapBy(c.z, ${OCC_SIZE})), 0).r;
}
void main() {
	ivec3 lo = ivec3(gLo.xyz);
	int cx = lo.x + wrapBy(int(gl_FragCoord.x) - lo.x, ${LIGHT_GRID_CELLS});
	int cz = lo.z + wrapBy(int(gl_FragCoord.y) - lo.z, ${LIGHT_GRID_CELLS});
	if (cx - lo.x >= int(gCount.x) || cz - lo.z >= int(gCount.z)) discard;
	float size = gSize.x;
	vec3 corner = vec3(float(cx), gSize.w, float(cz)) * size;
	float st = min(size, ${LIGHT_CELL}.0);
	int m = int(round(size / st));
	float r = st * 0.5;
	bool soft = gSize.z > 0.5;
	vec3 light = vec3(0.0);
	vec3 weighted = vec3(0.0);
	float weight = 0.0;
	for (int s = 0; s < m * m * m; s++) {
		vec3 p = corner + (vec3(float(s % m), float((s / m) % m), float(s / (m * m))) + 0.5) * st;
		uint h = lightCell(p);
		uvec2 b = texelFetch(lightTable, ivec2(int(h & 255u), int(h >> 8u)), 0).xy;
		uint count = min(b.y, 64u);
		for (uint j = 0u; j < count; j++) {
			uint idx = b.x + j;
			int i = int(texelFetch(lightIndex, ivec2(int(idx & 1023u), int(idx >> 10u)), 0).r);
			vec4 a = texelFetch(lightData, ivec2(0, i), 0);
			vec4 col = texelFetch(lightData, ivec2(1, i), 0);
			vec4 d = texelFetch(lightData, ivec2(2, i), 0);
			int kind = col.w > 1.5 ? ${FEATURE_BIT.surfaceLights} : col.w > 0.5 ? ${FEATURE_BIT.spotLights} : ${FEATURE_BIT.pointLights};
			if (!has(kind)) continue;
			vec3 at = a.xyz;
			if (col.w > 1.5) {
				// Wholly behind its face: none of its light.
				if (dot(p - a.xyz, d.xyz) < -r) continue;
				vec3 u = texelFetch(lightData, ivec2(3, i), 0).xyz;
				vec3 v = texelFetch(lightData, ivec2(4, i), 0).xyz;
				vec3 off = p - a.xyz;
				at = a.xyz + u * clamp(dot(off, u) / max(dot(u, u), 1e-6), -1.0, 1.0) + v * clamp(dot(off, v) / max(dot(v, v), 1e-6), -1.0, 1.0);
			}
			vec3 to = at - p;
			float dist = length(to);
			// A light smaller than the cube reaches its middle from anywhere in
			// it; a larger one falls off where it does.
			float reach = max(dist - max(r - a.w, 0.0), 0.0);
			if (reach >= a.w) continue;
			float k2 = soft ? softFall(reach / a.w) : 1.0 - smoothstep(0.7, 1.0, reach / a.w);
			if (soft && col.w > 0.5 && col.w < 1.5) {
				k2 *= softSpot(d.w);
			} else if (col.w > 0.5 && dist > r) {
				vec3 l = to / dist;
				float c = dot(-l, d.xyz);
				if (c <= 0.0) continue;
				k2 *= 1.0 - smoothstep(0.0, 1.0, atan(length(cross(-l, d.xyz)), c) / max(d.w, 1e-3));
			}
			// A light smaller than the sample's cube: spread over it, its total kept.
			k2 *= min(1.0, 0.52 * pow(a.w / r, 3.0));
			// On the way to it, each cell lets through what parts leave of it.
			if (gOcc.w > 0.5 && k2 > 0.0) {
				vec3 dir = to / max(dist, 1e-4);
				int steps = min(int(dist / ${OCC_CELL}.0), ${OCC_STEPS});
				float through = 1.0;
				for (int q = 1; q < steps; q++) {
					through *= 1.0 - filled(p + dir * float(q) * ${OCC_CELL}.0);
					if (through < 0.02) break;
				}
				k2 *= through;
			}
			vec3 lit = col.rgb * k2;
			float lum = dot(lit, vec3(0.2126, 0.7152, 0.0722));
			light += lit;
			weighted += at * lum;
			weight += lum;
		}
	}
	float samples = float(m * m * m);
	// A cell partly inside a part keeps the light of only the air round it.
	float airK = 1.0;
	if (gOcc.w > 0.5) airK = 1.0 - filled(corner + vec3(size * 0.5));
	light = light / samples * airK;
	float w = weight / samples * airK;
	vec3 middle = corner + vec3(size * 0.5);
	vec3 source = vec3(0.0);
	if (weight > 0.0) source = (weighted / weight - middle) / size * w;
	oA = vec4(light, w);
	oB = vec4(source, 0.0);
}`;
/** A slice of the lighting cells, as WebGpuView's vsCell. */
const VS_CELL = `#version 300 es
void main() {
	vec2 q = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0);
}`;
/** A lighting cell: the share of the sky round its middle, as WebGpuView's fsCell. */
const FS_CELL = `#version 300 es
precision highp float;
precision highp int;
${COMMON}
${SKY_VIS}
uniform float cellSlice;
out vec4 o;
void main() {
	vec3 cell = vec3(floor(gl_FragCoord.x), cellSlice, floor(gl_FragCoord.y));
	vec3 p = cellOrigin() + (cell + 0.5) * ${SKY_CELL}.0;
	float sum = 0.0;
	for (int x = -1; x <= 1; x++)
		for (int y = -1; y <= 1; y++)
			for (int z = -1; z <= 1; z++) sum += skyVisibilityMaps(p + vec3(float(x), float(y), float(z)) * ${SKY_CELL}.0, vec3(0.0, 1.0, 0.0));
	o = vec4(sum / 27.0, 0.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 vColour; in vec3 vWorld; in vec3 vNormal; flat in uint vId; in float vAlpha; flat in uint vLook; in vec3 vLocal; in vec3 vLNormal;
uniform float outline; uniform vec3 select; uniform float handle; uniform float alpha;
${COMMON}
${SKY_VIS}
${GRID_READ}
${LAMP_READ}
${SURFACE}
${LOG_DEPTH}
${VIEWS_GLSL}
#ifdef LAMP_PASS
// The half-size pass, as WebGpuView's fsLamps: each solid part's lights at
// half or a quarter of the frame's pixels, its distance from the eye, and the
// direction it faces, for lampsAt to read.
layout(location=0) out vec4 oLight;
layout(location=1) out vec4 oShine;
layout(location=2) out vec4 oFacing;
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = logDepth();
#endif
	vec3 n = normalize(vNormal);
	vec3 faceN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
	if (!has(${FEATURE_BIT.smooth})) n = dot(faceN, n) >= 0.0 ? faceN : -faceN;
	vec4 a = M[int(vLook & 255u) * 3];
	vec3 toEye = L[6].xyz - vWorld;
	float d = length(toEye);
	vec3 shine = vec3(0.0);
	vec3 light = vec3(0.0);
	if (has(${FEATURE_BIT.halfLamps})) light = partLights(vWorld, n, toEye / max(d, 1e-4), a.y * 2.0, shine);
	oLight = vec4(light, d);
	oShine = vec4(shine, 1.0);
	oFacing = vec4(n * 0.5 + 0.5, 1.0);
}
#else
out vec4 o;
${DENSITY_FS_GLSL}
float heat(vec3 n) {
	// Overdraw: one share for each surface drawn.
	if (R.w > 0.5 && R.w < 1.5) return ${1 / OVERDRAW_FULL};
	int row = int(vLook & 255u);
	vec4 a = M[row * 3];
	vec4 b = M[row * 3 + 1];
	bool linear = R.z > 0.5;
	if (R.x > 5.5) {
		vec3 lw = lightWork(vWorld, n);
		return (linear ? lw.z : lw.y) / ${LIGHTS_FULL}.0;
	}
	float cost = 2.0;
	if (a.w > 0.0) cost += 2.0;
	if (b.w > 0.5) cost += 1.0;
	if (b.y > 0.5 && b.y < 1.5) return cost / ${COST_FULL}.0;
	cost += 7.0;
	vec3 w = lightWork(vWorld, n);
	if (linear) return (cost + testedSmooth(vWorld) + w.z * 1.5) / ${COST_FULL}.0;
	return (cost + w.x + w.y * 1.5) / ${COST_FULL}.0;
}
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = handle > 0.5 ? logDepth() * 0.01 : logDepth();
#endif
	vec3 n = normalize(vNormal);
	// Smooth shading off: each triangle's own face, as WebGpuView's surface.
	vec3 faceN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
	if (!has(${FEATURE_BIT.smooth}) && handle < 0.5 && outline < 0.5) n = dot(faceN, n) >= 0.0 ? faceN : -faceN;
	if (outline > 0.5) o = vec4(vColour, vAlpha);
	else if (handle < 0.5 && R.w > 1.5 && R.w < 2.5) o = densityOut(n);
	else if (handle < 0.5 && R.x > 4.5) o = vec4(heat(n), 0.0, 0.0, 1.0);
	else if (handle > 0.5) o = vec4(pow(vColour * (0.72 + 0.38 * max(dot(n, normalize(vec3(0.4, 1.0, 0.25))), 0.0)), vec3(1.0 / 2.2)), alpha);
	else {
		vec4 s = surface(vColour, n, vWorld, vAlpha, vLook, vLocal, vLNormal);
		// Neon past the display curve, each channel capped, as WebGpuView's fs draws it.
		float shade = M[int(vLook & 255u) * 3 + 1].y;
		o = vec4(shade > 0.5 && shade < 1.5 ? pow(min(s.rgb, vec3(1.0)), vec3(1.0 / 2.2)) : display(s.rgb), s.a);
		// The Shadow maps view: tinted by the sun's map that shades it.
		if (R.w > 2.5) o.rgb = sunMapTint(o.rgb, vWorld);
	}
}
#endif`;
// Wireframe only: each part's edges, as WebGpuView's fsWire.
const FS_WIRE = `#version 300 es
precision highp float;
in vec3 vColour;
out vec4 o;
void main() { o = vec4(pow(mix(vColour, vec3(1.0), 0.3), vec3(1.0 / 2.2)), 0.85); }`;
// A Decal's or Texture's image on its face, as WebGpuView's vsImage and fsImage draw it.
const VS_IMAGE = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm; layout(location=2) in vec2 uv; layout(location=3) in vec4 tint;
uniform mat4 viewProj;
out vec3 vWorld; out vec3 vNormal; out vec2 vUv; out vec4 vTint; out float vDepthW;
void main() {
	vWorld = pos;
	vNormal = nrm;
	vUv = uv;
	vTint = tint;
	gl_Position = viewProj * vec4(pos, 1.0);
	vDepthW = 1.0 + gl_Position.w;
}`;
const FS_IMAGE = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal; in vec2 vUv; in vec4 vTint;
uniform sampler2D image; uniform float veil; uniform float cut;
${COMMON}
${SKY_VIS}
${LOG_DEPTH}
${VIEWS_GLSL}
out vec4 o;
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = logDepth();
#endif
	vec4 t = texture(image, vUv);
	// Into the depth where mostly opaque, as WebGpuView's fsImageDepth.
	if (t.a * vTint.a < cut) discard;
	// Overdraw: one share, added, for each of its fragments, as WebGpuView's fsCount.
	if (R.w > 0.5 && R.w < 1.5) {
		o = vec4(${1 / OVERDRAW_FULL}, 0.0, 0.0, 0.0);
		return;
	}
	// In the glow's pass, covering what glows beneath it, as WebGpuView's fsImageVeil.
	if (veil > 0.5) {
		o = vec4(0.0, 0.0, 0.0, t.a * vTint.a);
		return;
	}
	vec3 albedo = pow(t.rgb, vec3(2.2)) * pow(vTint.rgb, vec3(2.2));
	vec3 n = normalize(vNormal);
	float ndl = max(dot(n, L[0].xyz), 0.0);
	float vis = skyVisibility(vWorld, n);
	float sunK = 0.0;
	if (ndl > 0.0) sunK = sunSees(vWorld, n);
	vec3 fill = (vec3(L[8].w, L[9].w, L[10].w) + L[2].rgb * max(vis, ${SKY_SEEN_LEAST})) * (0.9 + 0.1 * n.y);
	vec3 lampShine;
	vec3 lamps = vec3(0.0);
	if (has(${FEATURE_BIT.pointLights} | ${FEATURE_BIT.spotLights} | ${FEATURE_BIT.surfaceLights})) lamps = partLights(vWorld, n, n, 1.0, lampShine);
	vec3 c = albedo * (fill + L[1].rgb * ndl * sunK + lamps);
	if (has(${FEATURE_BIT.unlit})) c = albedo;
	c = air(c, length(L[6].xyz - vWorld), vWorld.y);
	o = vec4(display(c), t.a * vTint.a);
	if (R.w > 2.5) o.rgb = sunMapTint(o.rgb, vWorld);
}`;
const VS_SKY = `#version 300 es
out vec2 ndc;
void main() {
	vec2 xy = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
	ndc = xy;
	gl_Position = vec4(xy, 0.0, 1.0);
}`;
const FS_SKY = `#version 300 es
precision highp float;
in vec2 ndc; uniform mat4 invViewProj;
uniform mediump sampler2DArray skyImages; uniform float hasSky; uniform sampler2D sunImage;
${COMMON}
out vec4 o;
// As WebGpuView's skyFace.
vec3 skyFace(vec3 d) {
	vec3 a = abs(d);
	if (a.x >= a.y && a.x >= a.z) return d.x > 0.0 ? vec3(d.z / a.x, -d.y / a.x, 3.0) : vec3(-d.z / a.x, -d.y / a.x, 4.0);
	if (a.z >= a.y) return d.z > 0.0 ? vec3(-d.x / a.z, -d.y / a.z, 0.0) : vec3(d.x / a.z, -d.y / a.z, 2.0);
	return d.y > 0.0 ? vec3(-d.z / a.y, -d.x / a.y, 5.0) : vec3(-d.z / a.y, d.x / a.y, 1.0);
}
// A Sky's own sun image in a direction, as WebGpuView's sunImageLight.
vec3 sunImageLight(vec3 dir) {
	float half_ = L[6].w;
	vec3 s = L[0].xyz;
	float k = dot(dir, s);
	if (half_ <= 0.0 || k <= 0.0) return vec3(0.0);
	vec3 across = cross(s, vec3(0.0, 1.0, 0.0));
	vec3 right = length(across) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(across);
	vec3 up = cross(right, s);
	vec3 p = dir / k - s;
	vec2 uv = vec2(-dot(p, right), dot(p, up)) / half_;
	if (max(abs(uv.x), abs(uv.y)) >= 1.0) return vec3(0.0);
	vec4 t = textureLod(sunImage, vec2(uv.x * 0.5 + 0.5, 0.5 - uv.y * 0.5), 0.0);
	return pow(t.rgb, vec3(2.2)) * t.a * ${SUN_GAIN.toFixed(3)} * L[3].w;
}
void main() {
	vec4 far = invViewProj * vec4(ndc, 1.0, 1.0);
	vec3 dir = normalize(far.xyz / far.w - L[6].xyz);
	vec3 seen;
	if (hasSky > 0.5) {
		vec3 f = skyFace(dir);
		vec3 c = textureLod(skyImages, vec3(f.xy * 0.5 + 0.5, f.z), 0.0).rgb;
		vec3 sun = hasSky > 1.5 ? sunLight(dir) : vec3(0.0);
		seen = aces((pow(c, vec3(2.2)) * ${SKY_GAIN} + sun) * L[3].w);
	} else seen = pow(display(sky(dir)), vec3(2.2));
	o = vec4(pow(min(seen + sunImageLight(dir), vec3(1.0)), vec3(1.0 / 2.2)), 1.0);
}`;
const VS_OVER = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 colour;
uniform mat4 viewProj; out vec3 vColour;
void main() { gl_Position = viewProj * vec4(pos, 1.0); vColour = colour; }`;
const FS_OVER = `#version 300 es
precision highp float; in vec3 vColour; out vec4 o;
void main() { o = vec4(vColour, 1.0); }`;
const VS_FULL = `#version 300 es
out vec2 uv;
void main() {
	vec2 xy = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
	uv = xy * 0.5 + 0.5;
	gl_Position = vec4(xy, 0.0, 1.0);
}`;
// The near sky maps opened, as WebGpuView's makeSkyOpen: the farthest depth
// across and down, then the nearest, a pass each. Reading a near map's depth...
const FS_OPEN_DEPTH = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2DArray srcDepth;
uniform int layer;
uniform vec4 f;
out vec4 o;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	ivec2 st = ivec2(f.xy);
	int r = int(f.z);
	float m = 0.0;
	for (int j = -r; j <= r; j++)
		m = max(m, texelFetch(srcDepth, ivec3(clamp(c + st * j, ivec2(0), ivec2(${SKY_MAP - 1})), layer), 0).r);
	o = vec4(m, 0.0, 0.0, 1.0);
}`;
// ...and the scratch maps, the last pass into the near map's depth.
const FS_OPEN_FLOAT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D srcFloat;
uniform vec4 f;
uniform float toDepth;
out vec4 o;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	ivec2 st = ivec2(f.xy);
	int r = int(f.z);
	bool least = f.w > 0.5;
	float m = least ? 2.0 : 0.0;
	for (int j = -r; j <= r; j++) {
		float v = texelFetch(srcFloat, clamp(c + st * j, ivec2(0), ivec2(${SKY_MAP - 1})), 0).r;
		m = least ? min(m, v) : max(m, v);
	}
	o = vec4(m, 0.0, 0.0, 1.0);
	gl_FragDepth = toDepth > 0.5 ? m : gl_FragCoord.z;
}`;
// A BloomEffect's bloom of the whole picture, as WebGpuView's fsBright: the
// frame's light past p.x where Neon is not glowing, added to Neon's source.
const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D frame; uniform sampler2D src; uniform vec4 p;
out vec4 o;
void main() {
	vec3 t = pow(texture(frame, uv).rgb, vec3(2.2));
	vec4 s = texture(src, uv);
	float m = max(t.r, max(t.g, t.b));
	// By its light, as WebGpuView's fsBright.
	float y = dot(t, vec3(0.2126, 0.7152, 0.0722));
	float over = max(y - p.x, 0.0) / max(1.0 - p.x, 1e-3);
	float lit = pow(over, p.z) * p.w * (1.0 - smoothstep(0.02, 0.1, max(s.r, max(s.g, s.b))));
	o = vec4(s.rgb + t / max(m, 1e-4) * lit, s.a);
}`;
// The glow round what gives light, as WebGpuView's POST blurs and adds it.
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D tex; uniform vec4 p; out vec4 o;
void main() {
	float s = max(p.w, 0.5);
	vec3 c = textureLod(tex, uv, 0.0).rgb;
	float total = 1.0;
	for (float k = 1.0; k <= 3.0 * s; k += 2.0) {
		float a = exp(-k * k / (2.0 * s * s));
		float b = exp(-(k + 1.0) * (k + 1.0) / (2.0 * s * s));
		vec2 d = p.xy * ((k * a + (k + 1.0) * b) / (a + b));
		c += (textureLod(tex, uv + d, 0.0).rgb + textureLod(tex, uv - d, 0.0).rgb) * (a + b);
		total += 2.0 * (a + b);
	}
	// The alpha, what images cover, is carried through unblurred, as in WebGpuView.
	o = vec4(c / total, textureLod(tex, uv, 0.0).a);
}`;
// The glow's source averaged down to half, as WebGpuView's fsDown.
// Particle resolution's half-size layer, as WebGpuView's fxHalfDepth and
// FX_UP: the frame's depth made half size, each pixel the nearest of its
// four, and the layer laid over the frame, smoothed.
const FS_FX_DEPTH = `#version 300 es
precision highp float;
uniform highp sampler2D depthIn;
// Whether nearer is greater, as where depth is reversed.
uniform float greater;
void main() {
	ivec2 size = textureSize(depthIn, 0);
	ivec2 at = ivec2(gl_FragCoord.xy) * 2;
	float d = greater > 0.5 ? 0.0 : 1.0;
	for (int k = 0; k < 4; k++) {
		ivec2 p = min(at + ivec2(k & 1, k >> 1), size - ivec2(1));
		float s = texelFetch(depthIn, p, 0).r;
		d = greater > 0.5 ? max(d, s) : min(d, s);
	}
	gl_FragDepth = d;
}`;
const FS_FX_UP = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D layer; out vec4 o;
void main() { o = textureLod(layer, uv, 0.0); }`;
const FS_DOWN = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D tex; out vec4 o;
void main() { o = textureLod(tex, uv, 0.0); }`;
// The frame with the glow added in linear light, as WebGpuView's fsComposite.
const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D tex; uniform sampler2D frame; uniform sampler2D wide; uniform vec4 p;
uniform vec4 grade0; uniform vec4 grade1; out vec4 o;
vec3 heatColour(float h, bool lights) {
	if (lights && h < 0.01) return vec3(0.03, 0.03, 0.04);
	float t = clamp(h, 0.0, 1.0);
	if (t < 0.3) return mix(vec3(0.03, 0.22, 0.06), vec3(0.1, 0.72, 0.16), t / 0.3);
	if (t < 0.55) return mix(vec3(0.1, 0.72, 0.16), vec3(0.95, 0.85, 0.12), (t - 0.3) / 0.25);
	if (t < 0.8) return mix(vec3(0.95, 0.85, 0.12), vec3(0.9, 0.14, 0.06), (t - 0.55) / 0.25);
	return mix(vec3(0.9, 0.14, 0.06), vec3(1.0), (t - 0.8) / 0.2);
}
${OVERDRAW_GLSL}
void main() {
	vec3 f = texelFetch(frame, ivec2(gl_FragCoord.xy), 0).rgb;
	// Triangle density (p.w 4): shares and shading.
	if (p.w > 3.5) {
		o = vec4(densityColour(f), 1.0);
		return;
	}
	// Overdraw (p.w 3): the frame holds counts' shares.
	if (p.w > 2.5) {
		o = vec4(overdrawColour(f.r), 1.0);
		return;
	}
	// A heatmap (p.w 1, or 2 for lights): the frame holds shares, not colours.
	if (p.w > 0.5) {
		o = vec4(heatColour(f.r, p.w > 1.5), 1.0);
		return;
	}
	// The glow spreads over Decals and Textures too, as WebGpuView's fsComposite.
	// Narrow and wide blurs added, as WebGpuView's fsComposite.
	vec3 g = (texture(tex, uv).rgb * ${GLOW_NARROW.weight} + texture(wide, uv).rgb * ${GLOW_WIDE.weight}) * p.z;
	vec3 c = pow(min(pow(f, vec3(2.2)) + g, vec3(1.0)), vec3(1.0 / 2.2));
	// ColorCorrection, as WebGpuView's fsComposite applies it.
	if (grade0.w > 0.5) {
		c = clamp(c + grade0.x, 0.0, 1.0);
		c = clamp((c - 0.5) * (1.0 + grade0.y) + 0.5, 0.0, 1.0);
		float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
		c = clamp(grey + (c - grey) * (1.0 + grade0.z), 0.0, 1.0);
		c *= grade1.rgb;
	}
	float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
	o = vec4(clamp(c + n / 255.0 * step(1.0 / 512.0, max(g.r, max(g.g, g.b))), 0.0, 1.0), 1.0);
}`;
const FS_GLOW = `#version 300 es
precision highp float;
in vec3 vColour; in vec3 vWorld; in vec3 vNormal; flat in uint vId; in float vAlpha; flat in uint vLook; in vec3 vLocal; in vec3 vLNormal;
uniform vec4 M[${MATERIALS.length * 3}];
uniform mediump sampler2DArray looks;
uniform float seen;
// A thin Neon part's share of the light it gives off, widened: see VS's GLOW_PASS.
flat in float vK;
uniform vec4 R;
bool has(int bit) { return (int(R.y + 0.5) & bit) != 0; }
// Neon's glow: see glowShape's gate.
uniform vec4 bloom;
${PATTERNS}
${LOG_DEPTH}
out vec4 o;
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = logDepth();
#endif
	int row = int(vLook & 255u);
	vec4 b = M[row * 3 + 1];
	vec4 tex = M[row * 3 + 2];
	vec2 uv = faceUv(vLocal, vLNormal);
	int layer = int(b.w) - 1;
	vec3 e = vec3(0.0);
	// In linear light, as WebGpuView's glowSource gives it.
	if (b.y > 0.5 && b.y < 1.5) {
		vec3 lit = has(${FEATURE_BIT.neonGlow}) ? pow(max(neonLevel(vColour, vAlpha), 0.0), vec3(2.2)) : vec3(0.0);
		float most = max(lit.r, max(lit.g, lit.b));
		// As WebGpuView's glowSource: gone from 0.3, easing as Studio's captures show.
		float fade = pow(max(1.0 - (1.0 - vAlpha) / bloom.z, 0.0), 1.1);
		e = (1.0 - exp(-max(lit - bloom.y, 0.0))) * smoothstep(bloom.x, bloom.x + 0.3, most) * fade;
	}
	else if (!has(${FEATURE_BIT.lava})) e = vec3(0.0);
	else if (tex.z > 0.5 && layer >= 0) e = min(lavaLight(texture(looks, vec3(uv / tex.x, float(layer))).g), vec3(1.0)) * 0.2;
	else if (int(b.z) == 14) e = min(lavaLight(pattern(14, uv, b.x).z), vec3(1.0)) * 0.2;
	// A see-through part over what glows behind it, as WebGpuView's fsGlowSeen.
	bool neon = b.y > 0.5 && b.y < 1.5;
	float a = neon ? neonAlpha(vAlpha) : vAlpha;
	// A solid part's alpha, 0, clears what images cover, as WebGpuView's fsGlow.
	o = seen > 0.5 ? vec4(e * (neon ? 1.0 : vAlpha), a) * vK : vec4(e * vK, 0.0);
}`;
/** The scene's vertex shader for the glow's source: thin Neon parts widened. */
const VS_GLOW = VS.replace("#version 300 es\n", "#version 300 es\n#define GLOW_PASS\n");
const FS_ID = `#version 300 es
precision highp float; precision highp int; in vec3 vColour; flat in uint vId; out uint o;
${LOG_DEPTH}
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = logDepth();
#endif
	o = vId + 1u;
}`;

interface Program {
	program: WebGLProgram;
	viewProj: WebGLUniformLocation | null;
	sun: WebGLUniformLocation | null;
	outline: WebGLUniformLocation | null;
	select: WebGLUniformLocation | null;
	handle: WebGLUniformLocation | null;
	alpha: WebGLUniformLocation | null;
	block: WebGLUniformLocation | null;
	invViewProj: WebGLUniformLocation | null;
	screen: WebGLUniformLocation | null;
}

/** One instanced draw of a mesh. */
type Draw = {
	vao: WebGLVertexArrayObject;
	indexCount: number;
	type: number;
	count: number;
	wire: WireSource;
};

/** EXT_clip_control, which TypeScript's DOM types do not list. */
interface ClipControl {
	readonly LOWER_LEFT_EXT: number;
	readonly NEGATIVE_ONE_TO_ONE_EXT: number;
	readonly ZERO_TO_ONE_EXT: number;
	clipControlEXT(origin: number, depth: number): void;
}

/** A draw's mesh and buffers, for its wireframe's edges, and those edges once made. */
interface WireSource {
	mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array };
	vertices: WebGLBuffer;
	instances: WebGLBuffer;
	edges?: { vao: WebGLVertexArrayObject; count: number };
}

/** The wide glow blur's size: a quarter of the view's, from the glow's half. */
function quarterOf(w: number, h: number): [number, number] {
	return [Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))];
}

export class WebGl2View implements ViewRenderer {
	readonly backend = "WebGL2" as const;

	/** Samples a pixel asked for: as far as the GPU goes, see drawnSamples. */
	readonly samples: number;
	/** A pipeline or table the view waited on is ready: draw again. */
	onRedraw?: () => void;

	/** Texture resolution's levels smaller: the material textures' base mip level. */
	private lookStep = 0;

	setTextureDetail(step: number): void {
		const level = Math.min(step, TEXTURE_LEVELS - 1);
		if (level === this.lookStep) return;
		this.lookStep = level;
		const gl = this.gl;
		if (gl && this.looks) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.looks);
			gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_BASE_LEVEL, level);
			gl.activeTexture(gl.TEXTURE0);
		}
		this.onRedraw?.();
	}

	/**
	 * The antialiasing asked for (see antialias.ts), and each sun shadow
	 * map's side, in texels, as the quality level sets them.
	 */
	constructor(antialias: AntialiasMode = "msaa4", shadowMap: number = CASCADE_MAP) {
		this.asked = antialias;
		this.mapSide = shadowMap;
		this.samples = antialiasInfo(antialias).samples;
	}

	/** The antialiasing drawn, which setAntialias may change. */
	private asked: AntialiasMode;
	/** Each sun shadow map's side, which setShadowMap may change. */
	private mapSide: number;

	get antialias(): AntialiasMode {
		return this.asked;
	}

	get shadowMap(): number {
		return this.mapSide;
	}

	/** In place where the samples stay: MSAA's 4x is the canvas's own, made with the context. */
	setAntialias(mode: AntialiasMode): boolean {
		if (antialiasInfo(mode).samples !== this.samples) return false;
		if (mode === this.asked) return true;
		this.asked = mode;
		if (this.gl) {
			this.makeAntialias();
			this.makeAaTargets();
			this.onRedraw?.();
		}
		return true;
	}

	setShadowMap(size: number): void {
		if (size === this.mapSide) return;
		this.mapSide = size;
		if (!this.gl || !this.sunMaps) return;
		this.gl.deleteTexture(this.sunMaps);
		this.makeCascades();
		this.cascadeLast = new Float32Array(CASCADE_BLOCK);
		this.cadence = new CascadeCadence();
		this.onRedraw?.();
	}

	/** The modes this renderer draws: MSAA as far as the GPU's MAX_SAMPLES. */
	antialiasModes(): AntialiasMode[] {
		return antialiasModes("WebGL2", (this.gl?.getParameter(this.gl.MAX_SAMPLES) as number) ?? 4);
	}
	private gl!: WebGL2RenderingContext;
	/**
	 * Where the browser has EXT_clip_control, depth runs 0 to 1 and is
	 * reversed, near at 1, into float buffers, as WebGpuView's: the shaders
	 * then write no depth of their own, and the solid parts are drawn for their
	 * depth first and lit only where nearest. Null elsewhere: log depth.
	 */
	private clipControl: ClipControl | null = null;
	/** The depth test that keeps the nearer surface, and the one that keeps an equal one too. */
	private nearer = 0x0201;
	private nearerOrEqual = 0x0203;
	/** The depth a target is cleared to: the far plane. */
	private farDepth = 1;
	/** The solid parts' depth alone, before they are lit: only where depth is reversed. */
	private pre: Program | null = null;
	private main!: Program;
	private reflProgram!: Program;
	private reflCube: WebGLTexture | null = null;
	private reflFbo: WebGLFramebuffer | null = null;
	/** Where the cube was last drawn from; null, to be drawn again. */
	private reflAt: number[] | null = null;
	/** Where the cube read now was drawn from, for the shader: see reflCentre. */
	private reflCentre: number[] | null = null;
	/** The reflection grid's cell, in studs; null, the cube follows the camera. */
	private reflGrid: number | null = null;
	/** Cubes kept on the grid, by cell: each with where it was drawn from, and when last read. */
	private reflCache = new Map<string, { cube: WebGLTexture; at: number[]; used: number }>();
	/** Cubes no cell keeps, to draw the next into. */
	private reflSpare: WebGLTexture[] = [];
	/** The cell whose cube is read now. */
	private reflShown: string | null = null;
	private reflUses = 0;

	setReflectionGrid(cell: number | null): void {
		if (cell === this.reflGrid) return;
		this.reflGrid = cell;
		this.reflStale();
		this.onRedraw?.();
	}

	/** What the cube shows changed: drawn again; every kept cube spare but the one read now. */
	private reflStale(): void {
		this.reflAt = null;
		for (const e of this.reflCache.values())
			if (e.cube !== this.reflCube) this.reflSpare.push(e.cube);
		this.reflCache.clear();
		this.reflShown = null;
	}

	/** A cube of half floats with its smaller levels, for the reflections. */
	private newCube(): WebGLTexture {
		const gl = this.gl;
		const cube = gl.createTexture()!;
		gl.activeTexture(gl.TEXTURE14);
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
		gl.texStorage2D(gl.TEXTURE_CUBE_MAP, PROBE_LEVELS, gl.RGBA16F, PROBE_SIZE, PROBE_SIZE);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.reflCube);
		gl.activeTexture(gl.TEXTURE0);
		return cube;
	}

	/** The cube now read, the latest drawn: kept for its cell, the least used dropped past REFLECTION_CACHE. */
	private keepCube(key: string, cube: WebGLTexture, at: number[]): void {
		this.reflCache.set(key, { cube, at, used: ++this.reflUses });
		if (this.reflCache.size <= REFLECTION_CACHE) return;
		let oldest: string | null = null;
		let least = Number.POSITIVE_INFINITY;
		for (const [k, e] of this.reflCache) {
			if (e.cube === this.reflCube || e.used >= least) continue;
			oldest = k;
			least = e.used;
		}
		if (oldest === null) return;
		const dropped = this.reflCache.get(oldest);
		this.reflCache.delete(oldest);
		if (dropped) this.reflSpare.push(dropped.cube);
	}

	/** A cube read from here on, on unit 14, and where it was drawn from. */
	private showCube(cube: WebGLTexture, at: number[]): void {
		const gl = this.gl;
		this.reflCube = cube;
		this.reflCentre = at;
		gl.activeTexture(gl.TEXTURE14);
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
		gl.activeTexture(gl.TEXTURE0);
	}

	/** Scene reflections' cube and what draws into it: see PROBE_SIZE. Half floats, where they can be drawn into. */
	private makeReflections(): void {
		const gl = this.gl;
		if (!gl.getExtension("EXT_color_buffer_float")) {
			// Nothing to draw into: a clear cube, so reflections show the sky alone.
			const blank = gl.createTexture();
			gl.activeTexture(gl.TEXTURE14);
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, blank);
			gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, gl.RGBA8, 1, 1);
			gl.activeTexture(gl.TEXTURE0);
			return;
		}
		this.reflCube = gl.createTexture();
		gl.activeTexture(gl.TEXTURE14);
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.reflCube);
		gl.texStorage2D(gl.TEXTURE_CUBE_MAP, PROBE_LEVELS, gl.RGBA16F, PROBE_SIZE, PROBE_SIZE);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.activeTexture(gl.TEXTURE0);
		this.reflFbo = gl.createFramebuffer();
		const depth = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, PROBE_SIZE, PROBE_SIZE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflFbo);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	/**
	 * The cube's six faces, as WebGpuView's drawReflections: when scene
	 * reflections are on and the camera is PROBE_STEP studs from where it was
	 * last drawn, or what it shows changed. Every part, culled for no face;
	 * then its smaller levels, for a metal's blur.
	 */
	private drawReflections(camera: Camera): void {
		const gl = this.gl;
		const shown = this.reflCube;
		if (!shown || !this.reflFbo || !featureOn(this.render.features, "sceneReflections")) return;
		const grid = this.reflGrid;
		const key = grid === null ? null : reflectionCell(camera.eye, grid);
		if (key === null) {
			const at = this.reflAt;
			if (at && Math.hypot(...camera.eye.map((v, a) => v - at[a])) < PROBE_STEP) return;
		} else {
			// The grid, as WebGpuView's: the cell's own cube, kept once drawn,
			// from where the camera entered the cell, not its middle, which may
			// be inside a wall and reflect only darkness.
			if (this.reflAt && this.reflShown === key) return;
			const kept = this.reflCache.get(key);
			if (kept) {
				kept.used = ++this.reflUses;
				// The cube read until now, where no cell keeps it, goes spare.
				if (![...this.reflCache.values()].some((e) => e.cube === shown)) this.reflSpare.push(shown);
				this.showCube(kept.cube, kept.at);
				this.reflAt = kept.at;
				this.reflShown = key;
				return;
			}
		}
		// Into the cube read now, unless a cell keeps it: then a spare, or a new one.
		const cube =
			key !== null && [...this.reflCache.values()].some((e) => e.cube === shown)
				? (this.reflSpare.pop() ?? this.newCube())
				: shown;
		this.reflAt = [...camera.eye];
		const faces = probeFaces(camera.eye, true);
		this.redrawn.probeFaces += faces.length;
		// The solid parts' Decals and Textures go on each face too: the image
		// program's lighting set for this camera, its view swapped per face.
		const images =
			this.imageVao && passesOf(this.render.features).images
				? imageOrder(this.imageList, "solid", camera.eye, (asset) => this.imageTextures.has(asset))
				: [];
		if (images.length > 0) this.use(this.imageProgram, camera, false);
		this.use(this.reflProgram, camera, false);
		this.usualDepth(true);
		gl.depthFunc(gl.LESS);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflFbo);
		gl.viewport(0, 0, PROBE_SIZE, PROBE_SIZE);
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.clearColor(0, 0, 0, 0);
		gl.clearDepth(1);
		const culled = this.runs;
		this.runs = new Map();
		faces.forEach((face, k) => {
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_CUBE_MAP_POSITIVE_X + k,
				cube,
				0,
			);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.uniformMatrix4fv(this.reflProgram.viewProj, false, face);
			this.solids();
			if (images.length > 0) this.reflectImages(images, face);
		});
		this.runs = culled;
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_CUBE_MAP_POSITIVE_X,
			null,
			0,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.showCube(cube, this.reflAt);
		if (key !== null) {
			this.reflShown = key;
			this.keepCube(key, cube, this.reflAt);
		}
		gl.activeTexture(gl.TEXTURE14);
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
		gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
		gl.activeTexture(gl.TEXTURE0);
		gl.enable(gl.CULL_FACE);
		gl.viewport(0, 0, this.width, this.height);
	}
	private ids!: Program;
	private over!: Program;
	private skyProgram!: Program;
	private lighting!: LightingParams;
	private overlay: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number } | null =
		null;
	private sceneBuffers: WebGLBuffer[] = [];
	private handleMeshes: {
		kind: (typeof HANDLE_KINDS)[number];
		vertices: WebGLBuffer;
		indices: WebGLBuffer;
		indexCount: number;
	}[] = [];
	private handleDraws: {
		vao: WebGLVertexArrayObject;
		buffer: WebGLBuffer;
		indexCount: number;
		count: number;
	}[] = [];
	/** `type` is 16 bits an index for the shapes made here, 32 for a mesh. */
	private draws: {
		vao: WebGLVertexArrayObject;
		indexCount: number;
		type: number;
		count: number;
		/** What a wireframe's edges are found from, and its edges once asked for. */
		wire: WireSource;
		/** The solid parts' chunks, for culling: see culling.ts. */
		chunks?: Chunk[];
	}[] = [];
	private clear: {
		vao: WebGLVertexArrayObject;
		indexCount: number;
		type: number;
		count: number;
		/** What a wireframe's edges are found from, and its edges once asked for. */
		wire: WireSource;
		instances: WebGLBuffer;
		source: Float32Array;
		sorted: Float32Array;
	}[] = [];
	private clearEye: number[] | null = null;
	/** See-through Glass: its depth first, then its colour, so nothing see-through shows behind it. */
	private glass: {
		vao: WebGLVertexArrayObject;
		indexCount: number;
		type: number;
		count: number;
		/** What a wireframe's edges are found from, and its edges once asked for. */
		wire: WireSource;
	}[] = [];
	private glassHides = true;
	private scene?: PlaceScene;
	// The glow: what gives light drawn small, blurred, and added over the
	// finished frame, which is drawn off screen first for it.
	private glowing = false;
	private glowProgram!: Program;
	private blurProgram!: Program;
	private downProgram!: Program;
	private compositeProgram!: Program;
	private sceneFbo!: WebGLFramebuffer;
	private sceneColour!: WebGLRenderbuffer;
	private sceneDepth!: WebGLRenderbuffer;
	private frameFbo!: WebGLFramebuffer;
	private frameTex!: WebGLTexture;
	/** The frame blurred across, on its way to being blurred down: a BlurEffect. */
	private acrossFbo!: WebGLFramebuffer;
	private acrossTex!: WebGLTexture;
	private postOn = true;

	/** The glow the place's BloomEffect asks for: see `glowShape`. */
	private shape: GlowShape = glowShape(undefined, false);
	setPostEffects(on: boolean): void {
		this.postOn = on;
	}

	/** The quality level's render distance and sun shadows. */
	private quality: ViewQuality = FULL_QUALITY;
	setQuality(quality: ViewQuality): void {
		const coarse = this.quality.glowCoarse === true;
		this.quality = quality;
		// The glow's targets sized again for the screen: see ViewQuality.glowCoarse.
		if (this.gl && (quality.glowCoarse === true) !== coarse) {
			this.glowSize = [0, 0];
			this.sizeGlow();
		}
	}

	/** The Rendering panel's mode and switches: see `RenderSettings`. */
	private render: RenderSettings = DEFAULT_RENDER;

	setRender(render: RenderSettings): void {
		// Thin parts' switch changes what the near sky maps hold: draw them again.
		// What the near maps and the lighting cells hold changed: draw them again.
		const held = (r: RenderSettings) =>
			`${passesOf(r.features).thinParts} ${featureBits(r.features) & (FEATURE_BIT.skyShadows | FEATURE_BIT.nearSky)}`;
		if (held(render) !== held(this.render)) this.nearCentre = null;
		if (render.features !== this.render.features) {
			this.reflStale();
			this.gridStale = true;
		}
		this.render = render;
	}

	/** This frame's draw calls, instances and triangles, and the last frame's. */
	private tally = { draws: 0, instances: 0, triangles: 0 };
	private lastTally = { draws: 0, instances: 0, triangles: 0 };
	private cpuMs = 0;

	/** WebGL2 does not time the GPU here. */
	stats(): RenderStats {
		const fx = this.effects?.last;
		return {
			...this.lastTally,
			culled: this.culled,
			beams: fx?.beams ?? 0,
			particles: fx?.particles ?? 0,
			cpu: this.cpuMs,
			gpu: null,
			memory: this.memory.use(
				canvasBytes(
					this.gl?.drawingBufferWidth ?? 0,
					this.gl?.drawingBufferHeight ?? 0,
					this.samples === 4 ? 4 : 1,
				),
			),
		};
	}

	/** What the view has made on the GPU: see gpuMemory.ts. */
	private readonly memory = new GpuMemory();

	/** The place's Beams and ParticleEmitters: see `effectsGl.ts`. */
	private effects?: GlEffects;

	// -- Particle resolution's half-size layer ---------------------------------------

	/** Particle resolution Half: effects drawn at half size, where the frame has a pass of its own. */
	private particleHalf = false;
	/** The layer, its depth, the frame's depth as a texture, and the passes that use them. */
	private fxLayer: {
		width: number;
		height: number;
		/** The frame's size it was made for. */
		full: [number, number];
		fbo: WebGLFramebuffer;
		colour: WebGLTexture;
		depth: WebGLRenderbuffer;
		fullFbo: WebGLFramebuffer;
		fullDepth: WebGLTexture;
	} | null = null;
	private fxPrograms: { down: Program; up: Program; vao: WebGLVertexArrayObject } | null = null;

	setParticleHalf(on: boolean): void {
		if (on === this.particleHalf) return;
		this.particleHalf = on;
		if (!on) this.dropFxLayer();
		this.onRedraw?.();
	}

	private dropFxLayer(): void {
		const l = this.fxLayer;
		if (!l || !this.gl) return;
		const gl = this.gl;
		gl.deleteFramebuffer(l.fbo);
		gl.deleteFramebuffer(l.fullFbo);
		gl.deleteTexture(l.colour);
		gl.deleteTexture(l.fullDepth);
		gl.deleteRenderbuffer(l.depth);
		this.fxLayer = null;
	}

	/** The layer's targets, made again for a new frame size. */
	private makeFxLayer(): NonNullable<WebGl2View["fxLayer"]> {
		const gl = this.gl;
		const width = Math.max(1, Math.ceil(this.width / 2));
		const height = Math.max(1, Math.ceil(this.height / 2));
		const was = this.fxLayer;
		if (was && was.full[0] === this.width && was.full[1] === this.height) return was;
		this.dropFxLayer();
		const colour = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, colour);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const depth = gl.createRenderbuffer()!;
		gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
		gl.renderbufferStorage(gl.RENDERBUFFER, this.depthFormat(), width, height);
		const fbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colour, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
		// The frame's depth, resolved where it has samples, to be read.
		const fullDepth = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, fullDepth);
		gl.texStorage2D(gl.TEXTURE_2D, 1, this.depthFormat(), this.width, this.height);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		const fullFbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fullFbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, fullDepth, 0);
		gl.bindTexture(gl.TEXTURE_2D, null);
		this.fxLayer = {
			width,
			height,
			full: [this.width, this.height],
			fbo,
			colour,
			depth,
			fullFbo,
			fullDepth,
		};
		return this.fxLayer;
	}

	/**
	 * Beams and particles at half the frame's size across and down, as
	 * WebGpuView's drawHalfEffects: against the frame's depth made half size,
	 * the nearest of each four, into a layer of their own, laid over the
	 * frame, smoothed. Their blend is premultiplied, so one blend lays it over.
	 */
	private drawHalfEffects(camera: Camera, into: WebGLFramebuffer | null): void {
		const gl = this.gl;
		const l = this.makeFxLayer();
		this.fxPrograms ??= {
			down: this.link(VS_FULL, FS_FX_DEPTH),
			up: this.link(VS_FULL, FS_FX_UP),
			vao: gl.createVertexArray()!,
		};
		const p = this.fxPrograms;
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, into);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, l.fullFbo);
		gl.blitFramebuffer(
			0,
			0,
			this.width,
			this.height,
			0,
			0,
			this.width,
			this.height,
			gl.DEPTH_BUFFER_BIT,
			gl.NEAREST,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, l.fbo);
		gl.viewport(0, 0, l.width, l.height);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.ALWAYS);
		gl.depthMask(true);
		gl.colorMask(false, false, false, false);
		gl.useProgram(p.down.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, l.fullDepth);
		gl.uniform1i(gl.getUniformLocation(p.down.program, "depthIn"), 0);
		gl.uniform1f(
			gl.getUniformLocation(p.down.program, "greater"),
			this.nearer === gl.GREATER ? 1 : 0,
		);
		gl.bindVertexArray(p.vao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
		gl.colorMask(true, true, true, true);
		gl.depthFunc(this.nearer);
		gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
		this.drawEffects(camera);
		gl.bindFramebuffer(gl.FRAMEBUFFER, into);
		gl.viewport(0, 0, this.width, this.height);
		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
		gl.useProgram(p.up.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, l.colour);
		gl.uniform1i(gl.getUniformLocation(p.up.program, "layer"), 0);
		gl.bindVertexArray(p.vao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
	}

	private drawEffects(camera: Camera): void {
		const fx = this.effects;
		if (!fx) return;
		const show = passesOf(this.render.features);
		const on = { beams: show.beams, particles: show.particles };
		fx.draw(
			camera,
			this.width,
			this.height,
			this.lighting,
			this.render,
			on,
			performance.now() / 1000,
		);
		this.tally.draws += fx.last.draws;
		this.tally.triangles += fx.last.quads * 2;
	}

	animates(): boolean {
		return (
			(this.effects?.last.moving ?? false) ||
			this.occlusionStale ||
			(antialiasInfo(this.antialias).pass === "taa" && this.still.settling)
		);
	}

	// -- antialiasing by a pass over the frame: see antialias.ts --------------------------

	/** Where the frame is drawn: the passes' input while one is on, else the canvas. */
	private outFbo: WebGLFramebuffer | null = null;
	private aaFbo: WebGLFramebuffer | null = null;
	private aaColour: WebGLTexture | null = null;
	private aaDepth: WebGLRenderbuffer | null = null;
	private aaEdges: { tex: WebGLTexture; fbo: WebGLFramebuffer } | null = null;
	private aaWeights: { tex: WebGLTexture; fbo: WebGLFramebuffer } | null = null;
	private aaHistory: { tex: WebGLTexture; fbo: WebGLFramebuffer }[] = [];
	private aaHistoryRead = 0;
	private aaArea: WebGLTexture | null = null;
	private aaSearch: WebGLTexture | null = null;
	private aaPrograms: Partial<Record<keyof typeof AA_GLSL, WebGLProgram>> = {};
	private still = new StillFrames();
	private jitter: [number, number] = [0, 0];
	private taaWeight = 1;

	/** The passes' programs, and SMAA's tables once they are unpacked; the targets come with resize. */
	private makeAntialias(): void {
		const gl = this.gl;
		const pass = antialiasInfo(this.antialias).pass;
		if (pass === "none") return;
		const program = (fs: string) => {
			const compile = (type: number, src: string) => {
				const s = gl.createShader(type)!;
				gl.shaderSource(s, src);
				gl.compileShader(s);
				if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
					throw new Error(gl.getShaderInfoLog(s) ?? "antialiasing shader");
				return s;
			};
			const prog = gl.createProgram()!;
			gl.attachShader(prog, compile(gl.VERTEX_SHADER, AA_VS));
			gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
			gl.linkProgram(prog);
			if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
				throw new Error(gl.getProgramInfoLog(prog) ?? "antialiasing program");
			// The passes' textures on units of their own, past the ones the place keeps.
			gl.useProgram(prog);
			const names = ["colourTex", "edgesTex", "blendTex", "areaTex", "searchTex", "historyTex"];
			names.forEach((n, k) => gl.uniform1i(gl.getUniformLocation(prog, n), 16 + k));
			return prog;
		};
		const wanted: (keyof typeof AA_GLSL)[] =
			pass === "fxaa"
				? ["copy", "fxaa"]
				: pass === "smaa"
					? ["copy", "edges", "weights", "blend"]
					: ["copy", "taa"];
		for (const name of wanted) this.aaPrograms[name] = program(AA_GLSL[name]);
		if (pass === "smaa")
			void smaaTables().then(({ area, search }) => {
				const upload = (
					bytes: Uint8Array,
					size: { width: number; height: number },
					internal: number,
					format: number,
					filter: number,
				) => {
					const tex = gl.createTexture()!;
					gl.activeTexture(gl.TEXTURE16);
					gl.bindTexture(gl.TEXTURE_2D, tex);
					gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						internal,
						size.width,
						size.height,
						0,
						format,
						gl.UNSIGNED_BYTE,
						bytes,
					);
					gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.bindTexture(gl.TEXTURE_2D, null);
					gl.activeTexture(gl.TEXTURE0);
					return tex;
				};
				this.aaArea = upload(area, SMAA_AREA, gl.RG8, gl.RG, gl.LINEAR);
				this.aaSearch = upload(search, SMAA_SEARCH, gl.R8, gl.RED, gl.NEAREST);
				this.onRedraw?.();
			});
	}

	/** The passes' targets, the canvas's size: the frame's, with depth, and SMAA's or TAA's own. */
	private makeAaTargets(): void {
		const gl = this.gl;
		const pass = antialiasInfo(this.antialias).pass;
		for (const t of [
			this.aaColour,
			this.aaEdges?.tex,
			this.aaWeights?.tex,
			...this.aaHistory.map((h) => h.tex),
		])
			if (t) gl.deleteTexture(t);
		for (const f of [
			this.aaFbo,
			this.aaEdges?.fbo,
			this.aaWeights?.fbo,
			...this.aaHistory.map((h) => h.fbo),
		])
			if (f) gl.deleteFramebuffer(f);
		if (this.aaDepth) gl.deleteRenderbuffer(this.aaDepth);
		this.aaColour = null;
		this.aaFbo = null;
		this.aaDepth = null;
		this.aaEdges = null;
		this.aaWeights = null;
		this.aaHistory = [];
		if (pass === "none") return;
		const texture = (internal: number, filter: number) => {
			const tex = gl.createTexture()!;
			gl.activeTexture(gl.TEXTURE16);
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texStorage2D(gl.TEXTURE_2D, 1, internal, this.width, this.height);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.activeTexture(gl.TEXTURE0);
			return tex;
		};
		const target = (internal: number, filter: number) => {
			const tex = texture(internal, filter);
			const fbo = gl.createFramebuffer()!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
			return { tex, fbo };
		};
		const frame = target(gl.RGBA8, gl.LINEAR);
		this.aaColour = frame.tex;
		this.aaFbo = frame.fbo;
		this.aaDepth = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.aaDepth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.aaDepth);
		this.aaEdges = pass === "smaa" ? target(gl.RG8, gl.LINEAR) : null;
		this.aaWeights = pass === "smaa" ? target(gl.RGBA8, gl.LINEAR) : null;
		const half = gl.getExtension("EXT_color_buffer_float") !== null;
		this.aaHistory =
			pass === "taa" ? [0, 1].map(() => target(half ? gl.RGBA16F : gl.RGBA8, gl.NEAREST)) : [];
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.still.reset();
	}

	/** The pass over the frame, onto the canvas: FXAA's, SMAA's three, or TAA's average and its copy. */
	private antialiasPasses(): void {
		const gl = this.gl;
		const pass = antialiasInfo(this.antialias).pass;
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		gl.disable(gl.CULL_FACE);
		gl.depthMask(false);
		gl.viewport(0, 0, this.width, this.height);
		const bind = (textures: (WebGLTexture | null)[]) =>
			textures.forEach((tex, k) => {
				gl.activeTexture(gl.TEXTURE16 + k);
				gl.bindTexture(gl.TEXTURE_2D, tex);
			});
		const run = (
			prog: WebGLProgram | undefined,
			into: WebGLFramebuffer | null,
			textures: (WebGLTexture | null)[],
		): boolean => {
			if (!prog) return false;
			gl.bindFramebuffer(gl.FRAMEBUFFER, into);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(prog);
			gl.uniform4f(
				gl.getUniformLocation(prog, "rt"),
				1 / this.width,
				1 / this.height,
				this.width,
				this.height,
			);
			gl.uniform1f(gl.getUniformLocation(prog, "taa"), this.taaWeight);
			bind(textures);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			return true;
		};
		const p = this.aaPrograms;
		const colour = this.aaColour;
		const copy = () => run(p.copy, null, [colour]);
		if (pass === "fxaa") {
			if (!run(p.fxaa, null, [colour])) copy();
		} else if (pass === "smaa") {
			if (
				!p.edges ||
				!p.weights ||
				!p.blend ||
				!this.aaArea ||
				!this.aaSearch ||
				!this.aaEdges ||
				!this.aaWeights
			)
				copy();
			else {
				run(p.edges, this.aaEdges.fbo, [colour]);
				run(p.weights, this.aaWeights.fbo, [
					null,
					this.aaEdges.tex,
					null,
					this.aaArea,
					this.aaSearch,
				]);
				run(p.blend, null, [colour, null, this.aaWeights.tex]);
			}
		} else {
			const from = this.aaHistory[this.aaHistoryRead];
			const into = this.aaHistory[1 - this.aaHistoryRead];
			if (!p.taa || !from || !into) copy();
			else {
				run(p.taa, into.fbo, [colour, null, null, null, null, from.tex]);
				this.aaHistoryRead = 1 - this.aaHistoryRead;
				run(p.copy, null, [into.tex]);
			}
		}
		bind([null, null, null, null, null, null]);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.depthMask(true);
		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.CULL_FACE);
	}

	// -- the lighting cells: see SKY_CELL, and WebGpuView's fillCells ------------------

	private cellTex: WebGLTexture[] = [];
	private cellsRead = 0;
	private cellFbo: WebGLFramebuffer | null = null;
	private cellVao: WebGLVertexArrayObject | null = null;
	private cellProg?: Program;

	/** Each lighting cell from the maps just drawn, into the cells not read; then read, on unit 13. */
	private fillCells(camera: Camera): void {
		const gl = this.gl;
		if (!this.cellProg) {
			this.cellProg = this.link(VS_CELL, FS_CELL);
			this.cellFbo = gl.createFramebuffer();
			this.cellVao = gl.createVertexArray();
			for (let k = 0; k < 2; k++) {
				const t = gl.createTexture()!;
				gl.activeTexture(gl.TEXTURE13);
				gl.bindTexture(gl.TEXTURE_3D, t);
				gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, SKY_CELLS[0], SKY_CELLS[2], SKY_CELLS[1]);
				gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
					gl.texParameteri(gl.TEXTURE_3D, wrap, gl.CLAMP_TO_EDGE);
				this.cellTex.push(t);
			}
		}
		const target = this.cellTex[1 - this.cellsRead];
		// Unit 13 holds the cells read, never the ones drawn into.
		gl.activeTexture(gl.TEXTURE13);
		gl.bindTexture(gl.TEXTURE_3D, this.cellTex[this.cellsRead]);
		gl.activeTexture(gl.TEXTURE0);
		this.use(this.cellProg, camera, false);
		const slice = gl.getUniformLocation(this.cellProg.program, "cellSlice");
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.cellFbo);
		gl.viewport(0, 0, SKY_CELLS[0], SKY_CELLS[2]);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		gl.bindVertexArray(this.cellVao);
		for (let y = 0; y < SKY_CELLS[1]; y++) {
			gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, 0, y);
			gl.uniform1f(slice, y);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
		gl.bindVertexArray(null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
		gl.enable(gl.DEPTH_TEST);
		this.cellsRead = 1 - this.cellsRead;
		gl.activeTexture(gl.TEXTURE13);
		gl.bindTexture(gl.TEXTURE_3D, this.cellTex[this.cellsRead]);
		gl.activeTexture(gl.TEXTURE0);
	}

	// -- occlusion: the solid parts' distances, small, read back a frame late -------

	private far: {
		dist: Program;
		cells: WebGLProgram;
		cellsSize: WebGLUniformLocation | null;
		vao: WebGLVertexArrayObject;
		distFbo: WebGLFramebuffer;
		distTex: WebGLTexture;
		distDepth: WebGLRenderbuffer;
		cellFbo: WebGLFramebuffer;
		cellTex: WebGLTexture;
		pbo: WebGLBuffer;
		size: number[];
		cols: number;
		rows: number;
		/** The read under way: its fence, and the view it was drawn from. */
		pending: {
			fence: WebGLSync;
			vp: Float32Array;
			eye: number[];
			cols: number;
			rows: number;
		} | null;
	} | null = null;
	private cullView: { vp: Float32Array; eye: number[] } | null = null;
	private occlusionStale = false;
	/** The camera's eye frame to frame: occlusion's image is not made while it moves. */
	private eyes = new EyeTrack();
	private eyeMoving = true;
	/** Whether this frame's culling tests anything against occlusion's image. */
	private occludable = false;

	/** Takes up a read the GPU has finished, as the depth image for the next culling. */
	private pollFar(): void {
		const gl = this.gl;
		const pend = this.far?.pending;
		if (!this.far || !pend) return;
		const status = gl.getSyncParameter(pend.fence, gl.SYNC_STATUS);
		if (status !== gl.SIGNALED) return;
		gl.deleteSync(pend.fence);
		this.far.pending = null;
		const rgba = new Float32Array(pend.cols * pend.rows * 4);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.far.pbo);
		gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		// Read bottom row first; the image is top row first.
		const far = new Float32Array(pend.cols * pend.rows);
		for (let r = 0; r < pend.rows; r++)
			for (let c = 0; c < pend.cols; c++)
				far[r * pend.cols + c] = rgba[((pend.rows - 1 - r) * pend.cols + c) * 4];
		this.depthImage = { cols: pend.cols, rows: pend.rows, far, viewProj: pend.vp, eye: pend.eye };
	}

	/**
	 * The solid parts in view, each pixel its distance from the eye, into a
	 * target of its own (WebGL2 cannot read the multisampled depth), made
	 * small and read back without waiting: see pollFar.
	 */
	private drawFar(camera: Camera): void {
		const gl = this.gl;
		if (!this.cullView || this.far?.pending) return;
		if (!this.far) {
			if (!gl.getExtension("EXT_color_buffer_float")) return;
			const cells = gl.createProgram()!;
			const compile = (type: number, src: string) => {
				const sh = gl.createShader(type)!;
				gl.shaderSource(sh, src);
				gl.compileShader(sh);
				gl.attachShader(cells, sh);
			};
			compile(gl.VERTEX_SHADER, VS_FULL_CELLS);
			compile(gl.FRAGMENT_SHADER, FS_FAR_CELLS);
			gl.linkProgram(cells);
			if (!gl.getProgramParameter(cells, gl.LINK_STATUS)) return;
			const tex = () => {
				const t = gl.createTexture()!;
				gl.bindTexture(gl.TEXTURE_2D, t);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				return t;
			};
			this.far = {
				dist: this.link(VS, FS_DIST),
				cells,
				cellsSize: gl.getUniformLocation(cells, "size"),
				vao: gl.createVertexArray()!,
				distFbo: gl.createFramebuffer()!,
				distTex: tex(),
				distDepth: gl.createRenderbuffer()!,
				cellFbo: gl.createFramebuffer()!,
				cellTex: tex(),
				pbo: gl.createBuffer()!,
				size: [0, 0],
				cols: 0,
				rows: 0,
				pending: null,
			};
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
		const f = this.far;
		const { cols, rows } = depthCells(this.width, this.height);
		if (f.size[0] !== this.width || f.size[1] !== this.height) {
			gl.bindTexture(gl.TEXTURE_2D, f.distTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.width, this.height, 0, gl.RED, gl.FLOAT, null);
			gl.bindRenderbuffer(gl.RENDERBUFFER, f.distDepth);
			gl.renderbufferStorage(gl.RENDERBUFFER, this.depthFormat(), this.width, this.height);
			gl.bindFramebuffer(gl.FRAMEBUFFER, f.distFbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.distTex, 0);
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.distDepth);
			f.size = [this.width, this.height];
		}
		if (f.cols !== cols || f.rows !== rows) {
			gl.bindTexture(gl.TEXTURE_2D, f.cellTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cols, rows, 0, gl.RGBA, gl.FLOAT, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, f.cellFbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.cellTex, 0);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, f.pbo);
			gl.bufferData(gl.PIXEL_PACK_BUFFER, cols * rows * 16, gl.STREAM_READ);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
			f.cols = cols;
			f.rows = rows;
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
		// The distances, nearest kept by the depth test as the place's own.
		gl.bindFramebuffer(gl.FRAMEBUFFER, f.distFbo);
		gl.viewport(0, 0, this.width, this.height);
		gl.clearBufferfv(gl.COLOR, 0, [1e30, 0, 0, 0]);
		gl.clearDepth(this.farDepth);
		gl.clear(gl.DEPTH_BUFFER_BIT);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(this.nearer);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		this.use(f.dist, camera, false);
		gl.uniform3fv(gl.getUniformLocation(f.dist.program, "eye"), camera.eye);
		this.solids();
		// Each cell the farthest over its pixels.
		gl.bindFramebuffer(gl.FRAMEBUFFER, f.cellFbo);
		gl.viewport(0, 0, cols, rows);
		gl.disable(gl.DEPTH_TEST);
		gl.useProgram(f.cells);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, f.distTex);
		gl.uniform1i(gl.getUniformLocation(f.cells, "dist"), 0);
		gl.uniform4f(f.cellsSize, this.width, this.height, cols, rows);
		gl.bindVertexArray(f.vao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, f.pbo);
		gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.FLOAT, 0);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
		if (fence) f.pending = { fence, vp: this.cullView.vp, eye: this.cullView.eye, cols, rows };
		gl.enable(gl.DEPTH_TEST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
	}

	private count(draws: { indexCount: number; count: number }[]): void {
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
	private cull(
		camera: Camera,
		draws: readonly { chunks?: Chunk[]; count: number; indexCount: number }[],
	): void {
		this.runs.clear();
		const passes = passesOf(this.render.features);
		const distance = this.quality.distance;
		if (!passes.frustum && !passes.occlusion && distance === null) {
			this.culled = null;
			this.occlusionStale = false;
			return;
		}
		const vp = multiply(
			perspective(
				camera.fovY ?? FOV,
				this.width / this.height,
				camera.near,
				camera.far,
				true,
				true,
			),
			lookAt(camera.eye, camera.at),
		);
		const planes = sidePlanes(vp);
		this.pollFar();
		// Occlusion's image is made only where a draw is tested against it (see
		// occlusionTests), and not while the eye moves, which leaves it unusable.
		this.eyeMoving = this.eyes.moved(camera.eye);
		this.occludable =
			passes.occlusion && draws.some((d) => d.chunks && occlusionTests(d.indexCount));
		const depth =
			this.occludable && depthFits(this.depthImage, camera.eye) ? this.depthImage : null;
		this.cullView = { vp, eye: [...camera.eye] };
		// Drawn with another view's depth: draw again once this view's arrives.
		this.occlusionStale = this.occludable && !sameView(depth?.viewProj, vp);
		// Past the quality level's render distance nothing is drawn, as in Studio.
		const seen = (min: readonly number[], max: readonly number[], occlude = true) =>
			(distance === null || !boxBeyond(camera.eye, min, max, distance)) &&
			(!passes.frustum || boxInView(planes, min, max)) &&
			!(occlude && depth && boxHidden(depth, min, max));
		let drawn = 0;
		let of = 0;
		for (const draw of draws) {
			of += draw.count;
			if (!draw.chunks) {
				drawn += draw.count;
				continue;
			}
			// Only a shape of many triangles is tested for occlusion; the rest keep their runs whole.
			const occlude = occlusionTests(draw.indexCount);
			const runs = visibleRuns(draw.chunks, (c) => seen(c.min, c.max, occlude));
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

	/**
	 * Draws a draw's runs, or all of it: WebGL2 has no first instance to start
	 * a draw at, so each run points the instance attributes `first` rows on,
	 * and they are pointed back after.
	 */
	private drawRuns(
		vao: WebGLVertexArrayObject,
		instances: WebGLBuffer,
		key: object,
		mode: number,
		indexCount: number,
		type: number,
		count: number,
	): void {
		const gl = this.gl;
		gl.bindVertexArray(vao);
		const runs = this.runs.get(key);
		if (!runs) {
			gl.drawElementsInstanced(mode, indexCount, type, 0, count);
			this.tally.draws++;
			return;
		}
		if (runs.length === 0) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, instances);
		for (let i = 0; i < runs.length; i += 2) {
			this.pointInstances(runs[i]);
			gl.drawElementsInstanced(mode, indexCount, type, 0, runs[i + 1]);
		}
		this.pointInstances(0);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		this.tally.draws += runs.length / 2;
	}

	/** The bound VAO's instance attributes, `first` rows into the bound buffer: as vao() sets them. */
	private pointInstances(first: number): void {
		const gl = this.gl;
		const stride = SCENE_STRIDE * 4;
		const base = first * stride;
		for (let i = 0; i < 4; i++)
			gl.vertexAttribPointer(2 + i, 3, gl.FLOAT, false, stride, base + i * 12);
		gl.vertexAttribPointer(6, 4, gl.UNSIGNED_BYTE, true, stride, base + 48);
		gl.vertexAttribIPointer(7, 1, gl.UNSIGNED_INT, stride, base + 52);
		gl.vertexAttribIPointer(8, 1, gl.UNSIGNED_INT, stride, base + 56);
	}

	/** Wireframe only: each draw's edges, found the first time they are asked for. */
	private wireProgram?: Program;
	private edgeCache = new WeakMap<object, Uint32Array>();
	private drawWires(
		camera: Camera,
		draws: { count: number; indexCount: number; wire: WireSource }[],
	): void {
		const gl = this.gl;
		this.wireProgram ??= this.link(VS, FS_WIRE);
		this.use(this.wireProgram, camera, false);
		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		for (const d of draws) {
			const w = d.wire;
			if (!w.edges) {
				let found = this.edgeCache.get(w.mesh);
				if (!found) {
					found = featureEdges(w.mesh);
					this.edgeCache.set(w.mesh, found);
				}
				// Made with no VAO bound, so none takes its index buffer.
				gl.bindVertexArray(null);
				const eb = this.buffer(gl.ELEMENT_ARRAY_BUFFER, found);
				this.sceneBuffers.push(eb);
				w.edges = { vao: this.vao(w.vertices, w.instances, eb), count: found.length };
			}
			if (w.edges.count === 0) continue;
			this.drawRuns(w.edges.vao, w.instances, d, gl.LINES, w.edges.count, gl.UNSIGNED_INT, d.count);
		}
		gl.bindVertexArray(null);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		this.count(draws);
	}
	private glowTex: WebGLTexture[] = [];
	private glowFbo: WebGLFramebuffer[] = [];
	private glowSize: [number, number] = [0, 0];
	private edgeMesh!: { vertices: WebGLBuffer; indices: WebGLBuffer; count: number };
	private selection: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number } | null =
		null;
	private pickFbo!: WebGLFramebuffer;
	private pickColour!: WebGLRenderbuffer;
	private pickDepth!: WebGLRenderbuffer;
	private width = 1;
	private height = 1;

	private canvas: HTMLCanvasElement | null = null;
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

	async init(
		canvas: HTMLCanvasElement,
		scene: PlaceScene,
		progress?: (shaders: number) => void,
	): Promise<void> {
		this.canvas = canvas;
		const gl = canvas.getContext("webgl2", {
			antialias: this.samples === 4,
			powerPreference: "high-performance",
		});
		if (!gl) throw new Error("no WebGL2");
		this.gl = gl;
		// Before anything is made, so all of it is counted.
		trackWebGl2(gl, this.memory);
		this.nearer = gl.LESS;
		this.nearerOrEqual = gl.LEQUAL;
		const clip = gl.getExtension("EXT_clip_control") as ClipControl | null;
		if (clip) {
			clip.clipControlEXT(clip.LOWER_LEFT_EXT, clip.ZERO_TO_ONE_EXT);
			this.clipControl = clip;
			this.nearer = gl.GREATER;
			this.nearerOrEqual = gl.GEQUAL;
			this.farDepth = 0;
		}
		await this.linkAhead(progress);
		this.main = this.link(VS, FS);
		// The reflection cube's faces: the same shading, without reading the cube.
		this.reflProgram = this.link(
			VS,
			FS.replace("#version 300 es\n", "#version 300 es\n#define REFL_PASS\n"),
		);
		// The half-size pass: the lights alone, at the pass's pixels.
		this.lampProgram = this.link(
			VS,
			FS.replace("#version 300 es\n", "#version 300 es\n#define LAMP_PASS\n"),
		);
		this.lampAble =
			gl.getExtension("EXT_color_buffer_float") !== null &&
			(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) as number) >= 28;
		this.makeReflections();
		this.makeAntialias();
		if (clip) this.pre = this.link(VS, FS_DEPTH);
		// The material table: the same for every frame, so set once.
		gl.useProgram(this.main.program);
		gl.uniform4fv(gl.getUniformLocation(this.main.program, "M[0]"), materialBlock());
		// The material textures, on unit 1 for good: the glow's passes use unit 0.
		gl.uniform1i(gl.getUniformLocation(this.main.program, "looks"), 1);
		for (const prog of [this.main, this.reflProgram, this.lampProgram]) {
			gl.useProgram(prog.program);
			gl.uniform4fv(gl.getUniformLocation(prog.program, "M[0]"), materialBlock());
			gl.uniform1i(gl.getUniformLocation(prog.program, "looks"), 1);
			// The Sky's images stay on unit 4 from the sky's pass; the cube on 14.
			gl.uniform1i(gl.getUniformLocation(prog.program, "reflSky"), 4);
			gl.uniform1i(gl.getUniformLocation(prog.program, "reflCube"), 14);
		}
		gl.useProgram(this.main.program);
		this.makeLooks(1);
		this.ids = this.link(VS, FS_ID);
		this.over = this.link(VS_OVER, FS_OVER);
		this.skyProgram = this.link(VS_SKY, FS_SKY);
		gl.useProgram(this.skyProgram.program);
		gl.uniform1i(gl.getUniformLocation(this.skyProgram.program, "skyImages"), 4);
		gl.uniform1i(gl.getUniformLocation(this.skyProgram.program, "sunImage"), 5);
		this.sunTexture = gl.createTexture()!;
		this.setSunImage(null);
		this.skyImages = gl.createTexture()!;
		this.setSky(null);
		this.imageProgram = this.link(VS_IMAGE, FS_IMAGE);
		this.effects = new GlEffects({
			gl,
			reversed: this.clipControl !== null,
			nearer: this.nearer,
			imageTexture: (asset) => this.imageTextures.get(asset),
		});
		gl.useProgram(this.imageProgram.program);
		gl.uniform1i(gl.getUniformLocation(this.imageProgram.program, "image"), 2);
		this.glowProgram = this.link(VS_GLOW, FS_GLOW);
		this.makeSkyMaps();
		this.makeCascades();
		this.setLights(undefined);
		gl.useProgram(this.glowProgram.program);
		gl.uniform4fv(gl.getUniformLocation(this.glowProgram.program, "M[0]"), materialBlock());
		gl.uniform1i(gl.getUniformLocation(this.glowProgram.program, "looks"), 1);
		this.blurProgram = this.link(VS_FULL, FS_BLUR);
		this.downProgram = this.link(VS_FULL, FS_DOWN);
		this.compositeProgram = this.link(VS_FULL, FS_COMPOSITE);
		gl.useProgram(this.compositeProgram.program);
		gl.uniform1i(gl.getUniformLocation(this.compositeProgram.program, "tex"), 0);
		gl.uniform1i(gl.getUniformLocation(this.compositeProgram.program, "frame"), 3);
		gl.uniform1i(gl.getUniformLocation(this.compositeProgram.program, "wide"), 11);
		this.sceneFbo = gl.createFramebuffer()!;
		this.sceneColour = gl.createRenderbuffer()!;
		this.sceneDepth = gl.createRenderbuffer()!;
		this.frameFbo = gl.createFramebuffer()!;
		this.frameTex = gl.createTexture()!;
		this.acrossFbo = gl.createFramebuffer()!;
		this.acrossTex = gl.createTexture()!;
		// Three half the view's size; the last two a quarter, for the wide blur (see sizeGlow).
		this.glowTex = Array.from({ length: 5 }, () => gl.createTexture()!);
		this.glowFbo = Array.from({ length: 5 }, () => gl.createFramebuffer()!);
		this.setScene(scene);
		for (const kind of HANDLE_KINDS) {
			const m = handleMesh(kind);
			this.handleMeshes.push({
				kind,
				vertices: this.buffer(gl.ARRAY_BUFFER, m.vertices),
				indices: this.buffer(gl.ELEMENT_ARRAY_BUFFER, m.indices),
				indexCount: m.indices.length,
			});
		}
		const e = boxEdges();
		this.edgeMesh = {
			vertices: this.buffer(gl.ARRAY_BUFFER, e.vertices),
			indices: this.buffer(gl.ELEMENT_ARRAY_BUFFER, e.indices),
			count: e.indices.length,
		};
		this.pickFbo = gl.createFramebuffer()!;
		this.pickColour = gl.createRenderbuffer()!;
		this.pickDepth = gl.createRenderbuffer()!;
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(this.nearer);
		gl.enable(gl.CULL_FACE);
		this.resize(canvas.width, canvas.height);
		// Every program linked, ahead or here.
		progress?.(1);
	}

	// -- the light grid, as WebGpuView's: see GRID_READ and FS_GRID ---------------------

	/** The setting, Automatic resolved against the place's style: see autoLightGrid. */
	private gridSetting: number | null | "auto" = null;
	/** The finest cell, in studs; null, off. */
	private gridCell: number | null = null;
	/** The style the grid was filled for: its light falls as Soft's or Realistic's. */
	private gridSoft = false;
	/**
	 * Whether this device can draw the grid: its cells are half floats, which
	 * WebGL2 draws into only with EXT_color_buffer_float, and it needs texture
	 * units 22 to 24. Where it cannot, the grid stays off and every light is
	 * worked out at each pixel.
	 */
	private gridAble: boolean | null = null;
	private gridTex: [WebGLTexture, WebGLTexture] | null = null;
	private gridBlank: WebGLTexture | null = null;
	private gridFbo: WebGLFramebuffer | null = null;
	private gridVao: WebGLVertexArrayObject | null = null;
	private gridProg: Program | null = null;
	private gridFill: Record<
		"size" | "lo" | "count" | "occ" | "occTex",
		WebGLUniformLocation | null
	> | null = null;
	/** Where each cascade stands, its lowest cell in whole cells; null, not yet filled. */
	private gridOrigins: (number[] | null)[] = [];
	/** The lights or their switches changed: every cascade filled again. */
	private gridStale = true;
	/** gridC's cascades, then gridInfo: see writeGridUniform. */
	private gridBlock = new Float32Array(4 * (LIGHT_GRID_CASCADES + 1));
	private gridLocations = new Map<
		WebGLProgram,
		Record<"a" | "b" | "c" | "info", WebGLUniformLocation | null>
	>();
	/** Whether the place has any PointLight, SpotLight or SurfaceLight: see setLights. */
	private hasLights = false;
	/** What the place's parts fill, built when the grid first needs it: see occupancy.ts. */
	private occ: Occupancy | null = null;
	/** The cells round the finest cascade, on unit 24, wrapped round. */
	private occTex: WebGLTexture | null = null;
	/** The occupancy window's lowest cell; null, to be uploaded whole. */
	private occAt: number[] | null = null;
	private occBuilding = false;
	private redrawn = { probeFaces: 0, nearMaps: 0, sunMaps: 0, lightGrid: 0 };

	redraws(): { probeFaces: number; nearMaps: number; sunMaps: number; lightGrid: number } {
		return { ...this.redrawn };
	}

	setLightGrid(setting: number | null | "auto"): void {
		this.gridSetting = setting;
		this.applyLightGrid();
	}

	/** The grid the setting and the place's style come to, and whether its light is flat. */
	private applyLightGrid(): void {
		const soft = this.lighting?.soft === true;
		if (soft !== this.gridSoft) {
			this.gridSoft = soft;
			this.gridStale = true;
		}
		const gl = this.gl;
		let cell = autoLightGrid(this.gridSetting, soft);
		if (gl && cell !== null) {
			this.gridAble ??=
				gl.getExtension("EXT_color_buffer_float") !== null &&
				gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) >= 25;
			if (!this.gridAble) cell = null;
		}
		if (cell === this.gridCell || !gl) {
			this.writeGridUniform();
			return;
		}
		this.gridCell = cell;
		this.gridOrigins = [];
		this.gridStale = true;
		if (cell !== null && !this.gridTex) {
			const make = (unit: number) => {
				const t = gl.createTexture()!;
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_3D, t);
				gl.texStorage3D(
					gl.TEXTURE_3D,
					1,
					gl.RGBA16F,
					LIGHT_GRID_CELLS,
					LIGHT_GRID_CELLS,
					LIGHT_GRID_CELLS * LIGHT_GRID_CASCADES,
				);
				gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				// Repeats across, so the grid wraps round; up and down, gridLight blends itself.
				gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
				gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
				gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
				return t;
			};
			this.gridTex = [make(22), make(23)];
			gl.activeTexture(gl.TEXTURE0);
		}
		this.writeGridUniform();
		this.onRedraw?.();
	}

	/** Units 22 and 23 hold the grid, or a blank while there is none, so the place's shader always reads a texture. */
	private gridUnits(): void {
		if (this.gridTex || this.gridBlank) return;
		const gl = this.gl;
		this.gridBlank = gl.createTexture()!;
		for (const unit of [22, 23]) {
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_3D, this.gridBlank);
		}
		gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 1, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.activeTexture(gl.TEXTURE0);
	}

	private gridAt(program: WebGLProgram) {
		let at = this.gridLocations.get(program);
		if (!at) {
			const gl = this.gl;
			at = {
				a: gl.getUniformLocation(program, "gridA"),
				b: gl.getUniformLocation(program, "gridB"),
				c: gl.getUniformLocation(program, "gridC"),
				info: gl.getUniformLocation(program, "gridInfo"),
			};
			this.gridLocations.set(program, at);
		}
		return at;
	}

	/** Where the cascades stand, and whether the grid is read: only once each is filled. */
	private writeGridUniform(): void {
		const block = this.gridBlock;
		block.fill(0);
		const cell = this.gridCell;
		let filled = cell !== null && this.hasLights && this.gridTex !== null;
		for (let k = 0; k < LIGHT_GRID_CASCADES; k++) {
			const at = this.gridOrigins[k];
			if (!at || cell === null) {
				filled = false;
				continue;
			}
			const size = cell * 2 ** k;
			block.set([...at.map((c) => c * size), size], k * 4);
		}
		block[LIGHT_GRID_CASCADES * 4] = filled ? 1 : 0;
		block[LIGHT_GRID_CASCADES * 4 + 1] = this.lighting?.soft ? 1 : 0;
	}

	/**
	 * The occupancy window round the finest cascade, its lowest cell at `at`:
	 * whole, or only the slabs it newly takes in (occupancyWrites).
	 */
	private syncOccupancy(at: number[]): void {
		const gl = this.gl;
		const n = OCC_SIZE;
		if (!this.occTex) {
			this.occTex = gl.createTexture()!;
			gl.activeTexture(gl.TEXTURE24);
			gl.bindTexture(gl.TEXTURE_3D, this.occTex);
			gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, n, n, n);
			gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.activeTexture(gl.TEXTURE0);
		}
		// Built in a task of its own, never inside a frame: a large place's
		// parts take a while. The finest cascade is filled again with it.
		if (!this.occ) {
			const scene = this.scene;
			if (scene && !this.occBuilding) {
				this.occBuilding = true;
				setTimeout(() => {
					this.occBuilding = false;
					if (this.scene !== scene) return;
					this.occ = Occupancy.fromScene(scene);
					this.occAt = null;
					this.gridOrigins[0] = null;
					this.onRedraw?.();
				}, 0);
			}
			return;
		}
		gl.activeTexture(gl.TEXTURE24);
		gl.bindTexture(gl.TEXTURE_3D, this.occTex);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		for (const piece of occupancyWrites(this.occ, this.occAt, at))
			gl.texSubImage3D(
				gl.TEXTURE_3D,
				0,
				piece.to[0],
				piece.to[1],
				piece.to[2],
				piece.size[0],
				piece.size[1],
				piece.size[2],
				gl.RED,
				gl.UNSIGNED_BYTE,
				piece.bytes,
			);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		gl.activeTexture(gl.TEXTURE0);
		this.occAt = [...at];
	}

	/**
	 * The light grid's cells that are due, as WebGpuView's fillLightGrid:
	 * every cascade when the lights or their switches changed; otherwise only
	 * the cells a cascade newly takes in as the eye moves (lightGridMove), and
	 * a whole cascade when the eye jumps past it, one a frame and only where
	 * `wholeAllowed`, the rest after. Whether any were filled.
	 */
	private fillLightGrid(camera: Camera, wholeAllowed: boolean): boolean {
		const cell = this.gridCell;
		if (cell === null || !this.gridTex || !this.hasLights) return false;
		const gl = this.gl;
		const stale = this.gridStale;
		this.gridStale = false;
		const jobs: { k: number; region: LightGridRegion }[] = [];
		let whole = 0;
		for (let k = 0; k < LIGHT_GRID_CASCADES; k++) {
			const was = stale ? null : (this.gridOrigins[k] ?? null);
			const move = lightGridMove(camera.eye, cell * 2 ** k, was);
			if (move.fill.length === 0) continue;
			const all = move.fill[0].count.every((c) => c === LIGHT_GRID_CELLS);
			if (all && was && (whole > 0 || !wholeAllowed)) {
				this.onRedraw?.();
				continue;
			}
			if (all) whole++;
			this.gridOrigins[k] = move.origin;
			for (const region of move.fill) jobs.push({ k, region });
		}
		if (jobs.length === 0) return false;
		// What parts fill round the finest cascade, before its cells are filled.
		const finest = this.gridOrigins[0];
		const occAt = finest
			? [finest[0] - OCC_MARGIN, finest[1] - OCC_MARGIN, finest[2] - OCC_MARGIN]
			: null;
		if (occAt) this.syncOccupancy(occAt);
		if (!this.gridProg) {
			this.gridProg = this.link(VS_CELL, FS_GRID);
			this.gridFbo = gl.createFramebuffer();
			this.gridVao = gl.createVertexArray();
			const at = (name: string) => gl.getUniformLocation(this.gridProg!.program, name);
			this.gridFill = {
				size: at("gSize"),
				lo: at("gLo"),
				count: at("gCount"),
				occ: at("gOcc"),
				occTex: at("occ"),
			};
		}
		const u = this.gridFill!;
		this.use(this.gridProg, camera, false);
		// The lights' units: use sets them only beside the sky's maps, which this does not read.
		const sky = this.skyAt(this.gridProg.program);
		gl.uniform1i(sky.lightData, 7);
		gl.uniform1i(sky.lightTable, 8);
		gl.uniform1i(sky.lightIndex, 9);
		gl.uniform1i(u.occTex, 24);
		gl.activeTexture(gl.TEXTURE24);
		gl.bindTexture(gl.TEXTURE_3D, this.occTex);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFbo);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
		gl.viewport(0, 0, LIGHT_GRID_CELLS, LIGHT_GRID_CELLS);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		gl.bindVertexArray(this.gridVao);
		const soft = this.lighting?.soft ? 1 : 0;
		const n = LIGHT_GRID_CELLS;
		for (const { k, region } of jobs) {
			const size = cell * 2 ** k;
			gl.uniform4f(u.lo, region.min[0], region.min[1], region.min[2], 0);
			gl.uniform4f(u.count, region.count[0], region.count[1], region.count[2], 0);
			// Blocking and what each cell keeps: the finest cascade alone.
			const blocking = k === 0 && occAt && this.occ ? 1 : 0;
			gl.uniform4f(u.occ, occAt?.[0] ?? 0, occAt?.[1] ?? 0, occAt?.[2] ?? 0, blocking);
			for (let y = 0; y < region.count[1]; y++) {
				const up = region.min[1] + y;
				const layer = (((up % n) + n) % n) + k * n;
				gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.gridTex[0], 0, layer);
				gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, this.gridTex[1], 0, layer);
				gl.uniform4f(u.size, size, k, soft, up);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			}
			this.redrawn.lightGrid += region.count[0] * region.count[1] * region.count[2];
		}
		gl.bindVertexArray(null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
		gl.enable(gl.DEPTH_TEST);
		this.writeGridUniform();
		return true;
	}

	setLighting(lighting: LightingParams): void {
		this.lighting = lighting;
		this.reflStale();
		this.applyLightGrid();
		const sun = lighting.sun.join(",");
		if (sun !== this.sunKey) {
			this.sunKey = sun;
			this.sunDirty = true;
		}
	}

	setScene(scene: PlaceScene, moving = false): void {
		const gl = this.gl;
		for (const d of [...this.draws, ...this.clear, ...this.glass]) {
			gl.deleteVertexArray(d.vao);
			if (d.wire.edges) gl.deleteVertexArray(d.wire.edges.vao);
		}
		for (const b of this.sceneBuffers) gl.deleteBuffer(b);
		this.scene = scene;
		// The sky's maps again only when the parts moved, not for an edit to Lighting,
		// and not while a drag is moving them: once, when it is let go.
		const key = sceneFingerprint(scene);
		if (!moving && key !== this.skyKey) {
			this.skyKey = key;
			this.skyDirty = true;
			this.box = sceneBox(scene);
			// What parts fill, again, and the finest cascade with it: not while a drag moves them.
			this.occ = null;
			this.occAt = null;
			this.gridOrigins[0] = null;
		}
		this.setLights(scene.lights);
		this.setImages(scene);
		this.effects?.setEffects(scene.effects);
		this.draws = [];
		this.clear = [];
		this.glass = [];
		this.clearEye = null;
		this.glowing = sceneGlows(scene);
		this.sceneBuffers = [];
		const sets = seeThroughSets(scene, this.glassHides);
		type Rows = { data: Float32Array; count: number };
		const none: Rows = { data: new Float32Array(0), count: 0 };
		const groups: {
			mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array };
			rows: Record<"solid" | "clear" | "glass", Rows>;
		}[] = [];
		for (const kind of SCENE_KINDS) {
			if (kind !== "mesh") {
				groups.push({
					mesh: meshFor(kind),
					rows: { solid: scene.kinds[kind], clear: sets.clear[kind], glass: sets.glass[kind] },
				});
				continue;
			}
			// A MeshPart or FileMesh whose mesh is here draws it; the rest, their box.
			const ready = (slot: number) => this.meshes.has(slot);
			const solid = splitByMesh(scene.kinds.mesh, ready);
			const clear = splitByMesh(sets.clear.mesh, ready);
			const glass = splitByMesh(sets.glass.mesh, ready);
			groups.push({
				mesh: meshFor("mesh"),
				rows: { solid: solid.rest, clear: clear.rest, glass: glass.rest },
			});
			for (const [slot, mesh] of this.meshes)
				groups.push({
					mesh,
					rows: {
						solid: solid.meshes.get(slot) ?? none,
						clear: clear.meshes.get(slot) ?? none,
						glass: glass.meshes.get(slot) ?? none,
					},
				});
		}
		for (const { mesh, rows } of groups) {
			const type = mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
			for (const set of ["solid", "clear", "glass"] as const) {
				const { data, count } = rows[set];
				const seeThrough = set === "clear";
				if (count === 0) continue;
				const vb = this.buffer(gl.ARRAY_BUFFER, mesh.vertices);
				const eb = this.buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
				// The solid parts sorted into chunks of nearby parts, for culling.
				// Glass too; the see-through parts keep their order, and are culled one by one.
				const chunked = set !== "clear" ? chunkRows(data, count) : null;
				const ib = this.buffer(gl.ARRAY_BUFFER, chunked ? chunked.data : data);
				this.sceneBuffers.push(vb, eb, ib);
				const draw = {
					vao: this.vao(vb, ib, eb),
					indexCount: mesh.indices.length,
					type,
					count,
					wire: { mesh, vertices: vb, instances: ib },
					chunks: chunked?.chunks,
				};
				if (seeThrough)
					this.clear.push({
						...draw,
						instances: ib,
						source: data,
						sorted: new Float32Array(data.length),
					});
				else if (set === "glass") this.glass.push(draw);
				else this.draws.push(draw);
			}
		}
	}

	/** The see-through parts sorted again when the camera has moved. */
	private sortClear(eye: number[]): void {
		const was = this.clearEye;
		if (was && Math.hypot(eye[0] - was[0], eye[1] - was[1], eye[2] - was[2]) < 0.01) return;
		this.clearEye = [...eye];
		const gl = this.gl;
		for (const c of this.clear) {
			backToFront(c.source, c.count, eye, c.sorted);
			gl.bindBuffer(gl.ARRAY_BUFFER, c.instances);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, c.sorted);
		}
	}

	setHandles(handles: Handles): void {
		const gl = this.gl;
		for (const h of this.handleDraws) {
			gl.deleteVertexArray(h.vao);
			gl.deleteBuffer(h.buffer);
		}
		this.handleDraws = [];
		for (const m of this.handleMeshes) {
			const data = handles[m.kind];
			const count = data.length / SCENE_STRIDE;
			if (count === 0) continue;
			const buffer = this.buffer(gl.ARRAY_BUFFER, data);
			this.handleDraws.push({
				vao: this.vao(m.vertices, buffer, m.indices),
				buffer,
				indexCount: m.indexCount,
				count,
			});
		}
	}

	setOverlay(lines: Float32Array): void {
		const gl = this.gl;
		if (this.overlay) {
			gl.deleteVertexArray(this.overlay.vao);
			gl.deleteBuffer(this.overlay.buffer);
		}
		const count = lines.length / 6;
		if (count === 0) {
			this.overlay = null;
			return;
		}
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		const buffer = this.buffer(gl.ARRAY_BUFFER, lines);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
		gl.bindVertexArray(null);
		this.overlay = { vao, buffer, count };
	}

	private buffer(target: number, data: ArrayBufferView): WebGLBuffer {
		const gl = this.gl;
		const b = gl.createBuffer()!;
		gl.bindBuffer(target, b);
		gl.bufferData(target, data, gl.STATIC_DRAW);
		return b;
	}

	private vao(
		vertices: WebGLBuffer,
		instances: WebGLBuffer,
		indices: WebGLBuffer,
	): WebGLVertexArrayObject {
		const gl = this.gl;
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
		gl.bindBuffer(gl.ARRAY_BUFFER, instances);
		const stride = SCENE_STRIDE * 4;
		for (let i = 0; i < 4; i++) {
			gl.enableVertexAttribArray(2 + i);
			gl.vertexAttribPointer(2 + i, 3, gl.FLOAT, false, stride, i * 12);
			gl.vertexAttribDivisor(2 + i, 1);
		}
		gl.enableVertexAttribArray(6);
		gl.vertexAttribPointer(6, 4, gl.UNSIGNED_BYTE, true, stride, 48);
		gl.vertexAttribDivisor(6, 1);
		gl.enableVertexAttribArray(7);
		gl.vertexAttribIPointer(7, 1, gl.UNSIGNED_INT, stride, 52);
		gl.vertexAttribDivisor(7, 1);
		gl.enableVertexAttribArray(8);
		gl.vertexAttribIPointer(8, 1, gl.UNSIGNED_INT, stride, 56);
		gl.vertexAttribDivisor(8, 1);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
		gl.bindVertexArray(null);
		return vao;
	}

	/**
	 * The programs init links, linked side by side before it starts where the
	 * browser can (KHR_parallel_shader_compile), and waited for between tasks:
	 * asking a program whether it linked holds the page until the driver has
	 * compiled it, which is most of a second for these. A pair not listed
	 * links when it is asked for, as every one did before.
	 */
	private static readonly PROGRAMS: readonly (readonly [string, string])[] = [
		[VS, FS],
		[VS, FS_ID],
		[VS_OVER, FS_OVER],
		[VS_SKY, FS_SKY],
		[VS_IMAGE, FS_IMAGE],
		[VS_GLOW, FS_GLOW],
		[VS_FULL, FS_BLUR],
		[VS_FULL, FS_DOWN],
		[VS_FULL, FS_COMPOSITE],
		[VS_DEPTH, FS_DEPTH],
	];
	private linked = new Map<string, { program: WebGLProgram; shaders: WebGLShader[] }>();

	/** A shader's source with LOG_DEPTH defined where depth is not reversed. */
	private source(src: string): string {
		return this.clipControl
			? src
			: src.replace("#version 300 es\n", "#version 300 es\n#define LOG_DEPTH\n");
	}

	/** `progress` hears the share linked as it polls, or 0 where they link one by one in init. */
	private async linkAhead(progress?: (shaders: number) => void): Promise<void> {
		const gl = this.gl;
		const parallel = gl.getExtension("KHR_parallel_shader_compile");
		if (!parallel) {
			progress?.(0);
			return;
		}
		const programs = [...WebGl2View.PROGRAMS];
		if (this.clipControl) programs.push([VS, FS_DEPTH]);
		for (const [vs, fs] of programs) {
			const program = gl.createProgram()!;
			const shaders = (
				[
					[gl.VERTEX_SHADER, vs],
					[gl.FRAGMENT_SHADER, fs],
				] as const
			).map(([type, src]) => {
				const s = gl.createShader(type)!;
				gl.shaderSource(s, this.source(src));
				gl.compileShader(s);
				gl.attachShader(program, s);
				return s;
			});
			gl.linkProgram(program);
			this.linked.set(`${vs}\0${fs}`, { program, shaders });
		}
		const done = () =>
			[...this.linked.values()].filter(({ program }) =>
				gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR),
			).length;
		for (let n = done(); ; n = done()) {
			progress?.(n / this.linked.size);
			if (n === this.linked.size) break;
			await new Promise((resolve) => setTimeout(resolve, 8));
		}
	}

	private link(vs: string, fs: string): Program {
		const gl = this.gl;
		const compile = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, this.source(src));
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
				throw new Error(gl.getShaderInfoLog(s) ?? "shader");
			return s;
		};
		const ahead = this.linked.get(`${vs}\0${fs}`);
		this.linked.delete(`${vs}\0${fs}`);
		const program = ahead?.program ?? gl.createProgram()!;
		if (!ahead) {
			gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
			gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
			gl.linkProgram(program);
		}
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			for (const s of ahead?.shaders ?? [])
				if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
					throw new Error(gl.getShaderInfoLog(s) ?? "shader");
			throw new Error(gl.getProgramInfoLog(program) ?? "link");
		}
		const at = (n: string) => gl.getUniformLocation(program, n);
		return {
			program,
			viewProj: at("viewProj"),
			sun: at("sun"),
			outline: at("outline"),
			select: at("select"),
			handle: at("handle"),
			alpha: at("alpha"),
			block: at("L[0]") ?? at("L"),
			invViewProj: at("invViewProj"),
			screen: at("screen"),
		};
	}

	/** Float depth where it is reversed, which keeps its precision out to the horizon. */
	private depthFormat(): number {
		return this.clipControl ? this.gl.DEPTH_COMPONENT32F : this.gl.DEPTH_COMPONENT24;
	}

	/**
	 * The sky's and the sun's maps keep the usual depth, -1 to 1 with the
	 * nearer less, whatever the view's; `on` false goes back to the view's.
	 */
	private usualDepth(on: boolean): void {
		const clip = this.clipControl;
		if (!clip) return;
		clip.clipControlEXT(
			clip.LOWER_LEFT_EXT,
			on ? clip.NEGATIVE_ONE_TO_ONE_EXT : clip.ZERO_TO_ONE_EXT,
		);
		this.gl.depthFunc(on ? this.gl.LESS : this.nearer);
	}

	/**
	 * Draws' depth alone: by the pre-pass's program where depth is reversed,
	 * by the main one, which writes its log depth, elsewhere.
	 */
	private depthOnly(camera: Camera, draws: Draw[]): void {
		const gl = this.gl;
		this.use(this.pre ?? this.main, camera, false);
		gl.colorMask(false, false, false, false);
		this.solids(draws);
		gl.colorMask(true, true, true, true);
	}

	resize(width: number, height: number): void {
		const gl = this.gl;
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.lampTargets = null;
		this.makeAaTargets();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickColour);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.R32UI, this.width, this.height);
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickDepth);
		gl.renderbufferStorage(gl.RENDERBUFFER, this.depthFormat(), this.width, this.height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.RENDERBUFFER,
			this.pickColour,
		);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.RENDERBUFFER,
			this.pickDepth,
		);
		// The place drawn off screen, antialiased, and resolved into a texture
		// for the glow to be added to.
		const samples = this.drawnSamples();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneColour);
		gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, this.width, this.height);
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepth);
		gl.renderbufferStorageMultisample(
			gl.RENDERBUFFER,
			samples,
			this.depthFormat(),
			this.width,
			this.height,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.RENDERBUFFER,
			this.sceneColour,
		);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.RENDERBUFFER,
			this.sceneDepth,
		);
		gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			this.width,
			this.height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		// Filtered, for the glow's source to be averaged down from it.
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameFbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.frameTex, 0);
		gl.bindTexture(gl.TEXTURE_2D, this.acrossTex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			this.width,
			this.height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.acrossFbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.acrossTex, 0);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.sizeGlow();
	}

	/** The glow's two targets, half the view's size; the first with depth. */
	private sizeGlow(): void {
		const gl = this.gl;
		// A quarter of the view where it is drawn at more pixels than the screen has points.
		const share = this.quality.glowCoarse ? 4 : 2;
		const w = Math.max(1, Math.round(this.width / share));
		const h = Math.max(1, Math.round(this.height / share));
		if (this.glowSize[0] === w && this.glowSize[1] === h) return;
		this.glowSize = [w, h];
		// Half floats where the browser can draw into them, so the blur's long
		// fall does not round into steps; bytes elsewhere.
		const half = gl.getExtension("EXT_color_buffer_float") !== null;
		// The wide blur at a quarter of the view's size, as WebGpuView's sizeGlow.
		const [qw, qh] = quarterOf(w, h);
		this.glowTex.forEach((tex, i) => {
			const [tw, th] = i < 3 ? [w, h] : [qw, qh];
			gl.bindTexture(gl.TEXTURE_2D, tex);
			if (half)
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.HALF_FLOAT, null);
			else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[i]);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		});
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	/**
	 * The place drawn small in the light it gives off, under the see-through
	 * parts and the Decals and Textures that cover it, then blurred both ways.
	 */
	private drawGlow(camera: Camera): void {
		const gl = this.gl;
		const [w, h] = this.glowSize;
		// At the view's size, antialiased as the frame is, so a sliver of Neon
		// through a seam glows by as much of a pixel as it covers.
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
		gl.viewport(0, 0, this.width, this.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		this.use(this.glowProgram, camera, false);
		gl.uniform4fv(gl.getUniformLocation(this.glowProgram.program, "bloom"), this.shape.gate);
		// The pixels a thin Neon part is drawn no thinner than, of the source's size.
		gl.uniform3f(
			gl.getUniformLocation(this.glowProgram.program, "thin"),
			1.5,
			this.width,
			this.height,
		);
		const seen = gl.getUniformLocation(this.glowProgram.program, "seen");
		gl.uniform1f(seen, 0);
		this.solids();
		if (this.glass.length > 0) {
			gl.colorMask(false, false, false, false);
			this.solids(this.glass);
			gl.colorMask(true, true, true, true);
		}
		gl.enable(gl.BLEND);
		// A see-through part leaves what images cover as it is; an image adds to it.
		gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
		gl.depthMask(false);
		if (this.clear.length > 0) {
			gl.uniform1f(seen, 1);
			this.solids(this.clear);
		}
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		this.veilImages(camera);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		// Resolved into the frame's texture, which the place is drawn into after.
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sceneFbo);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.frameFbo);
		const { width: fw, height: fh } = this;
		gl.blitFramebuffer(0, 0, fw, fh, 0, 0, fw, fh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
		gl.viewport(0, 0, w, h);
		gl.activeTexture(gl.TEXTURE0);
		gl.useProgram(this.downProgram.program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[0]);
		gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.enable(gl.DEPTH_TEST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	private brightProgram?: Program;
	/** This frame blooms the whole picture: see draw. */
	private bloomAll = false;

	/**
	 * The glow blurred, once the place is drawn and in frameTex: with `bloom`,
	 * the frame's bright-pass added to Neon's source (0) into 2 first, as
	 * WebGpuView's blurGlow; then narrow across and down into 0, and on across
	 * and down into 2, the wide blur.
	 */
	private blurGlow(bloom: boolean): void {
		const gl = this.gl;
		const [w, h] = this.glowSize;
		gl.viewport(0, 0, w, h);
		gl.disable(gl.DEPTH_TEST);
		let first: 0 | 2 = 0;
		if (bloom) {
			this.brightProgram ??= this.link(VS_FULL, FS_BRIGHT);
			const prog = this.brightProgram.program;
			gl.useProgram(prog);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[2]);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.glowTex[0]);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
			gl.uniform1i(gl.getUniformLocation(prog, "frame"), 0);
			gl.uniform1i(gl.getUniformLocation(prog, "src"), 1);
			const b = this.lighting?.post.bloom;
			gl.uniform4f(
				gl.getUniformLocation(prog, "p"),
				bloomStart(b?.threshold ?? 2),
				0,
				BLOOM_STEEP,
				BLOOM_STRENGTH,
			);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.activeTexture(gl.TEXTURE0);
			first = 2;
		}
		gl.useProgram(this.blurProgram.program);
		const p = gl.getUniformLocation(this.blurProgram.program, "p");
		const spread = glowSpread(h, this.shape);
		const narrow = spread * GLOW_NARROW.width;
		const more = spread * Math.sqrt(GLOW_WIDE.width ** 2 - GLOW_NARROW.width ** 2);
		const [qw, qh] = quarterOf(w, h);
		const moreQ = (more * qh) / h;
		// Narrow at half the view's size; the wide blur's two at a quarter, into 3 and 4.
		for (const [from, into, step, sigma, size] of [
			[first, 1, [1 / w, 0], narrow, [w, h]],
			[1, 0, [0, 1 / h], narrow, [w, h]],
			[0, 3, [1 / qw, 0], moreQ, [qw, qh]],
			[3, 4, [0, 1 / qh], moreQ, [qw, qh]],
		] as const) {
			gl.viewport(0, 0, size[0], size[1]);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[into]);
			gl.bindTexture(gl.TEXTURE_2D, this.glowTex[from]);
			gl.uniform4f(p, step[0], step[1], 0, sigma);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
	}

	/**
	 * The place, drawn off screen, resolved and put on screen with the glow
	 * added; then its depth again, without colour, for the selection to be
	 * hidden behind it.
	 */
	private addGlow(
		camera: Camera,
		post: boolean,
		glowing: boolean,
		postOn: boolean,
		heat: number,
	): void {
		const gl = this.gl;
		const { width: w, height: h } = this;
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sceneFbo);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.frameFbo);
		gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
		if (glowing) this.blurGlow(this.bloomAll);
		gl.viewport(0, 0, w, h);
		gl.disable(gl.DEPTH_TEST);
		// A BlurEffect: the frame blurred across into its spare, and back down into itself.
		const blur = post ? (this.lighting?.post.blur ?? 0) : 0;
		if (blur > 0) {
			const sigma = blurSigma(blur, h);
			gl.useProgram(this.blurProgram.program);
			const p = gl.getUniformLocation(this.blurProgram.program, "p");
			gl.activeTexture(gl.TEXTURE0);
			for (const [from, into, step] of [
				[this.frameTex, this.acrossFbo, [1 / w, 0]],
				[this.acrossTex, this.frameFbo, [0, 1 / h]],
			] as const) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, into);
				gl.bindTexture(gl.TEXTURE_2D, from);
				gl.uniform4f(p, step[0], step[1], 0, sigma);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			}
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
		// As the canvas is each frame, which what is drawn over the place is tested against.
		if (this.outFbo) {
			gl.clearDepth(1);
			gl.clear(gl.DEPTH_BUFFER_BIT);
		}
		gl.useProgram(this.compositeProgram.program);
		const at = (name: string) => gl.getUniformLocation(this.compositeProgram.program, name);
		gl.uniform4f(at("p"), 0, 0, glowing ? this.shape.gain : 0, heat);
		const grade = gradeBlock(this.lighting?.post, postOn);
		gl.uniform4fv(at("grade0"), grade.subarray(0, 4));
		gl.uniform4fv(at("grade1"), grade.subarray(4, 8));
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
		gl.activeTexture(gl.TEXTURE11);
		gl.bindTexture(gl.TEXTURE_2D, this.glowTex[4]);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.glowTex[0]);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE11);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
		gl.enable(gl.DEPTH_TEST);
		gl.clear(gl.DEPTH_BUFFER_BIT);
		if (this.selection && this.hideBehind) this.depthOnly(camera, [...this.draws, ...this.glass]);
	}

	setSelection(boxes: Float32Array): void {
		const gl = this.gl;
		if (this.selection) gl.deleteBuffer(this.selection.buffer);
		const count = boxes.length / SCENE_STRIDE;
		if (count === 0) {
			this.selection = null;
			return;
		}
		const buffer = this.buffer(gl.ARRAY_BUFFER, boxes);
		this.selection = {
			vao: this.vao(this.edgeMesh.vertices, buffer, this.edgeMesh.indices),
			buffer,
			count,
		};
	}

	// -- sky visibility: see skyBlock ------------------------------------------------

	private skyMaps: WebGLTexture | null = null;
	private skyFbo: WebGLFramebuffer | null = null;
	private depthProgram!: Program;
	/** What the shaders read, as skyBlock gives it; all 0, the maps are off. */
	private skyData: Float32Array = new Float32Array(SKY_BLOCK);
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
	/** The place's lights and the grid that finds them, on units 7 to 9: see lightGrid. */
	private lightTextures: WebGLTexture[] = [];

	private setLights(lights: readonly number[] | undefined): void {
		const gl = this.gl;
		// The same lights again, after an edit elsewhere: the grid already holds them.
		const key = fingerprint(lights);
		if (key === this.lightKey && this.lightKey !== -1) return;
		this.lightKey = key;
		this.hasLights = !!lights && lights.length > 0;
		this.gridStale = true;
		this.writeGridUniform();
		for (const t of this.lightTextures) gl.deleteTexture(t);
		const grid = lightGridFor(lights);
		const count = Math.max(1, (lights?.length ?? 0) / LIGHT_STRIDE);
		const data = new Float32Array(count * LIGHT_STRIDE);
		if (lights) data.set(lights);
		const rows = Math.max(1, Math.ceil(grid.index.length / 1024));
		const index = new Uint32Array(rows * 1024);
		index.set(grid.index);
		const make = (
			unit: number,
			internal: number,
			format: number,
			type: number,
			w: number,
			h: number,
			pixels: ArrayBufferView,
		) => {
			const t = gl.createTexture()!;
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, pixels);
			return t;
		};
		this.lightTextures = [
			make(7, gl.RGBA32F, gl.RGBA, gl.FLOAT, 5, count, data),
			make(8, gl.RG32UI, gl.RG_INTEGER, gl.UNSIGNED_INT, 256, 256, grid.table),
			make(9, gl.R32UI, gl.RED_INTEGER, gl.UNSIGNED_INT, 1024, rows, index),
		];
		gl.activeTexture(gl.TEXTURE0);
	}
	private skyLocations = new Map<
		WebGLProgram,
		Record<
			| "views"
			| "info"
			| "near"
			| "nearAt"
			| "maps"
			| "lightData"
			| "lightTable"
			| "lightIndex"
			| "sunMaps"
			| "cells"
			| "cascViews"
			| "cascFar"
			| "cascTexel",
			WebGLUniformLocation | null
		>
	>();

	private skyAt(program: WebGLProgram) {
		let at = this.skyLocations.get(program);
		if (!at) {
			const gl = this.gl;
			at = {
				views: gl.getUniformLocation(program, "skyViews"),
				info: gl.getUniformLocation(program, "skyInfo"),
				near: gl.getUniformLocation(program, "skyNear"),
				nearAt: gl.getUniformLocation(program, "skyNearAt"),
				maps: gl.getUniformLocation(program, "skyMaps"),
				lightData: gl.getUniformLocation(program, "lightData"),
				lightTable: gl.getUniformLocation(program, "lightTable"),
				lightIndex: gl.getUniformLocation(program, "lightIndex"),
				sunMaps: gl.getUniformLocation(program, "sunMaps"),
				cells: gl.getUniformLocation(program, "skyCells"),
				cascViews: gl.getUniformLocation(program, "cascViews"),
				cascFar: gl.getUniformLocation(program, "cascFar"),
				cascTexel: gl.getUniformLocation(program, "cascTexel"),
			};
			this.skyLocations.set(program, at);
		}
		return at;
	}

	private makeSkyMaps(): void {
		const gl = this.gl;
		this.depthProgram = this.link(VS_DEPTH, FS_DEPTH);
		this.skyMaps = gl.createTexture();
		gl.activeTexture(gl.TEXTURE6);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.skyMaps);
		gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT32F, SKY_MAP, SKY_MAP, SKY_LAYERS);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
		gl.activeTexture(gl.TEXTURE0);
		this.skyFbo = gl.createFramebuffer();
	}

	// -- the sun's cascades: see cascadeBlock ----------------------------------------

	private sunMaps: WebGLTexture | null = null;
	/** The cascades last drawn: what the shaders read, and to draw them again only when they moved. */
	private cascadeLast: Float32Array = new Float32Array(CASCADE_BLOCK);
	private cadence = new CascadeCadence();
	/** The place's box, kept with its fingerprint. */
	private box: { min: number[]; max: number[] } | null = null;

	private makeCascades(): void {
		const gl = this.gl;
		this.sunMaps = gl.createTexture();
		gl.activeTexture(gl.TEXTURE10);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.sunMaps);
		gl.texStorage3D(
			gl.TEXTURE_2D_ARRAY,
			1,
			gl.DEPTH_COMPONENT32F,
			this.shadowMap,
			this.shadowMap,
			SUN_CASCADES.length,
		);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
		gl.activeTexture(gl.TEXTURE0);
	}

	/** The sun's cascades for this view, drawn again when they or the parts moved. */
	private drawCascades(camera: Camera, partsMoved: boolean): void {
		// Shadows frozen from the Rendering panel: the maps drawn last are sampled as they are.
		if (this.render.freezeShadows) return;
		const gl = this.gl;
		const l = this.lighting;
		const fits: CascadeFit[] = [];
		const block = cascadeBlock(
			camera,
			this.width / this.height,
			l?.sun ?? [0, 1, 0],
			this.box,
			l?.shadowSoftness ?? 0.2,
			l?.sunShadows ?? true,
			false,
			this.quality,
			this.shadowMap,
			fits,
		);
		// While only the camera moves, only the maps whose slice left them: see CascadeCadence.
		const step = this.cadence.next(block, fits, this.cascadeLast, l?.sun ?? [0, 1, 0], partsMoved);
		if (!step) return;
		const due = step.due;
		this.cascadeLast = step.block;
		if (step.block[SUN_CASCADES.length * 16 + 7] !== 1 || !this.sunMaps) return;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo);
		gl.drawBuffers([gl.NONE]);
		gl.readBuffer(gl.NONE);
		gl.viewport(0, 0, this.shadowMap, this.shadowMap);
		gl.useProgram(this.depthProgram.program);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.clearDepth(1);
		SUN_CASCADES.forEach((_, k) => {
			if (!due[k]) return;
			this.redrawn.sunMaps++;
			gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.sunMaps, 0, k);
			gl.clear(gl.DEPTH_BUFFER_BIT);
			gl.uniformMatrix4fv(
				this.depthProgram.viewProj,
				false,
				step.block.subarray(k * 16, k * 16 + 16),
			);
			this.solids();
		});
		gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, null, 0, 0);
		gl.enable(gl.CULL_FACE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	/** The maps, as WebGpuView's drawSkyMaps: the whole place's, the sun's, the near ones. */
	private drawSkyMaps(
		which: { far: boolean; sun: boolean; near: boolean },
		centre: number[],
	): void {
		// Shadows frozen from the Rendering panel: the maps drawn last are sampled as they are.
		if (this.render.freezeShadows) return;
		const gl = this.gl;
		this.skyDirty = false;
		this.sunDirty = false;
		this.nearCentre = centre;
		if (which.near) this.redrawn.nearMaps++;
		const box = this.scene ? sceneBox(this.scene) : null;
		this.skyData = skyBlock(box, this.lighting?.sun ?? [0, 1, 0], false);
		if (box) nearSkyInto(this.skyData, box, centre, false);
		if (!box || !this.skyMaps) return;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo);
		gl.drawBuffers([gl.NONE]);
		gl.readBuffer(gl.NONE);
		gl.viewport(0, 0, SKY_MAP, SKY_MAP);
		gl.useProgram(this.depthProgram.program);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.clearDepth(1);
		for (let k = 0; k < SKY_LAYERS; k++) {
			const drawn = k < SKY_VIEWS ? which.far : k === SKY_VIEWS ? which.sun : which.near;
			if (!drawn) continue;
			gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.skyMaps, 0, k);
			gl.clear(gl.DEPTH_BUFFER_BIT);
			gl.uniformMatrix4fv(
				this.depthProgram.viewProj,
				false,
				this.skyData.subarray(k * 16, k * 16 + 16),
			);
			this.solids();
		}
		gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, null, 0, 0);
		if (which.near && passesOf(this.render.features).thinParts) this.openNearMaps();
		gl.enable(gl.CULL_FACE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.activeTexture(gl.TEXTURE6);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.skyMaps);
		gl.activeTexture(gl.TEXTURE0);
	}

	/** The near maps' opening, made once: see WebGpuView's makeSkyOpen. Null where floats can't be drawn into. */
	private skyOpen?: {
		fromDepth: WebGLProgram;
		float: WebGLProgram;
		scratch: [WebGLTexture, WebGLTexture];
		fbos: [WebGLFramebuffer, WebGLFramebuffer];
		raw: WebGLSampler;
	} | null;

	private makeSkyOpen(): typeof this.skyOpen {
		const gl = this.gl;
		if (!gl.getExtension("EXT_color_buffer_float")) return null;
		const scratch = [0, 1].map(() => {
			const t = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, SKY_MAP, SKY_MAP);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			return t;
		}) as [WebGLTexture, WebGLTexture];
		gl.bindTexture(gl.TEXTURE_2D, null);
		const fbos = scratch.map((t) => {
			const fbo = gl.createFramebuffer()!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
			return fbo;
		}) as [WebGLFramebuffer, WebGLFramebuffer];
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		// The near maps read as depths, not compared: a sampler of their own.
		const raw = gl.createSampler()!;
		gl.samplerParameteri(raw, gl.TEXTURE_COMPARE_MODE, gl.NONE);
		gl.samplerParameteri(raw, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.samplerParameteri(raw, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		return {
			fromDepth: this.link(VS_FULL, FS_OPEN_DEPTH).program,
			float: this.link(VS_FULL, FS_OPEN_FLOAT).program,
			scratch,
			fbos,
			raw,
		};
	}

	/** Opens the near maps just drawn, as WebGpuView's openNearMaps. */
	private openNearMaps(): void {
		const gl = this.gl;
		if (this.skyOpen === undefined) this.skyOpen = this.makeSkyOpen();
		const o = this.skyOpen;
		if (!o || !this.skyMaps) return;
		const texel = (2 * SKY_NEAR * 1.75) / SKY_MAP;
		const r = Math.max(1, Math.round(SKY_OPEN / 2 / texel));
		const at = (prog: WebGLProgram, name: string) => gl.getUniformLocation(prog, name);
		const func = gl.getParameter(gl.DEPTH_FUNC) as number;
		gl.disable(gl.CULL_FACE);
		gl.viewport(0, 0, SKY_MAP, SKY_MAP);
		for (let k = 0; k < SKY_VIEWS; k++) {
			// The farthest across, from the map's depth, into scratch 0.
			gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbos[0]);
			gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
			gl.disable(gl.DEPTH_TEST);
			gl.useProgram(o.fromDepth);
			gl.activeTexture(gl.TEXTURE12);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.skyMaps);
			gl.bindSampler(12, o.raw);
			gl.uniform1i(at(o.fromDepth, "srcDepth"), 12);
			gl.uniform1i(at(o.fromDepth, "layer"), SKY_NEAR_LAYER + k);
			gl.uniform4f(at(o.fromDepth, "f"), 1, 0, r, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.bindSampler(12, null);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
			// The farthest down, then the nearest across, between the scratch maps.
			gl.useProgram(o.float);
			gl.uniform1i(at(o.float, "srcFloat"), 12);
			for (const [into, from, step] of [
				[1, 0, [0, 1, r, 0]],
				[0, 1, [1, 0, r, 1]],
			] as const) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbos[into]);
				gl.bindTexture(gl.TEXTURE_2D, o.scratch[from]);
				gl.uniform4f(at(o.float, "f"), step[0], step[1], step[2], step[3]);
				gl.uniform1f(at(o.float, "toDepth"), 0);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			}
			// The nearest down, back into the map's depth.
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo);
			gl.drawBuffers([gl.NONE]);
			gl.framebufferTextureLayer(
				gl.FRAMEBUFFER,
				gl.DEPTH_ATTACHMENT,
				this.skyMaps,
				0,
				SKY_NEAR_LAYER + k,
			);
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.ALWAYS);
			gl.depthMask(true);
			gl.bindTexture(gl.TEXTURE_2D, o.scratch[0]);
			gl.uniform4f(at(o.float, "f"), 0, 1, r, 1);
			gl.uniform1f(at(o.float, "toDepth"), 1);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, null, 0, 0);
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
		gl.activeTexture(gl.TEXTURE0);
		gl.depthFunc(func);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo);
	}

	private use(prog: Program, camera: Camera, outline: boolean): void {
		const gl = this.gl;
		gl.useProgram(prog.program);
		const reversed = this.clipControl !== null;
		const projection = (reverse: boolean) =>
			multiply(
				perspective(
					camera.fovY ?? FOV,
					this.width / this.height,
					camera.near,
					camera.far,
					reverse,
					reverse,
				),
				lookAt(camera.eye, camera.at),
			);
		const vp = jitterClip(projection(reversed), this.jitter, this.width, this.height);
		gl.uniformMatrix4fv(prog.viewProj, false, vp);
		const debug = renderDebug(this.render);
		debug[1] = this.lampBit(debug[1]);
		gl.uniform4fv(gl.getUniformLocation(prog.program, "R"), debug);
		gl.uniform1f(gl.getUniformLocation(prog.program, "logFar"), 1 / Math.log2(camera.far + 1));
		// The sky's rays through the usual projection's far plane, the same in either depth.
		if (prog.invViewProj)
			gl.uniformMatrix4fv(prog.invViewProj, false, invert(reversed ? projection(false) : vp));
		if (prog.block)
			gl.uniform4fv(prog.block, lightingBlock(this.lighting, camera.eye, SELECT, HANDLE_ALPHA));
		const sky = this.skyAt(prog.program);
		if (sky.views) {
			gl.uniformMatrix4fv(sky.views, false, this.skyData.subarray(0, 16 * SKY_LAYERS));
			gl.uniform4fv(sky.info, this.skyData.subarray(16 * SKY_LAYERS, 16 * SKY_LAYERS + 4));
			gl.uniform4fv(sky.near, this.skyData.subarray(16 * SKY_LAYERS + 4, 16 * SKY_LAYERS + 8));
			gl.uniform4fv(sky.nearAt, this.skyData.subarray(16 * SKY_LAYERS + 8, 16 * SKY_LAYERS + 12));
			gl.uniform1i(sky.maps, 6);
			gl.uniform1i(sky.lightData, 7);
			gl.uniform1i(sky.lightTable, 8);
			gl.uniform1i(sky.lightIndex, 9);
			gl.uniform1i(sky.sunMaps, 10);
			gl.uniform1i(sky.cells, 13);
			const n = SUN_CASCADES.length * 16;
			gl.uniformMatrix4fv(sky.cascViews, false, this.cascadeLast.subarray(0, n));
			gl.uniform4fv(sky.cascFar, this.cascadeLast.subarray(n, n + 4));
			gl.uniform4fv(sky.cascTexel, this.cascadeLast.subarray(n + 4, n + 8));
		}
		gl.uniform1f(prog.outline, outline ? 1 : 0);
		const band = this.outlineWidth * (this.width / (this.canvas?.clientWidth || this.width));
		gl.uniform3f(prog.screen, this.width, this.height, band);
		gl.uniform3f(
			gl.getUniformLocation(prog.program, "eye"),
			camera.eye[0],
			camera.eye[1],
			camera.eye[2],
		);
		gl.uniform3f(prog.select, SELECT[0], SELECT[1], SELECT[2]);
		gl.uniform1f(prog.handle, 0);
		const grid = this.gridAt(prog.program);
		if (grid.info) gl.uniform4fv(grid.info, this.gridBlock.subarray(4 * LIGHT_GRID_CASCADES));
		if (grid.a) {
			this.gridUnits();
			gl.uniform1i(grid.a, 22);
			gl.uniform1i(grid.b, 23);
			gl.uniform4fv(grid.c, this.gridBlock.subarray(0, 4 * LIGHT_GRID_CASCADES));
		}
		if (prog === this.main) {
			this.lampUnits(prog);
			const c = this.reflCentre ?? camera.eye;
			gl.uniform3f(gl.getUniformLocation(prog.program, "reflCentre"), c[0], c[1], c[2]);
		}
		const reflSky = gl.getUniformLocation(prog.program, "reflSkyOn");
		if (reflSky)
			gl.uniform1f(
				reflSky,
				this.skyOn && passesOf(this.render.features).skyImages
					? this.lighting.skyboxSun
						? 2
						: 1
					: 0,
			);
	}

	private solids(
		draws: {
			vao: WebGLVertexArrayObject;
			indexCount: number;
			type: number;
			count: number;
			wire: WireSource;
		}[] = this.draws,
	): void {
		const gl = this.gl;
		for (const d of draws)
			this.drawRuns(d.vao, d.wire.instances, d, gl.TRIANGLES, d.indexCount, d.type, d.count);
		gl.bindVertexArray(null);
	}

	/** WebGL2's own swap already waits for the GPU, so there is nothing to wait on. */
	settled(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Once the GPU has done everything asked of it so far: a fence, looked at
	 * every millisecond or so. For Automatic's light objects resolution to
	 * time a frame by, as WebGPU's frames are timed by settled; settled itself
	 * stays at once, as everything else here paces by it.
	 */
	gpuDone(): Promise<void> {
		const gl = this.gl;
		const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
		if (!sync) return Promise.resolve();
		gl.flush();
		return new Promise((resolve) => {
			const look = () => {
				const state = gl.clientWaitSync(sync, 0, 0);
				if (state === gl.TIMEOUT_EXPIRED) {
					setTimeout(look, 1);
					return;
				}
				gl.deleteSync(sync);
				resolve();
			};
			look();
		});
	}

	// -- the lamp light at half size: see lampsAt ---------------------------------------

	private lampProgram!: Program;
	/** Float colour targets and the units for them: else light objects stay full. */
	private lampAble = false;
	/** Light objects' resolution: full, the half-size pass not drawn; half or quarter its share. */
	private lampModeNow: "full" | "half" | "quarter" = "full";
	private lampTargets: {
		fbo: WebGLFramebuffer;
		light: WebGLTexture;
		shine: WebGLTexture;
		normal: WebGLTexture;
		depth: WebGLRenderbuffer;
		width: number;
		height: number;
	} | null = null;
	/** A texel of nothing, for the lamp units while the pass is not drawn. */
	private lampBlank: WebGLTexture | null = null;

	setLampMode(mode: "full" | "half" | "quarter"): void {
		if (mode === this.lampModeNow) return;
		this.lampModeNow = mode;
		this.lampTargets = null;
		this.onRedraw?.();
	}

	/** The half-size pass's bit: as the lamp mode says, where the place has lights and the grid is off. */
	private lampBit(bits: number): number {
		const out = bits & ~FEATURE_BIT.halfLamps;
		return this.lampAble && this.lampModeNow !== "full" && this.hasLights && this.gridCell === null
			? out | FEATURE_BIT.halfLamps
			: out;
	}

	/** The half-size pass's step across the render: see halfPassStep. */
	private lampStep(): number {
		return halfPassStep(
			this.lampModeNow === "quarter" ? 4 : 2,
			this.width,
			this.canvas?.clientWidth ?? 0,
		);
	}

	/** The pass's targets, made again when the frame or the mode changed. */
	private makeLampTargets(): NonNullable<WebGl2View["lampTargets"]> {
		const gl = this.gl;
		const was = this.lampTargets;
		const step = this.lampStep();
		const width = Math.max(1, Math.ceil(this.width / step));
		const height = Math.max(1, Math.ceil(this.height / step));
		if (was && was.width === width && was.height === height) return was;
		if (was) {
			for (const t of [was.light, was.shine, was.normal]) gl.deleteTexture(t);
			gl.deleteRenderbuffer(was.depth);
			gl.deleteFramebuffer(was.fbo);
		}
		const texture = (format: number, type: number, base: number) => {
			const t = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, base, type, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			return t;
		};
		const light = texture(gl.RGBA16F, gl.HALF_FLOAT, gl.RGBA);
		const shine = texture(gl.RGBA16F, gl.HALF_FLOAT, gl.RGBA);
		const normal = texture(gl.RGBA8, gl.UNSIGNED_BYTE, gl.RGBA);
		const depth = gl.createRenderbuffer()!;
		gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
		gl.renderbufferStorage(gl.RENDERBUFFER, this.depthFormat(), width, height);
		const fbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, light, 0);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, shine, 0);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, normal, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
		this.lampTargets = { fbo, light, shine, normal, depth, width, height };
		return this.lampTargets;
	}

	/** The solid parts' lamp light at half size, for the camera's pass to read. */
	private drawLamps(camera: Camera): void {
		const gl = this.gl;
		const t = this.makeLampTargets();
		gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
		gl.viewport(0, 0, t.width, t.height);
		// Its own state: a clear of depth does nothing while depth writes are
		// off, as a pass before may leave them, and the last frame's depth then
		// refused every fragment at the same depth.
		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.depthFunc(this.nearer);
		gl.colorMask(true, true, true, true);
		gl.disable(gl.BLEND);
		// No distance agrees with -1: nothing drawn there is worked out where it is read.
		gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, -1]);
		gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
		gl.clearBufferfv(gl.COLOR, 2, [0, 0, 0, 0]);
		gl.clearBufferfv(gl.DEPTH, 0, [this.farDepth]);
		// Its own pixels are the frame's at the pass's size: the jitter is the frame's own.
		this.use(this.lampProgram, camera, false);
		// Its light textures' units by hand: use() sets them only with the sky
		// maps, which this program reads none of, and left on unit 0 the three
		// are of two types, which refuses every draw.
		const at = (name: string) => gl.getUniformLocation(this.lampProgram.program, name);
		gl.uniform1i(at("lightData"), 7);
		gl.uniform1i(at("lightTable"), 8);
		gl.uniform1i(at("lightIndex"), 9);
		this.solids();
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
	}

	/** The pass's textures on units 25 to 27 for the main program, or a blank where it is not drawn. */
	private lampUnits(prog: Program): void {
		const gl = this.gl;
		const t = this.lampTargets;
		if (!this.lampBlank) {
			this.lampBlank = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, this.lampBlank);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}
		const textures = t && this.lampBit(0) ? [t.light, t.shine, t.normal] : null;
		["lampLight", "lampShine", "lampNormal"].forEach((name, k) => {
			gl.activeTexture(gl.TEXTURE0 + 25 + k);
			gl.bindTexture(gl.TEXTURE_2D, textures?.[k] ?? this.lampBlank);
			gl.uniform1i(gl.getUniformLocation(prog.program, name), 25 + k);
		});
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform2f(
			gl.getUniformLocation(prog.program, "lampScale"),
			(t?.width ?? 1) / this.width,
			(t?.height ?? 1) / this.height,
		);
	}

	draw(camera: Camera, still = false): void {
		const gl = this.gl;
		const started = performance.now();
		// Still-frame TAA, as WebGpuView's.
		const aaPass = antialiasInfo(this.antialias).pass;
		this.taaWeight = 1;
		this.jitter = [0, 0];
		if (aaPass === "taa") {
			const moving = this.effects?.last.moving ?? false;
			const step = this.still.next(
				still,
				`${camera.eye.join(",")} ${camera.at.join(",")} ${this.width}x${this.height}`,
				moving,
			);
			this.jitter = step.jitter;
			this.taaWeight = step.weight;
		}
		this.outFbo = aaPass !== "none" && this.aaFbo ? this.aaFbo : null;
		this.tally = { draws: 0, instances: 0, triangles: 0 };
		const { mode } = this.render;
		const show = passesOf(this.render.features);
		const heat = sharesView(mode);
		const wire = mode === "wireframe";
		// The heatmaps and the wireframe are the place's shapes alone; the sun
		// maps' tints are left as they are drawn.
		const tinted = mode === "sunMaps";
		const postOn = this.postOn && show.post && !heat && !wire && !tinted;
		// A BloomEffect blooms the whole picture, Neon or not: see FS_BRIGHT.
		const bloom = postOn && !!this.lighting?.post.bloom && show.glow && !heat && !wire && !tinted;
		this.bloomAll = bloom;
		const glowing = (this.glowing || bloom) && show.glow && !heat && !wire && !tinted;
		const partsMoved = this.skyDirty;
		const clock = this.clock;
		clock?.start();
		if (this.probe === "empty") {
			// A profile's empty frame: the screen cleared, nothing drawn.
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, this.width, this.height);
			gl.clearColor(0.16, 0.17, 0.19, 1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			clock?.mark("place");
			clock?.end();
			this.lastTally = this.tally;
			this.cpuMs = performance.now() - started;
			return;
		}
		this.usualDepth(true);
		const centre = nearSkyCentre(camera.eye, this.nearCentre, this.heading.update(camera.eye));
		const nearMoved = !this.nearCentre || centre.some((v, a) => v !== this.nearCentre![a]);
		const nearDrawn = this.skyDirty || nearMoved;
		if (this.skyDirty || this.sunDirty || nearMoved) {
			this.drawSkyMaps(
				{
					far: this.skyDirty,
					sun: this.skyDirty || this.sunDirty,
					near: this.skyDirty || nearMoved,
				},
				centre,
			);
			clock?.mark("skyMaps");
		}
		// While the stages are profiled, the sun's maps are drawn every frame,
		// as when the camera moves: a still camera draws them only once.
		this.drawCascades(camera, partsMoved || this.clock !== null);
		clock?.mark("shadows");
		if (nearDrawn) {
			this.fillCells(camera);
			clock?.mark("skyCells");
		}
		// Not a whole cascade in a frame that drew the near maps: the next.
		if (this.fillLightGrid(camera, !nearDrawn)) clock?.mark("lightGrid");
		// The parts moved or the light changed: the cube shows them again.
		// Not on the reflection grid for the near maps alone, as WebGpuView's:
		// they follow the camera, and every kept cube was thrown away as it moved.
		if (partsMoved || (nearDrawn && this.reflGrid === null)) this.reflStale();
		this.drawReflections(camera);
		// The camera's passes from here draw only the chunks in view.
		this.cull(camera, [...this.draws, ...this.glass]);
		const culling = passesOf(this.render.features);
		// For occlusion alone: none while nothing is tested against it or the eye moves.
		if (culling.occlusion && this.occludable && !this.eyeMoving) {
			this.drawFar(camera);
			clock?.mark("occlusion");
		}
		this.usualDepth(false);
		gl.clearDepth(this.farDepth);
		// The lights at half size, before the passes that read them, in the
		// camera's own depth (reversed where it can be).
		if (this.lampBit(0) && !heat && !wire && !tinted && mode !== "overdraw" && mode !== "density")
			this.drawLamps(camera);
		this.shape = glowShape(this.lighting?.post, postOn);
		if (glowing) {
			if (this.clear.length > 0) this.sortClear(camera.eye);
			this.drawGlow(camera);
			clock?.mark("glowSources");
		}
		// The place is drawn off screen first when anything is added to it
		// after: Neon's glow, or a post effect; and always where depth is
		// reversed, which needs the float depth only a target of its own has.
		const post = postActive(this.lighting?.post, postOn);
		// MSAA other than the canvas's own 4x is drawn in the scene's target.
		const composite =
			glowing ||
			post ||
			heat ||
			this.clipControl !== null ||
			(this.samples !== 1 && this.samples !== 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, composite ? this.sceneFbo : this.outFbo);
		gl.viewport(0, 0, this.width, this.height);
		if (heat) gl.clearColor(0, 0, 0, 1);
		else if (wire) gl.clearColor(0.06, 0.07, 0.09, 1);
		else if (show.sky) gl.clearColor(0.56, 0.71, 0.86, 1);
		else gl.clearColor(0.16, 0.17, 0.19, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		if (show.sky && !heat && !wire) this.drawSky(camera);
		clock?.mark("sky");
		const images = show.images && !heat;
		if (wire)
			this.drawWires(
				camera,
				show.seeThrough ? [...this.draws, ...this.glass, ...this.clear] : this.draws,
			);
		else if (mode === "overdraw") this.drawOverdraw(camera);
		else if (mode === "density") this.drawDensity(camera);
		else this.drawPlace(camera, images, show.seeThrough, heat);
		clock?.mark("place");
		// Beams and particles, over everything see-through, farthest first; none in the wireframe.
		// At half size where Particle resolution says so and the frame is drawn
		// into a target of its own, as WebGpuView's: else into the frame. Not
		// with MSAA: WebGL2 reads a multisampled depth only by resolving it
		// every frame, which cost more than half-size particles saved (a
		// desktop at 4x: 99th percentile frame 8.5 ms against 4.4 ms).
		if (
			this.particleHalf &&
			composite &&
			this.drawnSamples() <= 1 &&
			!heat &&
			!wire &&
			this.gl.getExtension("EXT_color_buffer_float") !== null
		)
			this.drawHalfEffects(camera, this.sceneFbo);
		else this.drawEffects(camera);
		clock?.mark("effects");
		// The glow is part of the place, added once the place is drawn: what
		// marks the place is drawn over it.
		if (composite) {
			this.addGlow(camera, post, glowing, postOn, sharesComposite(mode));
			clock?.mark("composite");
		}
		this.drawMarks(camera);
		if (this.outFbo) this.antialiasPasses();
		clock?.mark("marks");
		clock?.end();
		this.lastTally = this.tally;
		this.runs.clear();
		this.cpuMs = performance.now() - started;
	}

	/** Profiling, stage by stage: see `profile.ts`. WebGL2 waits for its GPU with `finish`. */
	private clock: WaitingClock | null = null;

	setProfiling(sink: StageSink | null): void {
		this.clock = sink ? new WaitingClock(() => this.gpuWait(), sink) : null;
	}

	finished(): Promise<void> {
		this.gpuWait();
		return Promise.resolve();
	}

	/** The off-screen frame's samples: as asked, as far as the GPU goes; 0 is none. */
	private drawnSamples(): number {
		if (this.samples <= 1) return 0;
		return Math.min(this.samples, this.gl.getParameter(this.gl.MAX_SAMPLES) as number);
	}

	/** WebGL2's programs are built once, for every switch. */
	pipelinesReady(): Promise<void> {
		return Promise.resolve();
	}

	/** A profile's probe: WebGL2 has the empty frame; the parts' depth alone is WebGPU's. */
	private probe: Probe | null = null;

	setProbe(probe: Probe | null): boolean {
		this.probe = probe === "empty" ? probe : null;
		return probe === null || probe === "empty";
	}

	/** A pixel of its own, cleared and read back to wait for the GPU: see `gpuWait`. */
	private waitPixel: { fbo: WebGLFramebuffer; texture: WebGLTexture; read: Uint8Array } | null =
		null;

	/**
	 * Waits for the GPU to finish everything asked of it so far. `finish` is
	 * not enough: Chrome's returns before the GPU is done. So a pixel of its own
	 * is cleared, after everything else, and read back, which cannot happen
	 * until the clear is done, and so all before it: the GPU works in order.
	 */
	private gpuWait(): void {
		const gl = this.gl;
		if (!this.waitPixel) {
			const texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			const fbo = gl.createFramebuffer()!;
			const was = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			gl.bindFramebuffer(gl.FRAMEBUFFER, was);
			this.waitPixel = { fbo, texture, read: new Uint8Array(4) };
		}
		const { fbo, read } = this.waitPixel;
		const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
		const readFrom = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
		const scissor = gl.isEnabled(gl.SCISSOR_TEST);
		const mask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.disable(gl.SCISSOR_TEST);
		gl.colorMask(true, true, true, true);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, read);
		gl.colorMask(mask[0], mask[1], mask[2], mask[3]);
		if (scissor) gl.enable(gl.SCISSOR_TEST);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFrom);
	}

	deviceFacts(): { gpu: string; timers: boolean; samples: number } {
		const gl = this.gl;
		const info = gl.getExtension("WEBGL_debug_renderer_info");
		const gpu = info
			? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
			: String(gl.getParameter(gl.RENDERER));
		return {
			gpu,
			timers: gl.getExtension("EXT_disjoint_timer_query_webgl2") !== null,
			// The off-screen frame's, which the place is drawn into: see `resize`.
			samples: Math.max(1, this.drawnSamples()),
		};
	}

	/** The sky behind the place. */
	private drawSky(camera: Camera): void {
		const gl = this.gl;
		this.use(this.skyProgram, camera, false);
		const sky =
			this.skyOn && passesOf(this.render.features).skyImages
				? this.lighting.skyboxSun
					? 2
					: 1
				: 0;
		gl.uniform1f(gl.getUniformLocation(this.skyProgram.program, "hasSky"), sky);
		gl.activeTexture(gl.TEXTURE4);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.skyImages);
		gl.activeTexture(gl.TEXTURE5);
		gl.bindTexture(gl.TEXTURE_2D, this.sunTexture);
		gl.activeTexture(gl.TEXTURE0);
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.depthMask(true);
		gl.enable(gl.DEPTH_TEST);
	}

	/**
	 * The place's parts and images; in a heatmap, the see-through parts each
	 * add their share to what is behind them.
	 */
	private drawPlace(camera: Camera, images: boolean, seeThrough: boolean, heat: boolean): void {
		const gl = this.gl;
		if (this.pre) {
			// The solid parts' depth first, then lit only where nearest: each
			// pixel shaded once, for the surface it shows.
			this.depthOnly(camera, this.draws);
			this.use(this.main, camera, false);
			gl.depthFunc(gl.EQUAL);
			gl.depthMask(false);
			this.solids();
			gl.depthMask(true);
			gl.depthFunc(this.nearer);
		} else {
			this.use(this.main, camera, false);
			this.solids();
		}
		this.count(this.draws);
		if (images && this.drawImages(camera, "solid")) this.use(this.main, camera, false);
		if (!seeThrough) return;
		if (heat) {
			this.use(this.main, camera, false);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE);
			gl.depthMask(false);
			this.solids(this.glass);
			this.solids(this.clear);
			gl.depthMask(true);
			gl.disable(gl.BLEND);
			this.count(this.glass);
			this.count(this.clear);
			return;
		}
		// The see-through parts' images before them, into the depth, as the
		// solid parts' are: see WebGpuView's scene pass.
		if (images && this.drawImages(camera, "seeThrough")) this.use(this.main, camera, false);
		// See-through Glass: the nearest's depth, then its colour blended at that depth.
		if (this.glass.length > 0) {
			this.depthOnly(camera, this.glass);
			this.use(this.main, camera, false);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.depthFunc(this.nearerOrEqual);
			gl.depthMask(false);
			this.solids(this.glass);
			gl.depthMask(true);
			gl.depthFunc(this.nearer);
			gl.disable(gl.BLEND);
			this.count(this.glass);
		}
		// The see-through parts: blended, farthest first, hiding nothing themselves.
		if (this.clear.length > 0) {
			this.sortClear(camera.eye);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.depthMask(false);
			this.solids(this.clear);
			gl.depthMask(true);
			gl.disable(gl.BLEND);
			this.count(this.clear);
		}
	}

	/**
	 * Overdraw, as WebGpuView's drawOverdraw: every fragment of the solid
	 * parts, before the depth test hides any; then, in front of them, each
	 * see-through part and image; each adding one. Beams and particles follow.
	 */
	private drawOverdraw(camera: Camera): void {
		const gl = this.gl;
		const show = passesOf(this.render.features);
		this.use(this.main, camera, false);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.depthFunc(gl.ALWAYS);
		gl.depthMask(false);
		this.solids();
		gl.depthMask(true);
		gl.depthFunc(this.nearer);
		gl.disable(gl.BLEND);
		this.depthOnly(camera, this.draws);
		this.count(this.draws);
		if (show.images) this.drawImages(camera, "solid", true);
		if (show.seeThrough) {
			this.use(this.main, camera, false);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE);
			gl.depthMask(false);
			this.solids(this.glass);
			this.solids(this.clear);
			gl.depthMask(true);
			gl.disable(gl.BLEND);
			this.count(this.glass);
			this.count(this.clear);
		}
		if (show.images) this.drawImages(camera, "seeThrough", true);
	}

	/**
	 * Triangle density, as WebGpuView's drawDensity: every part, see-through
	 * ones as if solid, coloured by its mesh's triangles against its size.
	 */
	private drawDensity(camera: Camera): void {
		const gl = this.gl;
		const all = passesOf(this.render.features).seeThrough
			? [...this.draws, ...this.glass, ...this.clear]
			: this.draws;
		this.use(this.main, camera, false);
		const tris = gl.getUniformLocation(this.main.program, "tris");
		this.tally.draws += all.length;
		for (const d of all) {
			gl.uniform1f(tris, d.indexCount / 3);
			gl.bindVertexArray(d.vao);
			gl.drawElementsInstanced(gl.TRIANGLES, d.indexCount, d.type, 0, d.count);
		}
		gl.bindVertexArray(null);
		gl.uniform1f(tris, 0);
		this.count(all);
	}

	/** What marks the place, over it: the selection, the handles, the overlay. */
	private drawMarks(camera: Camera): void {
		const gl = this.gl;
		if (this.selection) {
			this.use(this.main, camera, true);
			// Through everything, as Studio's selection box is, or hidden by what is in front.
			if (this.hideBehind) {
				gl.depthFunc(this.nearerOrEqual);
				gl.depthMask(false);
			} else gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.bindVertexArray(this.selection.vao);
			gl.disable(gl.CULL_FACE);
			gl.drawElementsInstanced(
				gl.TRIANGLES,
				this.edgeMesh.count,
				gl.UNSIGNED_SHORT,
				0,
				this.selection.count,
			);
			gl.bindVertexArray(null);
			gl.disable(gl.BLEND);
			gl.depthMask(true);
			gl.depthFunc(this.nearer);
			gl.enable(gl.CULL_FACE);
			gl.enable(gl.DEPTH_TEST);
		}
		if (this.handleDraws.length > 0) {
			this.use(this.main, camera, false);
			gl.uniform1f(this.main.handle, 1);
			gl.uniform1f(this.main.alpha, HANDLE_ALPHA);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			for (const h of this.handleDraws) {
				gl.bindVertexArray(h.vao);
				gl.drawElementsInstanced(gl.TRIANGLES, h.indexCount, gl.UNSIGNED_SHORT, 0, h.count);
			}
			gl.bindVertexArray(null);
			gl.disable(gl.BLEND);
			gl.uniform1f(this.main.handle, 0);
		}
		if (this.overlay) {
			this.use(this.over, camera, false);
			gl.disable(gl.DEPTH_TEST);
			gl.bindVertexArray(this.overlay.vao);
			gl.drawArrays(gl.LINES, 0, this.overlay.count);
			gl.bindVertexArray(null);
			gl.enable(gl.DEPTH_TEST);
		}
	}

	private looks!: WebGLTexture;
	private loaded = new Set<number>();

	private imageProgram!: Program;
	private imageVao: WebGLVertexArrayObject | null = null;
	private imageBuffer: WebGLBuffer | null = null;
	private imageList: ImageQuad[] = [];
	private imageTextures = new Map<string, WebGLTexture>();

	/** The scene's Decals and Textures, as triangles grouped by image. */
	private setImages(scene: PlaceScene): void {
		const gl = this.gl;
		if (this.imageVao) gl.deleteVertexArray(this.imageVao);
		if (this.imageBuffer) gl.deleteBuffer(this.imageBuffer);
		this.imageVao = null;
		this.imageBuffer = null;
		const { vertices, quads } = imageQuads(scene.images ?? []);
		this.imageList = quads;
		if (vertices.length === 0) return;
		this.imageVao = gl.createVertexArray();
		this.imageBuffer = gl.createBuffer();
		gl.bindVertexArray(this.imageVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.imageBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
		const stride = IMAGE_VERTEX * 4;
		const attribs: [number, number, number][] = [
			[0, 3, 0],
			[1, 3, 12],
			[2, 2, 24],
			[3, 4, 32],
		];
		for (const [loc, size, offset] of attribs) {
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
		}
		gl.bindVertexArray(null);
	}

	private skyImages!: WebGLTexture;
	private skyOn = false;
	private sunTexture!: WebGLTexture;

	/** The meshes rows name, by their place in the scene's list. */
	private meshes: ReadonlyMap<number, MeshGeometry> = new Map();

	setMeshes(meshes: ReadonlyMap<number, MeshGeometry>): void {
		this.meshes = meshes;
		this.skyDirty = true;
		if (this.scene) this.setScene(this.scene);
	}

	setSunImage(image: ImageBitmap | null): void {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE5);
		gl.bindTexture(gl.TEXTURE_2D, this.sunTexture);
		if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
		else
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				1,
				1,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				new Uint8Array(4),
			);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.activeTexture(gl.TEXTURE0);
	}

	setSky(faces: readonly ImageBitmap[] | null): void {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE4);
		gl.deleteTexture(this.skyImages);
		this.skyImages = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.skyImages);
		const [w, h] = faces ? [faces[0].width, faces[0].height] : [1, 1];
		gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, 6);
		faces?.forEach((face, layer) => {
			gl.texSubImage3D(
				gl.TEXTURE_2D_ARRAY,
				0,
				0,
				0,
				layer,
				w,
				h,
				1,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				face,
			);
		});
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		// Clamped, so a face's edge does not wrap round to its other side.
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.activeTexture(gl.TEXTURE0);
		this.skyOn = faces !== null;
	}

	setImage(asset: string, image: ImageBitmap): void {
		if (this.imageTextures.has(asset)) return;
		const gl = this.gl;
		const texture = gl.createTexture()!;
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.activeTexture(gl.TEXTURE0);
		this.imageTextures.set(asset, texture);
		// The reflection cube shows the images too: drawn again with this one.
		if (this.imageList.some((quad) => quad.asset === asset)) this.reflStale();
	}

	/** `order`'s images on a face of the reflection cube, over its parts; the reflection program left in use. */
	private reflectImages(order: number[], face: Float32Array): void {
		const gl = this.gl;
		gl.useProgram(this.imageProgram.program);
		gl.uniformMatrix4fv(this.imageProgram.viewProj, false, face);
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(false);
		gl.bindVertexArray(this.imageVao);
		gl.activeTexture(gl.TEXTURE2);
		let bound = "";
		for (const q of order) {
			const asset = this.imageList[q].asset;
			if (asset !== bound) {
				gl.bindTexture(gl.TEXTURE_2D, this.imageTextures.get(asset) ?? null);
				bound = asset;
			}
			gl.drawArrays(gl.TRIANGLES, q * 6, 6);
		}
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(null);
		gl.depthMask(true);
		gl.depthFunc(gl.LESS);
		gl.disable(gl.BLEND);
		gl.useProgram(this.reflProgram.program);
	}

	/** One layer's images whose texture has arrived, onto their faces, farthest first; whether any was drawn. */
	private drawImages(camera: Camera, layer: ImageLayer, added = false): boolean {
		const gl = this.gl;
		if (!this.imageVao) return false;
		const order = imageOrder(this.imageList, layer, camera.eye, (asset) =>
			this.imageTextures.has(asset),
		);
		if (order.length === 0) return false;
		this.use(this.imageProgram, camera, false);
		gl.enable(gl.BLEND);
		// Overdraw's counts are added up; colours blend over what is behind.
		if (added) gl.blendFunc(gl.ONE, gl.ONE);
		else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(false);
		gl.bindVertexArray(this.imageVao);
		gl.activeTexture(gl.TEXTURE2);
		const draw = () => {
			let bound = "";
			for (const q of order) {
				const asset = this.imageList[q].asset;
				if (asset !== bound) {
					gl.bindTexture(gl.TEXTURE_2D, this.imageTextures.get(asset) ?? null);
					bound = asset;
				}
				gl.drawArrays(gl.TRIANGLES, q * 6, 6);
			}
		};
		draw();
		// Then into the depth, as WebGpuView's imageDepth: Overdraw's, the solid parts' only.
		if (!added || layer === "solid") {
			const cut = gl.getUniformLocation(this.imageProgram.program, "cut");
			gl.colorMask(false, false, false, false);
			gl.depthMask(true);
			gl.uniform1f(cut, 0.5);
			draw();
			gl.uniform1f(cut, 0);
			gl.colorMask(true, true, true, true);
		}
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(null);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		return true;
	}

	/** Every image whose texture has arrived, over what glows, in the glow's pass. */
	private veilImages(camera: Camera): void {
		const gl = this.gl;
		if (!this.imageVao) return;
		this.use(this.imageProgram, camera, false);
		const veil = gl.getUniformLocation(this.imageProgram.program, "veil");
		gl.uniform1f(veil, 1);
		gl.bindVertexArray(this.imageVao);
		gl.activeTexture(gl.TEXTURE2);
		this.imageList.forEach((quad, q) => {
			const texture = this.imageTextures.get(quad.asset);
			if (!texture) return;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.drawArrays(gl.TRIANGLES, q * 6, 6);
		});
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(null);
		gl.uniform1f(veil, 0);
	}

	/** Where each material texture layer is in `looks`: only the ones the place uses. */
	private lookSlots = new Map<number, number>();

	/** The material textures' array, `count` layers, on unit 1; empty until each is given. */
	private makeLooks(count: number): void {
		const gl = this.gl;
		if (this.looks) gl.deleteTexture(this.looks);
		this.looks = gl.createTexture()!;
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.looks);
		gl.texStorage3D(
			gl.TEXTURE_2D_ARRAY,
			TEXTURE_LEVELS,
			gl.RGBA8,
			TEXTURE_SIZE,
			TEXTURE_SIZE,
			Math.max(1, count),
		);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
		const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
		if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_BASE_LEVEL, this.lookStep);
		gl.activeTexture(gl.TEXTURE0);
		this.loaded = new Set();
	}

	setLookLayers(layers: readonly number[]): boolean {
		const fresh = layers.filter((l) => !this.lookSlots.has(l));
		if (fresh.length === 0) return false;
		for (const l of fresh) this.lookSlots.set(l, this.lookSlots.size);
		this.makeLooks(this.lookSlots.size);
		this.sendLookBlock();
		return true;
	}

	/** The material table, with each texture's slot, to every program that reads it. */
	private sendLookBlock(): void {
		const gl = this.gl;
		const block = materialBlock(this.loaded, (layer) => this.lookSlots.get(layer) ?? 0);
		for (const prog of [this.main, this.glowProgram, this.reflProgram]) {
			if (!prog) continue;
			gl.useProgram(prog.program);
			gl.uniform4fv(gl.getUniformLocation(prog.program, "M[0]"), block);
		}
	}

	setLook(layer: number, levels: readonly (HTMLCanvasElement | ImageBitmap)[]): void {
		const slot = this.lookSlots.get(layer);
		// Not one the place said it uses: no room kept for it.
		if (slot === undefined) return;
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.looks);
		levels.forEach((source, level) => {
			gl.texSubImage3D(
				gl.TEXTURE_2D_ARRAY,
				level,
				0,
				0,
				slot,
				source.width,
				source.height,
				1,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source,
			);
		});
		gl.activeTexture(gl.TEXTURE0);
		this.loaded.add(layer);
		this.sendLookBlock();
		// The reflection cube was drawn with the material's plain pattern: again, with its texture.
		this.reflStale();
	}

	destroy(): void {
		this.effects?.destroy();
		this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
	}

	async pick(camera: Camera, x: number, y: number): Promise<number> {
		const gl = this.gl;
		const px = Math.min(x, this.width - 1);
		const py = this.height - 1 - Math.min(y, this.height - 1);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
		gl.viewport(0, 0, this.width, this.height);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(px, py, 1, 1);
		gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
		gl.clearDepth(this.farDepth);
		gl.clear(gl.DEPTH_BUFFER_BIT);
		this.use(this.ids, camera, false);
		this.solids();
		this.solids(this.clear);
		this.solids(this.glass);
		const out = new Uint32Array(4);
		gl.readPixels(px, py, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, out);
		gl.disable(gl.SCISSOR_TEST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return out[0] - 1;
	}
}
