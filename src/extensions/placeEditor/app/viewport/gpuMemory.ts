/**
 * An estimate of the GPU memory a view holds: every texture and buffer it
 * makes, by what it is for, from the sizes it asks for. The browser and the
 * driver add their own on top -- padding, compression, the canvas's buffers,
 * which are estimated here as `canvasBytes` says -- so it is a floor, and
 * named an estimate wherever it is shown.
 *
 * Counted as each is made (WebGPU's createTexture and createBuffer, WebGL2's
 * storage calls on whatever is bound) and taken off when it is destroyed or
 * deleted, or when the browser collects one dropped without either.
 */

/** What a texture or buffer is for, as the Performance panel lists them. */
export type MemoryKind =
	| "frame"
	| "shadows"
	| "reflections"
	| "images"
	| "meshes"
	| "buffers"
	| "canvas";

/** Each kind's words, in the order they are listed. */
export const MEMORY_KINDS: Record<MemoryKind, string> = {
	frame: "Frame targets",
	shadows: "Shadow and sky maps",
	reflections: "Reflections",
	images: "Images and materials",
	meshes: "Meshes and parts",
	buffers: "Other buffers",
	canvas: "Canvas (estimated)",
};

export interface MemoryUse {
	/** Bytes in all. */
	total: number;
	/** By kind, the largest first; kinds holding nothing left out. */
	kinds: { kind: MemoryKind; bytes: number; count: number }[];
}

/** Bytes a texel takes, by WebGPU's format names; WebGL2's are named as these. */
const TEXEL: Record<string, number> = {
	r8unorm: 1,
	r8uint: 1,
	r8snorm: 1,
	rg8unorm: 2,
	rg8uint: 2,
	r16float: 2,
	r16uint: 2,
	rgba8unorm: 4,
	"rgba8unorm-srgb": 4,
	bgra8unorm: 4,
	"bgra8unorm-srgb": 4,
	rg16float: 4,
	r32float: 4,
	r32uint: 4,
	rg11b10ufloat: 4,
	rgb10a2unorm: 4,
	depth24plus: 4,
	"depth24plus-stencil8": 4,
	depth32float: 4,
	depth16unorm: 2,
	rgba16float: 8,
	rg32float: 8,
	rgba32float: 16,
	rgba32uint: 16,
};

/** Bytes a texel takes in `format`; 4 for one not listed. */
export function texelBytes(format: string): number {
	return TEXEL[format] ?? 4;
}

/** A texture's bytes: every mip level of every layer, every sample. */
export function textureBytes(
	format: string,
	width: number,
	height: number,
	layers = 1,
	mips = 1,
	samples = 1,
): number {
	let texels = 0;
	for (let level = 0; level < mips; level++)
		texels += Math.max(1, width >> level) * Math.max(1, height >> level);
	return texels * layers * samples * texelBytes(format);
}

/**
 * The canvas's own buffers, which the page does not make: two the size of
 * the canvas (the one shown and the one drawn), and for WebGL2's own 4x
 * MSAA, four samples a pixel of colour and of depth besides.
 */
export function canvasBytes(width: number, height: number, contextSamples = 1): number {
	const pixels = width * height;
	const msaa = contextSamples > 1 ? pixels * contextSamples * 8 : 0;
	return pixels * 4 * 2 + msaa;
}

/** What a view has made, by what it is for. */
export class GpuMemory {
	private held = new Map<object, { kind: MemoryKind; bytes: number }>();
	private totals = new Map<MemoryKind, { bytes: number; count: number }>();
	/** A texture or buffer dropped without being destroyed comes off when it is collected. */
	private gone =
		typeof FinalizationRegistry === "undefined"
			? null
			: new FinalizationRegistry<{ kind: MemoryKind; bytes: number }>((was) => this.take(was));

	add(thing: object, kind: MemoryKind, bytes: number): void {
		this.remove(thing);
		const entry = { kind, bytes };
		this.held.set(thing, entry);
		this.put(entry);
		this.gone?.register(thing, entry, thing);
	}

	remove(thing: object): void {
		const was = this.held.get(thing);
		if (!was) return;
		this.held.delete(thing);
		this.gone?.unregister(thing);
		this.take(was);
	}

