/**
 * WebGpuView's Beams and ParticleEmitters: the quads `EffectsSim` lays out,
 * drawn after the see-through parts, farthest first, hidden by what is in
 * front and hiding nothing. Each image is the one a Decal of it would show,
 * bound in the same group; until it arrives, a stand-in.
 *
 * Blended as Roblox documents LightEmission: 0 over what is behind, 1 added
 * to it, and between the two in between, in one blend by premultiplying.
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
import { type Camera, type EffectSteps, FOV, type RenderSettings, renderDebug } from "./view.js";

const BUFFER = { INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40, COPY_DST: 0x8 } as const;
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2 } as const;
const TEXTURE = { COPY_DST: 0x2, TEXTURE_BINDING: 0x4 } as const;

/** The effects' shader: its own block, and the image in group 1 as Decals have it. */
export const EFFECT_SHADER = /* wgsl */ `
struct FxU {
	viewProj: mat4x4f,
	camPos: vec4f, light: vec4f, fog: vec4f, fogColour: vec4f, hazeColour: vec4f,
	right: vec4f, up: vec4f,
};
@group(0) @binding(0) var<uniform> fx: FxU;
@group(1) @binding(0) var image: texture_2d<f32>;
@group(1) @binding(1) var imageSampler: sampler;
struct FxOut {
	@builtin(position) clip: vec4f, @location(0) world: vec3f, @location(1) uv: vec2f,
	@location(2) colour: vec4f, @location(3) look: vec3f,
};
@vertex fn vsFx(@location(0) pos: vec3f, @location(1) uv: vec2f, @location(2) colour: vec4f, @location(3) look: vec3f) -> FxOut {
	var o: FxOut;
	o.clip = fx.viewProj * vec4f(pos, 1.0);
	o.world = pos;
	o.uv = uv;
	o.colour = colour;
	o.look = look;
	return o;
}
// A particle's quad, built here from its instance (see effects.ts's
// particleCorner, the same arithmetic): its axes by Orientation, turned by
// its rotation, scaled by Squash, and its flipbook frame's corner.
@vertex fn vsParticle(
	@builtin(vertex_index) vi: u32,
	@location(0) centre: vec4f, @location(1) motion: vec4f, @location(2) squash: vec2f,
	@location(3) rect: vec4f, @location(4) colour: vec4f, @location(5) look: vec4f,
) -> FxOut {
	var corners = array<vec2f, 6>(
		vec2f(-1.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, -1.0),
		vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(-1.0, -1.0),
	);
	let k = corners[vi];
	let p = centre.xyz;
	let v = motion.xyz;
	let mode = look.w;
	let speed = length(v);
	var ax = fx.right.xyz;
	var ay = fx.up.xyz;
	if (mode > 0.5 && mode < 1.5) {
		let to = vec3f(fx.camPos.x - p.x, 0.0, fx.camPos.z - p.z);
		if (length(to) > 1e-9) {
			let u = normalize(to);
			ax = vec3f(u.z, 0.0, -u.x);
		}
		ay = vec3f(0.0, 1.0, 0.0);
	} else if (mode > 1.5 && mode < 2.5 && speed > 1e-6) {
		ay = v / speed;
		let side = cross(ay, fx.camPos.xyz - p);
		if (length(side) > 1e-9) { ax = normalize(side); }
	} else if (mode > 2.5 && speed > 1e-6) {
		let n = v / speed;
		let refAxis = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(n.y) < 0.99);
		ax = normalize(cross(refAxis, n));
		ay = cross(n, ax);
	}
	let c = cos(motion.w) * centre.w;
	let s = sin(motion.w) * centre.w;
	let pos = p + (ax * c - ay * s) * squash.x * k.x + (ay * c + ax * s) * squash.y * k.y;
	var o: FxOut;
	o.clip = fx.viewProj * vec4f(pos, 1.0);
	o.world = pos;
	o.uv = vec2f(select(rect.x + rect.z, rect.x, k.x < 0.0), select(rect.y + rect.w, rect.y, k.y > 0.0));
	o.colour = colour;
	o.look = look.xyz;
	return o;
}
// How much of the air's colour lies over a point this far off: the fog, or the haze.
fn fxAir(d: f32, y: f32) -> vec4f {
	if (fx.fogColour.w < 0.5) { return vec4f(0.0); }
	if (fx.fog.z > 0.5) {
		let k = clamp((d - fx.fog.x) / max(fx.fog.y - fx.fog.x, 1.0), 0.0, 1.0);
		return vec4f(fx.fogColour.rgb, k);
	}
	let thin = exp(-max(y, 0.0) * 0.004);
	return vec4f(fx.hazeColour.rgb, 1.0 - exp(-d * fx.fog.w * thin));
}
// The effects' own curve, channel by channel, so a cyan beam stays cyan.
fn fxCurve(x: vec3f) -> vec3f {
	let p = pow(max(x, vec3f(1e-6)), vec3f(${FX_CURVE.power}));
	return pow(p / (p + ${FX_CURVE.knee}), vec3f(1.0 / 2.2));
}
@fragment fn fsFx(i: FxOut) -> @location(0) vec4f {
	let t = textureSample(image, imageSampler, i.uv);
	// The render heatmap: the pixel's share, added to what is behind.
	if (fx.light.w > 4.5) { return vec4f(fx.hazeColour.w, 0.0, 0.0, 0.0); }
	let a = t.a * i.colour.a;
	let albedo = pow(t.rgb * i.colour.rgb, vec3f(2.2));
	let added = clamp(i.look.x, 0.0, 1.0);
	if (fx.light.w > 2.5) { return vec4f(pow(min(albedo, vec3f(1.0)), vec3f(1.0 / 2.2)) * a, a * (1.0 - added)); }
	let air = fxAir(length(fx.camPos.xyz - i.world), i.world.y);
	// Its own light (Brightness, as its square root) or the place's, then the
	// air; scaled by its opacity before the curve, not after.
	let own = albedo * sqrt(max(i.look.z, 0.0));
	let lit = albedo * fx.light.rgb * ${FX_CURVE.lit};
	let light = mix(mix(own, lit, clamp(i.look.y, 0.0, 1.0)), air.rgb, air.a);
	return vec4f(fxCurve(light * a * fx.camPos.w), a * (1.0 - added));
}
`;

