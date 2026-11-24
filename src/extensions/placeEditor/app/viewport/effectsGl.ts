/**
 * WebGl2View's Beams and ParticleEmitters, as `effectsGpu.ts` draws them in
 * WebGPU: the quads `EffectsSim` lays out, after the see-through parts,
 * farthest first, depth-tested and writing none, blended by LightEmission.
 */

import type { SceneEffects } from "../../core/effects.js";
import type { LightingParams } from "../../core/lighting.js";
import {
	EFFECT_BLOCK,
	EFFECT_VERTEX,
	type EffectFrame,
	type EffectShow,
	EffectsSim,
	effectBlock,
	FALLBACK_BAND,
	FALLBACK_DOT,
	FALLBACK_WHITE,
	FX_CURVE,
	fallbackPixels,
	PARTICLE_INSTANCE,
	QUAD_VERTICES,
	quadIndices,
} from "./effects.js";
import { lookAt, multiply, perspective } from "./math.js";
import { airOn, FEATURE_BIT, featureBits } from "./renderFeatures.js";
import { effectShare, effectsShown } from "./renderViews.js";
import { type Camera, FOV, type RenderSettings, renderDebug } from "./view.js";

const VS_FX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 pos; layout(location = 1) in vec2 uv; layout(location = 2) in vec4 colour; layout(location = 3) in vec3 look;
uniform vec4 FX[${EFFECT_BLOCK / 4}];
out vec3 vWorld; out vec2 vUv; out vec4 vColour; out vec3 vLook;
#ifdef LOG_DEPTH
out float vDepthW;
#endif
void main() {
	mat4 viewProj = mat4(FX[0], FX[1], FX[2], FX[3]);
	gl_Position = viewProj * vec4(pos, 1.0);
	vWorld = pos; vUv = uv; vColour = colour; vLook = look;
#ifdef LOG_DEPTH
	vDepthW = 1.0 + gl_Position.w;
#endif
}`;

/** A particle's quad, built from its instance: see effects.ts's particleCorner, the same arithmetic. */
const VS_PARTICLE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 centre; layout(location = 1) in vec4 motion; layout(location = 2) in vec2 squash;
layout(location = 3) in vec4 rect; layout(location = 4) in vec4 colour; layout(location = 5) in vec4 look;
uniform vec4 FX[${EFFECT_BLOCK / 4}];
out vec3 vWorld; out vec2 vUv; out vec4 vColour; out vec3 vLook;
#ifdef LOG_DEPTH
out float vDepthW;
#endif
const vec2 CORNERS[6] = vec2[6](vec2(-1.0, 1.0), vec2(1.0, 1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(-1.0, -1.0));
void main() {
	vec2 k = CORNERS[gl_VertexID % 6];
	vec3 p = centre.xyz;
	vec3 v = motion.xyz;
	float mode = look.w;
	float speed = length(v);
	vec3 ax = FX[9].xyz;
	vec3 ay = FX[10].xyz;
	if (mode > 0.5 && mode < 1.5) {
		vec3 to = vec3(FX[4].x - p.x, 0.0, FX[4].z - p.z);
		if (length(to) > 1e-9) { vec3 u = normalize(to); ax = vec3(u.z, 0.0, -u.x); }
		ay = vec3(0.0, 1.0, 0.0);
	} else if (mode > 1.5 && mode < 2.5 && speed > 1e-6) {
		ay = v / speed;
		vec3 side = cross(ay, FX[4].xyz - p);
		if (length(side) > 1e-9) ax = normalize(side);
	} else if (mode > 2.5 && speed > 1e-6) {
		vec3 n = v / speed;
		vec3 refAxis = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
		ax = normalize(cross(refAxis, n));
		ay = cross(n, ax);
	}
	float c = cos(motion.w) * centre.w;
	float s = sin(motion.w) * centre.w;
	vec3 pos = p + (ax * c - ay * s) * squash.x * k.x + (ay * c + ax * s) * squash.y * k.y;
	mat4 viewProj = mat4(FX[0], FX[1], FX[2], FX[3]);
	gl_Position = viewProj * vec4(pos, 1.0);
	vWorld = pos;
	vUv = vec2(k.x < 0.0 ? rect.x : rect.x + rect.z, k.y > 0.0 ? rect.y : rect.y + rect.w);
	vColour = colour;
	vLook = look.xyz;
#ifdef LOG_DEPTH
	vDepthW = 1.0 + gl_Position.w;
#endif
}`;