	use(canvas?: number): MemoryUse {
		const kinds = [...this.totals]
			.filter(([, t]) => t.bytes > 0)
			.map(([kind, t]) => ({ kind, bytes: t.bytes, count: t.count }));
		if (canvas) kinds.push({ kind: "canvas", bytes: canvas, count: 1 });
		kinds.sort((a, b) => b.bytes - a.bytes);
		return { total: kinds.reduce((n, k) => n + k.bytes, 0), kinds };
	}

	private put({ kind, bytes }: { kind: MemoryKind; bytes: number }): void {
		const t = this.totals.get(kind) ?? { bytes: 0, count: 0 };
		this.totals.set(kind, { bytes: t.bytes + bytes, count: t.count + 1 });
	}

	private take({ kind, bytes }: { kind: MemoryKind; bytes: number }): void {
		const t = this.totals.get(kind);
		if (!t) return;
		this.totals.set(kind, { bytes: t.bytes - bytes, count: t.count - 1 });
	}
}

/** WebGPU's usage bits this needs, as numbers: the globals are not there in tests. */
const BUFFER_VERTEX = 0x20;
const BUFFER_INDEX = 0x10;
const TEXTURE_COPY_DST = 0x02;

/**
 * What a WebGPU texture is for, from how it is made: a depth array, the
 * sun's and sky's maps; six layers, a reflection cube; filled by copying,
 * an image, a material's texture or a Sky's; anything else, a frame target.
 */
export function gpuTextureKind(desc: GPUTextureDescriptor): MemoryKind {
	const [, , layers = 1] = sizeOf(desc.size);
	if (desc.format.startsWith("depth") && layers > 1) return "shadows";
	if (layers === 6) return "reflections";
	if (desc.usage & TEXTURE_COPY_DST) return "images";
	return "frame";
}

function sizeOf(size: GPUExtent3D): [number, number, number] {
	if (Array.isArray(size) || ArrayBuffer.isView(size)) {
		const s = [...(size as Iterable<number>)];
		return [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1];
	}
	const d = size as GPUExtent3DDict;
	return [d.width, d.height ?? 1, d.depthOrArrayLayers ?? 1];
}

/** Counts every texture and buffer `device` makes from now on into `memory`. */
export function trackWebGpu(device: GPUDevice, memory: GpuMemory): void {
	const makeTexture = device.createTexture.bind(device);
	device.createTexture = (desc: GPUTextureDescriptor) => {
		const texture = makeTexture(desc);
		const [w, h, layers] = sizeOf(desc.size);
		const bytes = textureBytes(
			desc.format,
			w,
			h,
			desc.dimension === "3d" ? 1 : layers,
			desc.mipLevelCount ?? 1,
			desc.sampleCount ?? 1,
		);
		memory.add(texture, gpuTextureKind(desc), desc.dimension === "3d" ? bytes * layers : bytes);
		const destroy = texture.destroy.bind(texture);
		texture.destroy = () => {
			memory.remove(texture);
			destroy();
		};
		return texture;
	};
	const makeBuffer = device.createBuffer.bind(device);
	device.createBuffer = (desc: GPUBufferDescriptor) => {
		const buffer = makeBuffer(desc);
		const kind = desc.usage & (BUFFER_VERTEX | BUFFER_INDEX) ? "meshes" : "buffers";
		memory.add(buffer, kind, desc.size);
		const destroy = buffer.destroy.bind(buffer);
		buffer.destroy = () => {
			memory.remove(buffer);
			destroy();
		};
		return buffer;
	};
}

/** WebGL2's internal formats, as the names TEXEL knows them by. */
const GL_FORMATS: Record<number, string> = {
	0x8229: "r8unorm", // R8
	0x8232: "r8uint", // R8UI
	0x822b: "rg8unorm", // RG8
	0x8238: "rg8uint", // RG8UI
	0x822d: "r16float", // R16F
	0x8058: "rgba8unorm", // RGBA8
	0x8c43: "rgba8unorm-srgb", // SRGB8_ALPHA8
	0x1908: "rgba8unorm", // RGBA
	0x822f: "rg16float", // RG16F
	0x822e: "r32float", // R32F
	0x8236: "r32uint", // R32UI
	0x8c3a: "rg11b10ufloat", // R11F_G11F_B10F
	0x881a: "rgba16float", // RGBA16F
	0x8814: "rgba32float", // RGBA32F
	0x81a5: "depth16unorm", // DEPTH_COMPONENT16
	0x81a6: "depth24plus", // DEPTH_COMPONENT24
	0x8cac: "depth32float", // DEPTH_COMPONENT32F
	0x88f0: "depth24plus-stencil8", // DEPTH24_STENCIL8
};

