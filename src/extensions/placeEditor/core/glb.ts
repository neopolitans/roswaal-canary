/**
 * A binary glTF file (.glb) read as meshes, one for each of its nodes that
 * has one: triangles with positions, normals and texture coordinates, moved
 * into the file's world space by the node and its parents.
 *
 * Only what a static model needs. Materials, animation, skins, morph targets
 * and compressed geometry (Draco, meshopt) are not read; a file that needs
 * an extension to be read at all is refused.
 *
 * glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */

import type { FileMesh } from "./mesh.js";

export class GlbError extends Error {}

/** One node's mesh, in the file's world space and units (glTF's are metres, Y up). */
export interface GlbPart {
	name: string;
	mesh: FileMesh;
	min: [number, number, number];
	max: [number, number, number];
}

interface Accessor {
	bufferView?: number;
	byteOffset?: number;
	componentType: number;
	normalized?: boolean;
	count: number;
	type: string;
}

interface BufferView {
	buffer: number;
	byteOffset?: number;
	byteLength: number;
	byteStride?: number;
}

interface Primitive {
	attributes: Record<string, number>;
	indices?: number;
	mode?: number;
}

interface GltfNode {
	name?: string;
	mesh?: number;
	children?: number[];
	matrix?: number[];
	translation?: number[];
	rotation?: number[];
	scale?: number[];
}

interface Gltf {
	asset?: { version?: string };
	extensionsRequired?: string[];
	scene?: number;
	scenes?: { nodes?: number[] }[];
	nodes?: GltfNode[];
	meshes?: { name?: string; primitives: Primitive[] }[];
	accessors?: Accessor[];
	bufferViews?: BufferView[];
}

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const TRIANGLES = 4;
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** A column-major 4x4 matrix, as glTF writes them. */
type Mat4 = number[];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
	const out = new Array<number>(16).fill(0);
	for (let c = 0; c < 4; c++)
		for (let r = 0; r < 4; r++)
			for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
	return out;
}

function localMatrix(node: GltfNode): Mat4 {
	if (node.matrix?.length === 16) return node.matrix;
	const [tx, ty, tz] = node.translation ?? [0, 0, 0];
	const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
	const [sx, sy, sz] = node.scale ?? [1, 1, 1];
	// Translation × rotation × scale, columns first.
	return [
		(1 - 2 * (y * y + z * z)) * sx,
		2 * (x * y + z * w) * sx,
		2 * (x * z - y * w) * sx,
		0,
		2 * (x * y - z * w) * sy,
		(1 - 2 * (x * x + z * z)) * sy,
		2 * (y * z + x * w) * sy,
		0,
		2 * (x * z + y * w) * sz,
		2 * (y * z - x * w) * sz,
		(1 - 2 * (x * x + y * y)) * sz,
		0,
		tx,
		ty,
		tz,
		1,
	];
}

/** Every element of an accessor as numbers, normalised integers scaled to 0..1 or -1..1. */
function readAccessor(
	gltf: Gltf,
	bin: DataView,
	index: number,
): { width: number; values: Float64Array } {
	const acc = gltf.accessors?.[index];
	if (!acc) throw new GlbError(`no accessor ${index}`);
	const width = WIDTH[acc.type];
	const size = BYTES[acc.componentType];
	if (!width || !size) throw new GlbError(`accessor ${index}: unknown type`);
	const values = new Float64Array(acc.count * width);
	// An accessor with no buffer view is all zeros (sparse accessors are not read).
	if (acc.bufferView === undefined) return { width, values };
	const view = gltf.bufferViews?.[acc.bufferView];
	if (!view || view.buffer !== 0)
		throw new GlbError(`accessor ${index}: no buffer view in the file`);
	const stride = view.byteStride ?? width * size;
	const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
	if (start + stride * (acc.count - 1) + width * size > bin.byteLength)
		throw new GlbError(`accessor ${index} runs past the file's data`);
	for (let i = 0; i < acc.count; i++)
		for (let c = 0; c < width; c++) {
			const at = start + i * stride + c * size;
			let v: number;
			switch (acc.componentType) {
				case 5120:
					v = bin.getInt8(at);
					if (acc.normalized) v = Math.max(v / 127, -1);
					break;
				case 5121:
					v = bin.getUint8(at);
					if (acc.normalized) v /= 255;
					break;
				case 5122:
					v = bin.getInt16(at, true);
					if (acc.normalized) v = Math.max(v / 32767, -1);
					break;
				case 5123:
					v = bin.getUint16(at, true);
					if (acc.normalized) v /= 65535;
					break;
				case 5125:
					v = bin.getUint32(at, true);
					break;
				default:
					v = bin.getFloat32(at, true);
			}
			values[i * width + c] = v;
		}
	return { width, values };
}