/** The renderer's own, which the effects share: its pipeline maker, and its images' group. */
export interface GpuEffectsHost {
	device: GPUDevice;
	format: GPUTextureFormat;
	samples: number;
	imageLayout: GPUBindGroupLayout;
	imageSampler: GPUSampler;
	/** A pipeline made the way the renderer makes its own, set once it is ready. */
	pipeline(set: (p: GPURenderPipeline) => void, desc: GPURenderPipelineDescriptor): void;
	/** An image's group, once it has arrived. */
	imageGroup(asset: string): GPUBindGroup | undefined;
}

export class GpuEffects {
	private sim = new EffectsSim(undefined);
	private drawn!: GPURenderPipeline;
	/** Particles: an instance each, the quad built by vsParticle. */
	private particlePipe!: GPURenderPipeline;
	private instances: GPUBuffer | null = null;
	/** Instances the buffer holds room for. */
	private instanceRoom = 0;
	private layout: GPUBindGroupLayout;
	private uniform: GPUBuffer;
	private group: GPUBindGroup;
	private vertices: GPUBuffer | null = null;
	private indices: GPUBuffer | null = null;
	/** Quads the buffers hold room for. */
	private room = 0;
	private fallbacks = new Map<string, GPUBindGroup>();
	/** What the last frame drew, for the Rendering panel, and whether it moves. */
	last: Pick<EffectFrame, "beams" | "particles" | "moving"> & { draws: number; quads: number } = {
		beams: 0,
		particles: 0,
		moving: false,
		draws: 0,
		quads: 0,
	};