const glFormat = (internal: number) => GL_FORMATS[internal] ?? "rgba8unorm";

/**
 * Counts what `gl` stores from now on into `memory`: textures by their
 * storage calls (on whichever texture is bound to the target), renderbuffers
 * likewise, buffers by bufferData; each taken off when deleted.
 */
export function trackWebGl2(gl: WebGL2RenderingContext, memory: GpuMemory): void {
	const bound = new Map<number, WebGLTexture | null>();
	const boundBuffer = new Map<number, WebGLBuffer | null>();
	let renderbuffer: WebGLRenderbuffer | null = null;
	/** Bytes each texture holds, by level and face, for texImage's one level at a time. */
	const levels = new WeakMap<WebGLTexture, Map<string, number>>();
	const kinds = new WeakMap<WebGLTexture, MemoryKind>();

	const target = (t: number) =>
		t >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && t <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
			? gl.TEXTURE_CUBE_MAP
			: t;
	const texKind = (t: number, format: string, layers: number): MemoryKind => {
		if (t === gl.TEXTURE_CUBE_MAP) return "reflections";
		if (format.startsWith("depth") && layers > 1) return "shadows";
		return "frame";
	};
	const record = (texture: WebGLTexture, kind: MemoryKind) => {
		const sum = [...(levels.get(texture)?.values() ?? [])].reduce((n, b) => n + b, 0);
		memory.add(texture, kinds.get(texture) ?? kind, sum);
	};

	const bindTexture = gl.bindTexture.bind(gl);
	gl.bindTexture = (t, texture) => {
		bound.set(t, texture);
		bindTexture(t, texture);
	};
	const storage = (
		t: number,
		mips: number,
		internal: number,
		w: number,
		h: number,
		layers: number,
	) => {
		const texture = bound.get(t);
		if (!texture) return;
		const format = glFormat(internal);
		const faces = t === gl.TEXTURE_CUBE_MAP ? 6 : 1;
		levels.set(texture, new Map([["all", textureBytes(format, w, h, layers * faces, mips)]]));
		record(texture, texKind(t, format, layers * faces));
	};
	const storage2D = gl.texStorage2D.bind(gl);
	gl.texStorage2D = (t, mips, internal, w, h) => {
		storage2D(t, mips, internal, w, h);
		storage(t, mips, internal, w, h, 1);
	};
	const storage3D = gl.texStorage3D.bind(gl);
	gl.texStorage3D = (t, mips, internal, w, h, d) => {
		storage3D(t, mips, internal, w, h, d);
		storage(t, mips, internal, w, h, d);
	};
	// texImage2D: a level of a face at a time, or an image's level 0 with
	// generateMipmap after; counted as the level given, the mips added by
	// generateMipmap below.
	const image2D = gl.texImage2D.bind(gl) as (...args: unknown[]) => void;
	(gl as { texImage2D: unknown }).texImage2D = (...args: unknown[]) => {
		image2D(...args);
		const [t, level, internal] = args as [number, number, number];
		const texture = bound.get(target(t));
		if (!texture) return;
		let w: number;
		let h: number;
		if (typeof args[3] === "number" && typeof args[4] === "number" && args.length >= 9) {
			w = args[3] as number;
			h = args[4] as number;
		} else {
			const source = args[args.length - 1] as { width?: number; height?: number } | null;
			w = source?.width ?? 0;
			h = source?.height ?? 0;
		}
		const map = levels.get(texture) ?? new Map<string, number>();
		map.set(`${t}:${level}`, textureBytes(glFormat(internal), w, h));
		levels.set(texture, map);
		// Filled from an image: an image, a material's texture or a Sky's.
		if (args.length < 9) kinds.set(texture, "images");
		record(texture, texKind(target(t), glFormat(internal), 1));
	};
	// Filled by parts after its storage: the material textures' array, a Sky's faces.
	const filled = (t: number) => {
		const texture = bound.get(target(t));
		if (!texture || kinds.get(texture) === "images") return;
		kinds.set(texture, "images");
		record(texture, "images");
	};
	const sub2D = gl.texSubImage2D.bind(gl) as (...args: unknown[]) => void;
	(gl as { texSubImage2D: unknown }).texSubImage2D = (...args: unknown[]) => {
		sub2D(...args);
		filled(args[0] as number);
	};
	const sub3D = gl.texSubImage3D.bind(gl) as (...args: unknown[]) => void;
	(gl as { texSubImage3D: unknown }).texSubImage3D = (...args: unknown[]) => {
		sub3D(...args);
		filled(args[0] as number);
	};
	const generateMipmap = gl.generateMipmap.bind(gl);
	gl.generateMipmap = (t) => {
		generateMipmap(t);
		const texture = bound.get(t);
		const map = texture ? levels.get(texture) : undefined;
		if (!texture || !map || map.has("all")) return;
		// A full chain is a third more than its top level.
		for (const [key, bytes] of map) if (key.endsWith(":0")) map.set(`${key}:mips`, bytes / 3);
		record(texture, "frame");
	};
	const deleteTexture = gl.deleteTexture.bind(gl);
	gl.deleteTexture = (texture) => {
		if (texture) memory.remove(texture);
		deleteTexture(texture);
	};

	const bindRenderbuffer = gl.bindRenderbuffer.bind(gl);
	gl.bindRenderbuffer = (t, rb) => {
		renderbuffer = rb;
		bindRenderbuffer(t, rb);
	};
	const rbStorage = gl.renderbufferStorage.bind(gl);
	gl.renderbufferStorage = (t, internal, w, h) => {
		rbStorage(t, internal, w, h);
		if (renderbuffer) memory.add(renderbuffer, "frame", textureBytes(glFormat(internal), w, h));
	};
	const rbStorageMs = gl.renderbufferStorageMultisample.bind(gl);
	gl.renderbufferStorageMultisample = (t, samples, internal, w, h) => {
		rbStorageMs(t, samples, internal, w, h);
		if (renderbuffer)
			memory.add(
				renderbuffer,
				"frame",
				textureBytes(glFormat(internal), w, h, 1, 1, Math.max(1, samples)),
			);
	};
	const deleteRenderbuffer = gl.deleteRenderbuffer.bind(gl);
	gl.deleteRenderbuffer = (rb) => {
		if (rb) memory.remove(rb);
		deleteRenderbuffer(rb);
	};

	const bindBuffer = gl.bindBuffer.bind(gl);
	gl.bindBuffer = (t, buffer) => {
		boundBuffer.set(t, buffer);
		bindBuffer(t, buffer);
	};
	const bufferData = gl.bufferData.bind(gl) as (...args: unknown[]) => void;
	(gl as { bufferData: unknown }).bufferData = (...args: unknown[]) => {
		bufferData(...args);
		const [t, data] = args as [number, number | ArrayBufferView | ArrayBuffer | null];
		const buffer = boundBuffer.get(t);
		if (!buffer) return;
		const bytes =
			typeof data === "number"
				? data
				: data && "byteLength" in data
					? // bufferData(target, view, usage, srcOffset, length): the part sent.
						args.length >= 5 && typeof args[4] === "number" && ArrayBuffer.isView(data)
						? (args[4] as number) *
							((data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1)
						: data.byteLength
					: 0;
		const kind = t === gl.ARRAY_BUFFER || t === gl.ELEMENT_ARRAY_BUFFER ? "meshes" : "buffers";
		memory.add(buffer, kind, bytes);
	};
	const deleteBuffer = gl.deleteBuffer.bind(gl);
	gl.deleteBuffer = (buffer) => {
		if (buffer) memory.remove(buffer);
		deleteBuffer(buffer);
	};
}

/** Bytes as the panel says them: MB to one place under 10, whole above; KB below 1 MB. */
export function memoryText(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${mb < 10 ? mb.toFixed(1) : Math.round(mb).toLocaleString("en")} MB`;
}

/** A report's line: the total, then each kind, largest first. */
export function memoryLine(use: MemoryUse): string {
	const kinds = use.kinds.map((k) => `${MEMORY_KINDS[k.kind]} ${memoryText(k.bytes)}`).join(", ");
	return `GPU memory (estimate): ${memoryText(use.total)}${kinds ? ` (${kinds})` : ""}`;
}

/** The panel's rows: the total, then each kind. */
export function memoryRows(use: MemoryUse): [string, string][] {
	return [
		["GPU memory (estimate)", memoryText(use.total)],
		...use.kinds.map((k): [string, string] => [MEMORY_KINDS[k.kind], memoryText(k.bytes)]),
	];
}
