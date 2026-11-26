/**
 * Which of a block of lighting cells are worth filling: those within a few
 * cells of a part. A pixel reads the cells next to the surface it is on
 * (half a cell out, blended between the eight round it), and a cell's
 * second step averages the cells round it, so a cell further from every
 * part than that is never read: the open air over a place, empty ground,
 * the middle of a large room. About half a block, round a dense town's
 * streets (26 Nov 2026); more in open places.
 *
 * Each refill marks them in a mask the fill shaders read, which give the
 * rest the open sky without sampling the maps; and each slice of the block
 * (one y) is drawn only over the rectangle holding its marked cells, not at
 * all where it has none (1.1.0-canary.136, for a tablet's refills as the
 * camera moves).
 *
 * Every part counts, MeshParts, unions and parts seen through too: the box
 * each is turned in. The boxes are kept in buckets, so a refill looks only
 * at those near its block.
 */

import type { PlaceScene } from "../../core/scene.js";
import { SCENE_KINDS, SCENE_STRIDE } from "../../core/scene.js";

/** Each part's box: its lowest corner then its highest, six numbers a part. */
export function sceneBoxes(scene: PlaceScene): Float32Array {
	let n = scene.unions?.length ?? 0;
	for (const set of [scene.kinds, scene.translucent])
		for (const kind of SCENE_KINDS) n += set[kind].count;
	const out = new Float32Array(n * 6);
	let i = 0;
	// A row's first twelve floats: each axis times its size, then its middle.
	const put = (data: ArrayLike<number>, o: number) => {
		for (let a = 0; a < 3; a++) {
			const half =
				0.5 * (Math.abs(data[o + a]) + Math.abs(data[o + 3 + a]) + Math.abs(data[o + 6 + a]));
			const at = data[o + 9 + a];
			if (!Number.isFinite(at) || !Number.isFinite(half)) return;
			out[i * 6 + a] = at - half;
			out[i * 6 + 3 + a] = at + half;
		}
		i++;
	};
	for (const u of scene.unions ?? []) put(u.box, 0);
	for (const set of [scene.kinds, scene.translucent])
		for (const kind of SCENE_KINDS) {
			const { data, count } = set[kind];
			for (let r = 0; r < count; r++) put(data, r * SCENE_STRIDE);
		}
	return out.subarray(0, i * 6);
}

/** A bucket's side, in studs. */
const BUCKET = 128;
/** A box over this many buckets on an axis is listed apart, not in each. */
const WIDE = 8;

/** A scene's boxes, and which reach each bucket. */
export interface BoxIndex {
	boxes: Float32Array;
	buckets: Map<string, number[]>;
	/** Boxes too large to list by bucket. */
	wide: number[];
}

export function boxIndex(boxes: Float32Array): BoxIndex {
	const buckets = new Map<string, number[]>();
	const wide: number[] = [];
	for (let i = 0; i < boxes.length; i += 6) {
		const lo = [0, 1, 2].map((a) => Math.floor(boxes[i + a] / BUCKET));
		const hi = [0, 1, 2].map((a) => Math.floor(boxes[i + 3 + a] / BUCKET));
		if (hi.some((h, a) => h - lo[a] >= WIDE)) {
			wide.push(i);
			continue;
		}
		for (let x = lo[0]; x <= hi[0]; x++)
			for (let y = lo[1]; y <= hi[1]; y++)
				for (let z = lo[2]; z <= hi[2]; z++) {
					const key = `${x},${y},${z}`;
					const list = buckets.get(key);
					if (list) list.push(i);
					else buckets.set(key, [i]);
				}
	}
	return { boxes, buckets, wide };
}

const indexKept = new WeakMap<PlaceScene, BoxIndex>();

/** A scene's boxes in buckets, worked out once a scene. */
export function boxesOf(scene: PlaceScene): BoxIndex {
	let index = indexKept.get(scene);
	if (!index) {
		index = boxIndex(sceneBoxes(scene));
		indexKept.set(scene, index);
	}
	return index;
}

/** A slice's cells worth filling: x from x0 to x1 and z from z0 to z1, inclusive. */
export interface CellSpan {
	x0: number;
	z0: number;
	x1: number;
	z1: number;
}

/** A block's cells worth filling: a byte a cell, 1 or 0, x fastest, then z, then y; and each slice's rectangle. */
export interface CellBlock {
	mask: Uint8Array;
	spans: (CellSpan | null)[];
	/** How many are marked. */
	marked: number;
}