/** A node's mesh, its primitives joined, moved by `world`. Null where it has no triangles. */
function nodeMesh(gltf: Gltf, bin: DataView, mesh: number, world: Mat4): FileMesh | null {
	const prims = gltf.meshes?.[mesh]?.primitives ?? [];
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	// Normals move by the inverse transpose; for the rotations and scales a model's nodes carry,
	// the upper 3x3 with each axis divided by its squared length does the same.
	const axes = [0, 1, 2].map((c) => [world[c * 4], world[c * 4 + 1], world[c * 4 + 2]]);
	const len2 = axes.map((a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2] || 1);
	// A mirroring node turns its triangles inside out: their order is flipped back.
	const det =
		axes[0][0] * (axes[1][1] * axes[2][2] - axes[1][2] * axes[2][1]) -
		axes[1][0] * (axes[0][1] * axes[2][2] - axes[0][2] * axes[2][1]) +
		axes[2][0] * (axes[0][1] * axes[1][2] - axes[0][2] * axes[1][1]);
	for (const prim of prims) {
		if ((prim.mode ?? TRIANGLES) !== TRIANGLES) continue;
		const pos = prim.attributes.POSITION;
		if (pos === undefined) continue;
		const p = readAccessor(gltf, bin, pos);
		const count = p.values.length / 3;
		const n =
			prim.attributes.NORMAL !== undefined ? readAccessor(gltf, bin, prim.attributes.NORMAL) : null;
		const t =
			prim.attributes.TEXCOORD_0 !== undefined
				? readAccessor(gltf, bin, prim.attributes.TEXCOORD_0)
				: null;
		const base = positions.length / 3;
		for (let v = 0; v < count; v++) {
			const [x, y, z] = [p.values[v * 3], p.values[v * 3 + 1], p.values[v * 3 + 2]];
			for (let r = 0; r < 3; r++)
				positions.push(world[r] * x + world[4 + r] * y + world[8 + r] * z + world[12 + r]);
			if (n) {
				const [nx, ny, nz] = [n.values[v * 3], n.values[v * 3 + 1], n.values[v * 3 + 2]];
				const m = [0, 1, 2].map(
					(r) =>
						(axes[0][r] * nx) / len2[0] + (axes[1][r] * ny) / len2[1] + (axes[2][r] * nz) / len2[2],
				);
				const l = Math.hypot(m[0], m[1], m[2]) || 1;
				normals.push(m[0] / l, m[1] / l, m[2] / l);
			} else normals.push(0, 1, 0);
			if (t) uvs.push(t.values[v * 2], t.values[v * 2 + 1]);
			else uvs.push(0, 0);
		}
		const tri =
			prim.indices !== undefined
				? Array.from(readAccessor(gltf, bin, prim.indices).values)
				: Array.from({ length: count }, (_, i) => i);
		for (let i = 0; i + 2 < tri.length; i += 3) {
			const [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]];
			if (a >= count || b >= count || c >= count)
				throw new GlbError("a triangle names a vertex that is not there");
			if (det < 0) indices.push(base + a, base + c, base + b);
			else indices.push(base + a, base + b, base + c);
		}
	}
	if (indices.length === 0) return null;
	return {
		version: "glTF",
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		uvs: new Float32Array(uvs),
		indices: new Uint32Array(indices),
	};
}

/** Each node of the file's scene that has a mesh, in the file's world space. */
export function readGlb(bytes: Uint8Array): GlbPart[] {
	const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.byteLength < 20 || data.getUint32(0, true) !== MAGIC)
		throw new GlbError("not a .glb file");
	if (data.getUint32(4, true) !== 2) throw new GlbError("not glTF 2.0");
	let gltf: Gltf | null = null;
	let bin: DataView = new DataView(new ArrayBuffer(0));
	for (let at = 12; at + 8 <= Math.min(bytes.byteLength, data.getUint32(8, true)); ) {
		const length = data.getUint32(at, true);
		const type = data.getUint32(at + 4, true);
		const body = bytes.subarray(at + 8, at + 8 + length);
		if (body.byteLength !== length) throw new GlbError("a chunk runs past the end of the file");
		if (type === CHUNK_JSON && !gltf) gltf = JSON.parse(new TextDecoder().decode(body)) as Gltf;
		else if (type === CHUNK_BIN && bin.byteLength === 0)
			bin = new DataView(body.buffer, body.byteOffset, body.byteLength);
		at += 8 + length;
	}
	if (!gltf) throw new GlbError("no JSON chunk");
	if (gltf.extensionsRequired?.length)
		throw new GlbError(`needs ${gltf.extensionsRequired.join(", ")}, which are not read`);
	const nodes = gltf.nodes ?? [];
	const roots =
		gltf.scenes?.[gltf.scene ?? 0]?.nodes ??
		// No scene: every node no other names as a child.
		nodes.map((_, i) => i).filter((i) => !nodes.some((n) => n.children?.includes(i)));
	const parts: GlbPart[] = [];
	const seen = new Set<number>();
	const walk = (index: number, parent: Mat4) => {
		const node = nodes[index];
		if (!node || seen.has(index)) return;
		seen.add(index);
		const world = multiply(parent, localMatrix(node));
		if (node.mesh !== undefined) {
			const mesh = nodeMesh(gltf as Gltf, bin, node.mesh, world);
			if (mesh) {
				const min: [number, number, number] = [Infinity, Infinity, Infinity];
				const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
				for (let v = 0; v < mesh.positions.length; v += 3)
					for (let a = 0; a < 3; a++) {
						min[a] = Math.min(min[a], mesh.positions[v + a]);
						max[a] = Math.max(max[a], mesh.positions[v + a]);
					}
				parts.push({
					name: node.name ?? gltf?.meshes?.[node.mesh]?.name ?? `Node${index}`,
					mesh,
					min,
					max,
				});
			}
		}
		for (const child of node.children ?? []) walk(child, world);
	};
	for (const root of roots) walk(root, IDENTITY);
	return parts;
}
