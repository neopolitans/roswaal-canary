/**
 * The GPU memory estimate: a texture's and a buffer's bytes from how they
 * are made, sorted by what they are for, and taken off when destroyed.
 */

import { describe, expect, it } from "vitest";

import {
	canvasBytes,
	GpuMemory,
	gpuTextureKind,
	memoryLine,
	memoryRows,
	memoryText,
	textureBytes,
	trackWebGl2,
	trackWebGpu,
} from "../src/extensions/placeEditor/app/viewport/gpuMemory.js";

const MB = 1024 * 1024;

describe("a texture's bytes", () => {
	it("counts each texel, layer, sample and mip level", () => {
		expect(textureBytes("rgba8unorm", 1024, 1024)).toBe(4 * MB);
		expect(textureBytes("rgba16float", 1024, 1024)).toBe(8 * MB);
		expect(textureBytes("depth32float", 2048, 2048, 4)).toBe(64 * MB);
		expect(textureBytes("bgra8unorm", 100, 100, 1, 1, 4)).toBe(160_000);
		// A full chain is about a third more than its top level.
		expect(
			textureBytes("rgba8unorm", 256, 256, 1, 9) / textureBytes("rgba8unorm", 256, 256),
		).toBeCloseTo(4 / 3, 2);
	});

	it("estimates the canvas's own buffers, and WebGL2's own MSAA", () => {
		expect(canvasBytes(1000, 500)).toBe(4_000_000);
		expect(canvasBytes(1000, 500, 4)).toBe(4_000_000 + 16_000_000);
	});

	it("says a size in KB or MB", () => {
		expect(memoryText(512)).toBe("1 KB");
		expect(memoryText(300 * 1024)).toBe("300 KB");
		expect(memoryText(2.25 * MB)).toBe("2.3 MB");
		expect(memoryText(1500 * MB)).toBe("1,500 MB");
	});
});

describe("what a WebGPU texture is for", () => {
	const RENDER = 0x10;
	const BIND = 0x04;
	const COPY_DST = 0x02;
	it("tells the sun's maps, the reflection cube, images and frame targets apart", () => {
		expect(
			gpuTextureKind({ size: [2048, 2048, 4], format: "depth32float", usage: RENDER | BIND }),
		).toBe("shadows");
		expect(
			gpuTextureKind({ size: [128, 128, 6], format: "rgba16float", usage: RENDER | BIND }),
		).toBe("reflections");
		expect(
			gpuTextureKind({ size: [512, 512], format: "rgba8unorm", usage: BIND | COPY_DST | RENDER }),
		).toBe("images");
		expect(
			gpuTextureKind({ size: { width: 800, height: 600 }, format: "bgra8unorm", usage: RENDER }),
		).toBe("frame");
		expect(gpuTextureKind({ size: [800, 600], format: "depth32float", usage: RENDER })).toBe(
			"frame",
		);
	});
});

describe("counting a WebGPU device", () => {
	function fakeDevice() {
		return {
			createTexture: () => ({ destroy() {} }),
			createBuffer: () => ({ destroy() {} }),
		} as unknown as GPUDevice;
	}

	it("adds what it makes, by kind, and takes off what it destroys", () => {
		const memory = new GpuMemory();
		const device = fakeDevice();
		trackWebGpu(device, memory);
		const frame = device.createTexture({ size: [1024, 1024], format: "rgba8unorm", usage: 0x10 });
		device.createTexture({ size: [1024, 1024, 4], format: "depth32float", usage: 0x10 });
		device.createBuffer({ size: 3 * MB, usage: 0x20 | 0x08 });
		device.createBuffer({ size: 256, usage: 0x40 | 0x08 });
		expect(memory.use().kinds).toEqual([
			{ kind: "shadows", bytes: 16 * MB, count: 1 },
			{ kind: "frame", bytes: 4 * MB, count: 1 },
			{ kind: "meshes", bytes: 3 * MB, count: 1 },
			{ kind: "buffers", bytes: 256, count: 1 },
		]);
		frame.destroy();
		expect(memory.use().kinds.find((k) => k.kind === "frame")).toBeUndefined();
		expect(memory.use(1000).total).toBe(16 * MB + 3 * MB + 256 + 1000);
	});
});

