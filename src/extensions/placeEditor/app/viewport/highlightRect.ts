/**
 * Where on the screen a place's Highlights can draw: the boxes of the parts
 * they cover, and the rectangle round those boxes as the camera sees them.
 * The outline's passes run inside it alone, not over the whole canvas: three
 * full-canvas passes for a handful of parts cost an A12X iPad most of its
 * frame (Highlights station, 17 frames a second; 1.1.0-canary.144).
 */

import { SCENE_STRIDE } from "../../core/scene.js";

/** Floats a box: its three axes, each a whole side, then its middle, as a scene row's first twelve words. */
export const BOX_FLOATS = 12;

/** Rows of one mesh, and how far that mesh reaches from the middle on each axis. */
export interface BoxRows {
	data: Float32Array;
	count: number;
	/** Half the box's size, in the row's units: 0.5 each way for every built-in shape. */
	reach?: readonly [number, number, number];
}

const reaches = new WeakMap<Float32Array, [number, number, number]>();

/**
 * How far a mesh's vertices go from its middle on each axis, at six floats
 * a vertex (position, then normal). A MeshPart's fills the unit box; a
 * SpecialMesh's keeps its own size and offset, so it can reach past it.
 */
export function meshReach(vertices: Float32Array): [number, number, number] {
	const kept = reaches.get(vertices);
	if (kept) return kept;
	const r: [number, number, number] = [0, 0, 0];
	for (let i = 0; i + 2 < vertices.length; i += 6)
		for (let a = 0; a < 3; a++) r[a] = Math.max(r[a], Math.abs(vertices[i + a]));
	reaches.set(vertices, r);
	return r;
}

/**
 * The boxes of the rows whose id is one of `ids`, from any number of row
 * sets, each axis stretched to its mesh's reach: a part in two sets is kept
 * twice, which only costs a projection.
 */
export function highlightBoxes(sets: Iterable<BoxRows>, ids: ReadonlySet<number>): Float32Array {
	if (ids.size === 0) return new Float32Array(0);
	const out: number[] = [];
	for (const { data, count, reach } of sets) {
		if (count === 0) continue;
		const k = reach ? reach.map((r) => 2 * r) : [1, 1, 1];
		const words = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
		for (let i = 0; i < count; i++) {
			// A row's id: its 14th word (see scene.ts).
			if (!ids.has(words[i * SCENE_STRIDE + 13])) continue;
			const row = i * SCENE_STRIDE;
			for (let a = 0; a < 3; a++)
				for (let c = 0; c < 3; c++) out.push(data[row + a * 3 + c] * k[a]);
			out.push(data[row + 9], data[row + 10], data[row + 11]);
		}
	}
	return new Float32Array(out);
}

/** A rectangle of the canvas, in whole pixels from its top left; x1 and y1 not in it. */
export interface PixelRect {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/**
 * The pixels the boxes cover under `viewProj` (column major, as the
 * renderers upload it), widened by `pad` pixels and kept to the canvas.
 * A part's mesh fills its box (vertices within half its size each way), so
 * its eight corners bound it. null where none is in front of the camera;
 * the whole canvas where one reaches behind the eye, as its corners then
 * say nothing of where it crosses the screen.
 */
export function screenRect(
	boxes: Float32Array,
	viewProj: ArrayLike<number>,
	width: number,
	height: number,
	pad: number,
): PixelRect | null {
	const m = viewProj;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	const whole = { x0: 0, y0: 0, x1: width, y1: height };
	for (let b = 0; b + BOX_FLOATS <= boxes.length; b += BOX_FLOATS) {
		let behind = 0;
		let front = 0;
		let bx0 = Number.POSITIVE_INFINITY;
		let by0 = Number.POSITIVE_INFINITY;
		let bx1 = Number.NEGATIVE_INFINITY;
		let by1 = Number.NEGATIVE_INFINITY;
		for (let c = 0; c < 8; c++) {
			const sx = c & 1 ? 0.5 : -0.5;
			const sy = c & 2 ? 0.5 : -0.5;
			const sz = c & 4 ? 0.5 : -0.5;
			const x = boxes[b + 9] + boxes[b] * sx + boxes[b + 3] * sy + boxes[b + 6] * sz;
			const y = boxes[b + 10] + boxes[b + 1] * sx + boxes[b + 4] * sy + boxes[b + 7] * sz;
			const z = boxes[b + 11] + boxes[b + 2] * sx + boxes[b + 5] * sy + boxes[b + 8] * sz;
			const w = m[3] * x + m[7] * y + m[11] * z + m[15];
			if (w <= 1e-4) {
				behind++;
				continue;
			}
			front++;
			const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
			const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
			bx0 = Math.min(bx0, nx);
			bx1 = Math.max(bx1, nx);
			by0 = Math.min(by0, ny);
			by1 = Math.max(by1, ny);
		}
		if (front === 0) continue;
		if (behind > 0) return whole;
		minX = Math.min(minX, bx0);
		maxX = Math.max(maxX, bx1);
		minY = Math.min(minY, by0);
		maxY = Math.max(maxY, by1);
	}
	if (minX > maxX) return null;
	// Device coordinates to pixels: x across, y from the top.
	const x0 = Math.max(0, Math.floor((minX * 0.5 + 0.5) * width) - pad);
	const x1 = Math.min(width, Math.ceil((maxX * 0.5 + 0.5) * width) + pad);
	const y0 = Math.max(0, Math.floor((0.5 - maxY * 0.5) * height) - pad);
	const y1 = Math.min(height, Math.ceil((0.5 - minY * 0.5) * height) + pad);
	if (x0 >= x1 || y0 >= y1) return null;
	return { x0, y0, x1, y1 };
}