const FS_FX = `#version 300 es
precision highp float;
in vec3 vWorld; in vec2 vUv; in vec4 vColour; in vec3 vLook;
#ifdef LOG_DEPTH
in float vDepthW; uniform float logFar;
#endif
uniform vec4 FX[${EFFECT_BLOCK / 4}];
uniform sampler2D fxImage;
out vec4 o;
vec4 fxAir(float d, float y) {
	if (FX[7].w < 0.5) return vec4(0.0);
	if (FX[6].z > 0.5) return vec4(FX[7].rgb, clamp((d - FX[6].x) / max(FX[6].y - FX[6].x, 1.0), 0.0, 1.0));
	float thin = exp(-max(y, 0.0) * 0.004);
	return vec4(FX[8].rgb, 1.0 - exp(-d * FX[6].w * thin));
}
vec3 fxCurve(vec3 x) {
	vec3 p = pow(max(x, vec3(1e-6)), vec3(${FX_CURVE.power}));
	return pow(p / (p + ${FX_CURVE.knee}), vec3(1.0 / 2.2));
}
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = log2(max(vDepthW, 1e-6)) * logFar;
#endif
	vec4 t = texture(fxImage, vUv);
	if (FX[5].w > 4.5) { o = vec4(FX[8].w, 0.0, 0.0, 0.0); return; }
	float a = t.a * vColour.a;
	vec3 albedo = pow(t.rgb * vColour.rgb, vec3(2.2));
	float added = clamp(vLook.x, 0.0, 1.0);
	if (FX[5].w > 2.5) { o = vec4(pow(min(albedo, vec3(1.0)), vec3(1.0 / 2.2)) * a, a * (1.0 - added)); return; }
	vec4 air = fxAir(length(FX[4].xyz - vWorld), vWorld.y);
	vec3 own = albedo * sqrt(max(vLook.z, 0.0));
	vec3 lit = albedo * FX[5].rgb * ${FX_CURVE.lit};
	vec3 light = mix(mix(own, lit, clamp(vLook.y, 0.0, 1.0)), air.rgb, air.a);
	o = vec4(fxCurve(light * a * FX[4].w), a * (1.0 - added));
}`;

/** What the effects need of WebGl2View: its context, its depth, and its images. */
export interface GlEffectsHost {
	gl: WebGL2RenderingContext;
	/** Depth reversed into a float buffer (EXT_clip_control); else logarithmic depth is written. */
	reversed: boolean;
	/** The depth test that keeps what is nearer. */
	nearer: number;
	/** An image's texture, once it has arrived. */
	imageTexture(asset: string): WebGLTexture | undefined;
}

export class GlEffects {
	private sim = new EffectsSim(undefined);
	private program: WebGLProgram;
	private block: WebGLUniformLocation | null;
	private logFar: WebGLUniformLocation | null;
	/** Particles: an instance each, the quad built by VS_PARTICLE. */
	private particleProgram: WebGLProgram;
	private particleBlock: WebGLUniformLocation | null;
	private particleLogFar: WebGLUniformLocation | null;
	private particleVao: WebGLVertexArrayObject;
	private instances: WebGLBuffer;
	private instanceRoom = 0;
	private vao: WebGLVertexArrayObject;
	private vertices: WebGLBuffer;
	private indices: WebGLBuffer;
	private room = 0;
	private fallbacks = new Map<string, WebGLTexture>();
	last: Pick<EffectFrame, "beams" | "particles" | "moving"> & { draws: number; quads: number } = {
		beams: 0,
		particles: 0,
		moving: false,
		draws: 0,
		quads: 0,
	};