/**
 * A block of cells, `dims` along x, y and z from `origin`, each marked where
 * it is within `pad` cells of a part's box. The mask's bytes are laid out as
 * the cells' 3D textures are: x across, z down, y the slice.
 */
export function cellBlock(
	index: BoxIndex,
	origin: readonly number[],
	dims: readonly [number, number, number],
	cell: number,
	pad: number,
): CellBlock {
	const [nx, ny, nz] = dims;
	const mask = new Uint8Array(nx * ny * nz);
	const spans: (CellSpan | null)[] = Array.from({ length: ny }, () => null);
	const reach = (a: number) => origin[a] + dims[a] * cell;
	// The boxes that may reach the block: its buckets', and the wide ones.
	const seen = new Set<number>(index.wide);
	const lo = [0, 1, 2].map((a) => Math.floor((origin[a] - pad * cell) / BUCKET));
	const hi = [0, 1, 2].map((a) => Math.floor((reach(a) + pad * cell) / BUCKET));
	for (let x = lo[0]; x <= hi[0]; x++)
		for (let y = lo[1]; y <= hi[1]; y++)
			for (let z = lo[2]; z <= hi[2]; z++)
				for (const i of index.buckets.get(`${x},${y},${z}`) ?? []) seen.add(i);
	const b = index.boxes;
	const from = [0, 0, 0];
	const to = [0, 0, 0];
	let marked = 0;
	for (const i of seen) {
		let inside = true;
		for (let a = 0; a < 3; a++) {
			from[a] = Math.max(0, Math.floor((b[i + a] - origin[a]) / cell) - pad);
			to[a] = Math.min(dims[a] - 1, Math.floor((b[i + 3 + a] - origin[a]) / cell) + pad);
			if (from[a] > to[a]) inside = false;
		}
		if (!inside) continue;
		for (let y = from[1]; y <= to[1]; y++) {
			for (let z = from[2]; z <= to[2]; z++) {
				const row = (y * nz + z) * nx;
				for (let x = from[0]; x <= to[0]; x++) {
					if (mask[row + x] === 0) {
						mask[row + x] = 1;
						marked++;
					}
				}
			}
			const s = spans[y];
			if (!s) spans[y] = { x0: from[0], z0: from[2], x1: to[0], z1: to[2] };
			else {
				if (from[0] < s.x0) s.x0 = from[0];
				if (from[2] < s.z0) s.z0 = from[2];
				if (to[0] > s.x1) s.x1 = to[0];
				if (to[2] > s.z1) s.z1 = to[2];
			}
		}
	}
	return { mask, spans, marked };
}

/** Several slices' spans as one: the rectangle holding all of them, or null where none has cells. */
export function unionSpan(spans: readonly (CellSpan | null)[]): CellSpan | null {
	let out: CellSpan | null = null;
	for (const s of spans) {
		if (!s) continue;
		if (!out) out = { ...s };
		else {
			out.x0 = Math.min(out.x0, s.x0);
			out.z0 = Math.min(out.z0, s.z0);
			out.x1 = Math.max(out.x1, s.x1);
			out.z1 = Math.max(out.z1, s.z1);
		}
	}
	return out;
}

/**
 * The spans of a block with a cell's border round it (the first step's), as
 * the block inside it (the second step's): each cell's rectangle holding the
 * three slices round it, a cell in, and clamped.
 */
export function innerSpans(
	spans: readonly (CellSpan | null)[],
	dims: readonly [number, number, number],
): (CellSpan | null)[] {
	return Array.from({ length: dims[1] }, (_, y) => {
		const s = unionSpan(spans.slice(y, y + 3));
		if (!s) return null;
		const x0 = Math.max(0, s.x0 - 1);
		const z0 = Math.max(0, s.z0 - 1);
		const x1 = Math.min(dims[0] - 1, s.x1 - 1);
		const z1 = Math.min(dims[2] - 1, s.z1 - 1);
		return x0 <= x1 && z0 <= z1 ? { x0, z0, x1, z1 } : null;
	});
}

/**
 * How far from a part, in cells, a cell is still worth filling: a pixel
 * reads up to two cells from the surface it is on, and the second step's
 * average reaches one cell more.
 */
export const CELL_PAD = 3;
/** The coarse cells': read two cells out, with no second step. */
export const COARSE_PAD = 2;