describe("counting a WebGL2 context", () => {
	/** As much of WebGL2 as the tracker patches, with its constants. */
	function fakeGl() {
		const made = () => ({});
		return {
			TEXTURE_2D: 0x0de1,
			TEXTURE_2D_ARRAY: 0x8c1a,
			TEXTURE_CUBE_MAP: 0x8513,
			TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515,
			TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851a,
			ARRAY_BUFFER: 0x8892,
			ELEMENT_ARRAY_BUFFER: 0x8893,
			UNIFORM_BUFFER: 0x8a11,
			createTexture: made,
			bindTexture() {},
			texStorage2D() {},
			texStorage3D() {},
			texImage2D() {},
			texSubImage2D() {},
			texSubImage3D() {},
			generateMipmap() {},
			deleteTexture() {},
			bindRenderbuffer() {},
			renderbufferStorage() {},
			renderbufferStorageMultisample() {},
			deleteRenderbuffer() {},
			bindBuffer() {},
			bufferData() {},
			deleteBuffer() {},
		} as unknown as WebGL2RenderingContext & Record<string, number>;
	}

	it("counts storage on whatever is bound, by kind, and takes off what it deletes", () => {
		const memory = new GpuMemory();
		const gl = fakeGl();
		trackWebGl2(gl, memory);
		const RGBA8 = 0x8058;
		const RGBA16F = 0x881a;
		const DEPTH32F = 0x8cac;
		// The sun's maps: a depth array.
		const sun = {} as WebGLTexture;
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, sun);
		gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, DEPTH32F, 1024, 1024, 4);
		// The reflection cube: six faces, with mips.
		const cube = {} as WebGLTexture;
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
		gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, RGBA16F, 128, 128);
		// The material textures: an array filled a layer at a time.
		const looks = {} as WebGLTexture;
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, looks);
		gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, RGBA8, 256, 256, 2);
		(gl.texSubImage3D as (...a: unknown[]) => void)(
			gl.TEXTURE_2D_ARRAY,
			0,
			0,
			0,
			0,
			256,
			256,
			1,
			0,
			0,
			{},
		);
		// An image from a bitmap, mipmapped.
		const image = {} as WebGLTexture;
		gl.bindTexture(gl.TEXTURE_2D, image);
		(gl.texImage2D as (...a: unknown[]) => void)(gl.TEXTURE_2D, 0, 0x1908, 0x1908, 0x1401, {
			width: 512,
			height: 512,
		});
		gl.generateMipmap(gl.TEXTURE_2D);
		// A part's vertices.
		const vertices = {} as WebGLBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(1000), 0x88e4);

		const by = Object.fromEntries(memory.use().kinds.map((k) => [k.kind, k.bytes]));
		expect(by.shadows).toBe(16 * MB);
		expect(by.reflections).toBe(128 * 128 * 6 * 8);
		expect(by.images).toBe(256 * 256 * 2 * 4 + (512 * 512 * 4 * 4) / 3);
		expect(by.meshes).toBe(4000);

		gl.deleteTexture(sun);
		gl.deleteBuffer(vertices);
		const after = Object.fromEntries(memory.use().kinds.map((k) => [k.kind, k.bytes]));
		expect(after.shadows).toBeUndefined();
		expect(after.meshes).toBeUndefined();
	});
});

describe("saying it", () => {
	it("lists the total, then each kind, largest first", () => {
		const use = {
			total: 20 * MB,
			kinds: [
				{ kind: "shadows" as const, bytes: 16 * MB, count: 1 },
				{ kind: "canvas" as const, bytes: 4 * MB, count: 1 },
			],
		};
		expect(memoryRows(use)).toEqual([
			["GPU memory (estimate)", "20 MB"],
			["Shadow and sky maps", "16 MB"],
			["Canvas (estimated)", "4.0 MB"],
		]);
		expect(memoryLine(use)).toBe(
			"GPU memory (estimate): 20 MB (Shadow and sky maps 16 MB, Canvas (estimated) 4.0 MB)",
		);
	});
});