	constructor(private readonly host: GlEffectsHost) {
		const gl = host.gl;
		const define = (src: string) =>
			host.reversed
				? src
				: src.replace("#version 300 es\n", "#version 300 es\n#define LOG_DEPTH\n");
		const compile = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, define(src));
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
				throw new Error(gl.getShaderInfoLog(s) ?? "effects shader");
			return s;
		};
		const link = (vs: string) => {
			const program = gl.createProgram()!;
			gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
			gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS_FX));
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS))
				throw new Error(gl.getProgramInfoLog(program) ?? "effects link");
			return program;
		};
		const program = link(VS_FX);
		this.program = program;
		this.block = gl.getUniformLocation(program, "FX[0]") ?? gl.getUniformLocation(program, "FX");
		this.logFar = gl.getUniformLocation(program, "logFar");
		this.particleProgram = link(VS_PARTICLE);
		this.particleBlock =
			gl.getUniformLocation(this.particleProgram, "FX[0]") ??
			gl.getUniformLocation(this.particleProgram, "FX");
		this.particleLogFar = gl.getUniformLocation(this.particleProgram, "logFar");
		this.particleVao = gl.createVertexArray()!;
		this.instances = gl.createBuffer()!;
		this.vao = gl.createVertexArray()!;
		this.vertices = gl.createBuffer()!;
		this.indices = gl.createBuffer()!;
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
		const stride = EFFECT_VERTEX * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, stride, 20);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 24);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.activeTexture(gl.TEXTURE2);
		for (const kind of [FALLBACK_WHITE, FALLBACK_DOT, FALLBACK_BAND]) {
			const size = 64;
			const texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				size,
				size,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				fallbackPixels(kind, size),
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			this.fallbacks.set(kind, texture);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
		// As WebGpuView's image sampler: linear, repeating both ways, and no
		// smaller copies, so a beam's fine lines do not average into a solid band.
		this.sampler = gl.createSampler()!;
		gl.samplerParameteri(this.sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.samplerParameteri(this.sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.samplerParameteri(this.sampler, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.samplerParameteri(this.sampler, gl.TEXTURE_WRAP_T, gl.REPEAT);
	}

	private sampler!: WebGLSampler;

	setEffects(effects: SceneEffects | undefined): void {
		this.sim = new EffectsSim(effects);
	}

	/** This frame's effects into what is bound, after the see-through parts. Leaves the state as it found it. */
	draw(
		camera: Camera,
		width: number,
		height: number,
		lighting: LightingParams | undefined,
		render: RenderSettings,
		show: EffectShow,
		now: number,
	): void {
		const mode = render.mode;
		if (this.sim.empty || !lighting || !effectsShown(mode)) {
			this.last = { beams: 0, particles: 0, moving: false, draws: 0, quads: 0 };
			return;
		}
		const gl = this.host.gl;
		const ready = (asset: string) => this.host.imageTexture(asset) !== undefined;
		const aspect = width / height;
		const frame = this.sim.frame(
			{ eye: camera.eye, at: camera.at, aspect, fov: FOV },
			now,
			show,
			ready,
		);
		this.last = { ...frame, draws: 0, quads: frame.quads + frame.drawn };
		if (frame.quads === 0 && frame.drawn === 0) return;
		if (frame.drawn > 0) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
			if (frame.drawn > this.instanceRoom) {
				this.instanceRoom = Math.max(frame.drawn, this.instanceRoom * 2, 256);
				gl.bufferData(gl.ARRAY_BUFFER, this.instanceRoom * PARTICLE_INSTANCE * 4, gl.DYNAMIC_DRAW);
			}
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame.instances);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
		}
		gl.bindVertexArray(this.vao);
		if (frame.quads > this.room) {
			this.room = Math.max(frame.quads, this.room * 2, 256);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				this.room * QUAD_VERTICES * EFFECT_VERTEX * 4,
				gl.DYNAMIC_DRAW,
			);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(this.room), gl.STATIC_DRAW);
		}
		if (frame.quads > 0) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame.vertices);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
		}
		const reversed = this.host.reversed;
		const viewProj = multiply(
			perspective(FOV, aspect, camera.near, camera.far, reversed, reversed),
			lookAt(camera.eye, camera.at),
		);
		const block = effectBlock(
			viewProj,
			camera.eye,
			lighting,
			// No light at all: the effects in their own colours, as the parts are.
			featureBits(render.features) & FEATURE_BIT.unlit ? 3 : renderDebug(render)[0],
			airOn(render.features),
			effectShare(mode),
			frame,
		);
		const logFar = 1 / Math.log2(camera.far + 1);
		// Both programs given the block and the image's unit once; each batch picks one.
		for (const [program, loc, far] of [
			[this.particleProgram, this.particleBlock, this.particleLogFar],
			[this.program, this.block, this.logFar],
		] as const) {
			gl.useProgram(program);
			gl.uniform4fv(loc, block);
			if (far) gl.uniform1f(far, logFar);
			gl.uniform1i(gl.getUniformLocation(program, "fxImage"), 2);
		}
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(this.host.nearer);
		gl.depthMask(false);
		gl.disable(gl.CULL_FACE);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindSampler(2, this.sampler);
		let bound: "quads" | "particles" | null = null;
		for (const batch of frame.batches) {
			const texture = this.fallbacks.get(batch.texture) ?? this.host.imageTexture(batch.texture);
			if (!texture) continue;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			if (batch.kind === "particles") {
				if (bound !== "particles") {
					gl.useProgram(this.particleProgram);
					gl.bindVertexArray(this.particleVao);
					gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
					bound = "particles";
				}
				// WebGL2 has no first instance: the attributes start at this batch's instead.
				this.pointInstances(batch.first);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, batch.count);
			} else {
				if (bound !== "quads") {
					gl.useProgram(this.program);
					gl.bindVertexArray(this.vao);
					bound = "quads";
				}
				gl.drawElements(gl.TRIANGLES, batch.count * 6, gl.UNSIGNED_INT, batch.first * 6 * 4);
			}
			this.last.draws++;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindSampler(2, null);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(null);
		gl.enable(gl.CULL_FACE);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
	}

	/** The particle attributes, an instance each, from instance `first` of the bound buffer. */
	private pointInstances(first: number): void {
		const gl = this.host.gl;
		const stride = PARTICLE_INSTANCE * 4;
		const base = first * stride;
		const attrs: [number, number, number, boolean, number][] = [
			[0, 4, gl.FLOAT, false, 0],
			[1, 4, gl.FLOAT, false, 16],
			[2, 2, gl.FLOAT, false, 32],
			[3, 4, gl.FLOAT, false, 40],
			[4, 4, gl.UNSIGNED_BYTE, true, 56],
			[5, 4, gl.FLOAT, false, 60],
		];
		for (const [loc, size, type, norm, offset] of attrs) {
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, type, norm, stride, base + offset);
			gl.vertexAttribDivisor(loc, 1);
		}
	}

	destroy(): void {
		const gl = this.host.gl;
		gl.deleteBuffer(this.instances);
		gl.deleteVertexArray(this.particleVao);
		gl.deleteProgram(this.particleProgram);
		gl.deleteBuffer(this.vertices);
		gl.deleteBuffer(this.indices);
		gl.deleteVertexArray(this.vao);
		gl.deleteProgram(this.program);
		for (const t of this.fallbacks.values()) gl.deleteTexture(t);
	}
}