	constructor(private readonly host: GpuEffectsHost) {
		const d = host.device;
		this.layout = d.createBindGroupLayout({
			entries: [{ binding: 0, visibility: STAGE.VERTEX | STAGE.FRAGMENT, buffer: {} }],
		});
		this.uniform = d.createBuffer({
			size: EFFECT_BLOCK * 4,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		this.group = d.createBindGroup({
			layout: this.layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});
		const module = d.createShaderModule({ code: EFFECT_SHADER });
		const pipeLayout = d.createPipelineLayout({
			bindGroupLayouts: [this.layout, host.imageLayout],
		});
		const fragment: GPUFragmentState = {
			module,
			entryPoint: "fsFx",
			targets: [
				{
					format: host.format,
					blend: {
						color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
					},
				},
			],
		};
		const stride = PARTICLE_INSTANCE * 4;
		host.pipeline((p) => (this.particlePipe = p), {
			layout: pipeLayout,
			vertex: {
				module,
				entryPoint: "vsParticle",
				buffers: [
					{
						arrayStride: stride,
						stepMode: "instance",
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x4" },
							{ shaderLocation: 1, offset: 16, format: "float32x4" },
							{ shaderLocation: 2, offset: 32, format: "float32x2" },
							{ shaderLocation: 3, offset: 40, format: "float32x4" },
							{ shaderLocation: 4, offset: 56, format: "unorm8x4" },
							{ shaderLocation: 5, offset: 60, format: "float32x4" },
						],
					},
				],
			},
			fragment,
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: host.samples },
		});
		host.pipeline((p) => (this.drawn = p), {
			layout: pipeLayout,
			vertex: {
				module,
				entryPoint: "vsFx",
				buffers: [
					{
						arrayStride: EFFECT_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x2" },
							{ shaderLocation: 2, offset: 20, format: "unorm8x4" },
							{ shaderLocation: 3, offset: 24, format: "float32x3" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fsFx",
				targets: [
					{
						format: host.format,
						blend: {
							color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			// Both sides: a beam or a turned particle is seen from behind too.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: host.samples },
		});
		for (const kind of [FALLBACK_WHITE, FALLBACK_DOT, FALLBACK_BAND]) {
			const size = 64;
			const texture = d.createTexture({
				size: [size, size],
				format: "rgba8unorm",
				usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
			});
			d.queue.writeTexture(
				{ texture },
				fallbackPixels(kind, size) as BufferSource,
				{ bytesPerRow: size * 4 },
				[size, size],
			);
			this.fallbacks.set(
				kind,
				d.createBindGroup({
					layout: host.imageLayout,
					entries: [
						{ binding: 0, resource: texture.createView() },
						{ binding: 1, resource: host.imageSampler },
					],
				}),
			);
		}
	}

	/** The scene's effects, started afresh. */
	setEffects(effects: SceneEffects | undefined): void {
		this.sim = new EffectsSim(effects);
	}

	/**
	 * This frame's effects into `pass`, after the see-through parts. Leaves
	 * group 0 bound to the effects' own block: the caller binds its own again.
	 */
	draw(
		pass: GPURenderPassEncoder,
		camera: Camera,
		width: number,
		height: number,
		lighting: LightingParams | undefined,
		render: RenderSettings,
		show: EffectShow,
		now: number,
	): void {
		const mode = render.mode;
		const none = { beams: 0, particles: 0, moving: false, draws: 0, quads: 0 };
		// The lighting heatmap is of lights reaching surfaces; the wireframe of the place's shapes.
		if (this.sim.empty || !lighting || !effectsShown(mode) || !this.drawn) {
			this.last = none;
			return;
		}
		const ready = (asset: string) => this.host.imageGroup(asset) !== undefined;
		const aspect = width / height;
		this.uploadMs = 0;
		const frame = this.sim.frame(
			{ eye: camera.eye, at: camera.at, aspect, fov: FOV },
			now,
			show,
			ready,
		);
		this.last = { ...frame, draws: 0, quads: frame.quads + frame.drawn };
		if (frame.quads === 0 && frame.drawn === 0) return;
		const d = this.host.device;
		if (frame.drawn > this.instanceRoom) {
			this.instanceRoom = Math.max(frame.drawn, this.instanceRoom * 2, 256);
			this.instances?.destroy();
			this.instances = d.createBuffer({
				size: this.instanceRoom * PARTICLE_INSTANCE * 4,
				usage: BUFFER.VERTEX | BUFFER.COPY_DST,
			});
		}
		if (frame.quads > this.room) {
			this.room = Math.max(frame.quads, this.room * 2, 256);
			this.vertices?.destroy();
			this.indices?.destroy();
			this.vertices = d.createBuffer({
				size: this.room * QUAD_VERTICES * EFFECT_VERTEX * 4,
				usage: BUFFER.VERTEX | BUFFER.COPY_DST,
			});
			const indices = quadIndices(this.room);
			this.indices = d.createBuffer({
				size: indices.byteLength,
				usage: BUFFER.INDEX | BUFFER.COPY_DST,
			});
			d.queue.writeBuffer(this.indices, 0, indices);
		}
		const sending = performance.now();
		if (frame.quads > 0 && this.vertices) d.queue.writeBuffer(this.vertices, 0, frame.vertices);
		if (frame.drawn > 0 && this.instances) d.queue.writeBuffer(this.instances, 0, frame.instances);
		this.uploadMs = performance.now() - sending;
		const viewProj = multiply(
			perspective(FOV, aspect, camera.near, camera.far, true, true),
			lookAt(camera.eye, camera.at),
		);
		d.queue.writeBuffer(
			this.uniform,
			0,
			effectBlock(
				viewProj,
				camera.eye,
				lighting,
				// No light at all: the effects in their own colours, as the parts are.
				featureBits(render.features) & FEATURE_BIT.unlit ? 3 : renderDebug(render)[0],
				airOn(render.features),
				effectShare(mode),
				frame,
			),
		);
		pass.setBindGroup(0, this.group);
		let bound: "quads" | "particles" | null = null;
		for (const batch of frame.batches) {
			const group = this.fallbacks.get(batch.texture) ?? this.host.imageGroup(batch.texture);
			if (!group) continue;
			// Beams' quads and particles' instances, farthest first, whichever comes next.
			if (batch.kind !== bound) {
				if (batch.kind === "particles") {
					if (!this.instances || !this.particlePipe) continue;
					pass.setPipeline(this.particlePipe);
					pass.setVertexBuffer(0, this.instances);
				} else {
					if (!this.vertices || !this.indices) continue;
					pass.setPipeline(this.drawn);
					pass.setVertexBuffer(0, this.vertices);
					pass.setIndexBuffer(this.indices, "uint32");
				}
				bound = batch.kind;
			}
			pass.setBindGroup(1, group);
			if (batch.kind === "particles") pass.draw(6, batch.count, 0, batch.first);
			else pass.drawIndexed(batch.count * 6, 1, batch.first * 6);
			this.last.draws++;
		}
	}

	/** The last frame's time sending its quads, in milliseconds. */
	private uploadMs = 0;

	/** The last frame's effects time by step: see EffectSteps. */
	steps(): EffectSteps {
		return { ...this.sim.timing, upload: this.uploadMs };
	}

	destroy(): void {
		this.vertices?.destroy();
		this.indices?.destroy();
		this.instances?.destroy();
		this.uniform.destroy();
	}
}
