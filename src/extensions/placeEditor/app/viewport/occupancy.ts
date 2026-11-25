/**
 * What parts fill of the world, in cells OCC_CELL studs a side: each cell
 * the share of it the solid parts' boxes take up, 0 to 255. The light
 * grid's finest cascade reads it (see WebGpuView's GRID_FILL): a part
 * between a cell and a light blocks the light by what it fills of the
 * cells on the way, and a cell partly inside a part keeps the light of
 * only the rest, as Studio's Soft voxels do (25 Nov 2026 captures: a
 * bench's blocky shadow, a room's corner darker).
 *
 * Only the parts' boxes are kept, in buckets OCC_BUCKET studs a side; a
 * region's cells are worked out when they are asked for, from the boxes
 * that reach it. So the cost goes with the parts near the camera, not the
 * place's: walking every cell of every part first, a large place took
 * seconds, and a task that long let a frame's canvas expire before it was
 * sent.
 */

import type { PlaceScene } from "../../core/scene.js";
import { SCENE_KINDS, SCENE_STRIDE } from "../../core/scene.js";

/** A cell's side, in studs: the light grid's finest, and Studio's Soft voxels'. */
export const OCC_CELL = 4;
/** The cells round the finest cascade the GPU holds, a side: its 32 and 16 more each way, for paths to lights past its edge. */
export const OCC_SIZE = 64;
/** The cells past the finest cascade's edge, each way. */
export const OCC_MARGIN = 16;
/** The cells a path to a light is stepped through, at most: a light's Range reaches 60 studs. */
export const OCC_STEPS = 16;
/** A piece of the occupancy window to upload: where it goes in the texture, its size, and its cells. */
export interface OccupancyWrite {
	to: number[];
	size: number[];
	bytes: Uint8Array;
}

/**
 * What to upload to move the occupancy window, OCC_SIZE cells a side round
 * the finest light grid cascade, from its lowest cell `was` to `at`: whole
 * on a first upload or a jump past it, otherwise a slab for each axis it
 * moved along, as the light grid's (lightGridMove). Each cell is kept where
 * its place in the world falls, wrapped round along all three axes, so a
 * piece is split where an axis wraps and each is one block of the texture.
 * Shared by both renderers.
 */
export function occupancyWrites(
	occ: Occupancy,
	was: readonly number[] | null,
	at: readonly number[],
): OccupancyWrite[] {
	const n = OCC_SIZE;
	const regions: { min: number[]; count: number[] }[] = [];
	if (!was || [0, 1, 2].some((a) => Math.abs(at[a] - was[a]) >= n)) {
		regions.push({ min: [...at], count: [n, n, n] });
	} else {
		for (const a of [0, 1, 2]) {
			const step = at[a] - was[a];
			if (step === 0) continue;
			const min = [...at];
			const count = [n, n, n];
			min[a] = step > 0 ? was[a] + n : at[a];
			count[a] = Math.abs(step);
			regions.push({ min, count });
		}
	}
	const wrap = (v: number) => ((v % n) + n) % n;
	const out: OccupancyWrite[] = [];
	for (const { min, count } of regions) {
		const pieces = (a: number) => {
			const start = wrap(min[a]);
			const first = Math.min(count[a], n - start);
			return first < count[a]
				? [
						{ from: 0, to: start, len: first },
						{ from: first, to: 0, len: count[a] - first },
					]
				: [{ from: 0, to: start, len: count[a] }];
		};
		for (const px of pieces(0))
			for (const py of pieces(1))
				for (const pz of pieces(2)) {
					const size = [px.len, py.len, pz.len];
					out.push({
						to: [px.to, py.to, pz.to],
						size,
						bytes: occ.region([min[0] + px.from, min[1] + py.from, min[2] + pz.from], size),
					});
				}
	}
	return out;
}

/** A bucket's side, in studs: a box is listed in each it reaches. */
const OCC_BUCKET = 64;
/** A box reaching more buckets than this a side is kept apart, looked at for every region. */
const OCC_WIDE = 4;

/**
 * A box in studs: its lowest and highest corner; for a turned part, its
 * axes as well (each the part's size along it), and how much of its box the
 * part's shape fills.
 */
export interface OccBox {
	min: readonly number[];
	max: readonly number[];
	/** The part's three axes as columns, each scaled to its size along it, nine numbers; none, square to the world. */
	axes?: readonly number[];
	/** The share of its box the shape fills: a wedge half. */
	fill?: number;
}

/**
 * How much of its box each kind of part fills. MeshParts are left out: a
 * mesh's box is mostly air round it (a hull, a wing), and taken as solid
 * it darkened and blocked every cell round a dropship (25 Nov 2026).
 */
const SHAPE_FILL: Partial<Record<(typeof SCENE_KINDS)[number], number>> = {
	block: 1,
	wedge: 0.5,
	cornerWedge: 1 / 3,
	cylinder: Math.PI / 4,
	ball: Math.PI / 6,
};

/** Numbers kept a box: its lowest and highest corner, its middle, its axes inverted (rows), its fill, and whether it is turned. */
const BOX = 6 + 3 + 9 + 2;

export class Occupancy {
	private boxes: number[] = [];
	private buckets = new Map<string, number[]>();
	/** Boxes too large to list by bucket. */
	private wide: number[] = [];

	/** The solid parts of a scene, each as the box it is turned in, MeshParts aside. */
	static fromScene(scene: PlaceScene): Occupancy {
		const occ = new Occupancy();
		const min = [0, 0, 0];
		const max = [0, 0, 0];
		const axes = new Array<number>(9);
		for (const kind of SCENE_KINDS) {
			const fill = SHAPE_FILL[kind];
			if (fill === undefined) continue;
			const { data, count } = scene.kinds[kind];
			for (let r = 0; r < count; r++) {
				const o = r * SCENE_STRIDE;
				let ok = true;
				for (let k = 0; k < 9; k++) axes[k] = data[o + k];
				for (let a = 0; a < 3; a++) {
					const half =
						0.5 * (Math.abs(data[o + a]) + Math.abs(data[o + 3 + a]) + Math.abs(data[o + 6 + a]));
					const at = data[o + 9 + a];
					if (!Number.isFinite(at) || !Number.isFinite(half)) ok = false;
					min[a] = at - half;
					max[a] = at + half;
				}
				if (ok) occ.add({ min, max, axes, fill });
			}
		}
		return occ;
	}

	/** A box: each cell it reaches gains the share of it the part fills, to full at most. */
	add(box: OccBox): void {
		const i = this.boxes.length / BOX;
		const mid = [0, 1, 2].map((a) => (box.min[a] + box.max[a]) / 2);
		const size = [0, 1, 2].map((a) => box.max[a] - box.min[a]);
		const axes = box.axes ?? [size[0], 0, 0, 0, size[1], 0, 0, 0, size[2]];
		// Square to the world: its share of each cell worked out exactly.
		const turned = [1, 2, 3, 5, 6, 7].some((k) => Math.abs(axes[k]) > 1e-4);
		this.boxes.push(
			...box.min,
			...box.max,
			...mid,
			...inverseRows(axes),
			box.fill ?? 1,
			turned ? 1 : 0,
		);
		const lo = box.min.map((v) => Math.floor(v / OCC_BUCKET));
		const hi = box.max.map((v) => Math.floor(v / OCC_BUCKET));
		if (hi.some((h, a) => h - lo[a] >= OCC_WIDE)) {
			this.wide.push(i);
			return;
		}
		for (let x = lo[0]; x <= hi[0]; x++)
			for (let y = lo[1]; y <= hi[1]; y++)
				for (let z = lo[2]; z <= hi[2]; z++) {
					const key = `${x},${y},${z}`;
					const list = this.buckets.get(key);
					if (list) list.push(i);
					else this.buckets.set(key, [i]);
				}
	}

	/** What parts fill of cell (x, y, z), 0 to 1. */
	at(x: number, y: number, z: number): number {
		return this.region([x, y, z], [1, 1, 1])[0] / 255;
	}

	/**
	 * The cells from `min`, `count` along x, y and z, as bytes, x fastest,
	 * then y, then z: as a 3D texture's rows and images take them. Each the
	 * share of it the parts reaching it fill, to full at most: a part square
	 * to the world exactly, a turned one by eight points in each cell.
	 */
	region(min: readonly number[], count: readonly number[]): Uint8Array {
		const [nx, ny, nz] = count;
		const fill = new Float32Array(nx * ny * nz);
		const lo = min.map((c) => c * OCC_CELL);
		const hi = min.map((c, a) => (c + count[a]) * OCC_CELL);
		// The boxes that may reach the region: those in its buckets, and the wide ones.
		const seen = new Set<number>(this.wide);
		const blo = lo.map((v) => Math.floor(v / OCC_BUCKET));
		const bhi = hi.map((v) => Math.floor((v - 1e-6) / OCC_BUCKET));
		for (let x = blo[0]; x <= bhi[0]; x++)
			for (let y = blo[1]; y <= bhi[1]; y++)
				for (let z = blo[2]; z <= bhi[2]; z++)
					for (const i of this.buckets.get(`${x},${y},${z}`) ?? []) seen.add(i);
		const b = this.boxes;
		const quarter = OCC_CELL / 4;
		for (const i of seen) {
			const o = i * BOX;
			// The cells of the region the box reaches.
			const c0 = [0, 1, 2].map((a) =>
				Math.max(0, Math.floor((Math.max(b[o + a], lo[a]) - lo[a]) / OCC_CELL)),
			);
			const c1 = [0, 1, 2].map((a) =>
				Math.min(count[a] - 1, Math.ceil((Math.min(b[o + 3 + a], hi[a]) - lo[a]) / OCC_CELL) - 1),
			);
			if (c1.some((v, a) => v < c0[a])) continue;
			const shape = b[o + 18];
			if (b[o + 19] < 0.5) {
				const share = (a: number, c: number) => {
					const from = lo[a] + c * OCC_CELL;
					return (
						Math.max(0, Math.min(b[o + 3 + a], from + OCC_CELL) - Math.max(b[o + a], from)) /
						OCC_CELL
					);
				};
				for (let z = c0[2]; z <= c1[2]; z++) {
					const sz = share(2, z) * shape;
					for (let y = c0[1]; y <= c1[1]; y++) {
						const syz = sz * share(1, y);
						const row = (z * ny + y) * nx;
						for (let x = c0[0]; x <= c1[0]; x++) fill[row + x] += syz * share(0, x);
					}
				}
				continue;
			}
			// Turned: eight points a cell, each inside the part's own box or not.
			const inside = (px: number, py: number, pz: number) => {
				const dx = px - b[o + 6];
				const dy = py - b[o + 7];
				const dz = pz - b[o + 8];
				for (let r = 0; r < 3; r++) {
					const q = o + 9 + r * 3;
					if (Math.abs(b[q] * dx + b[q + 1] * dy + b[q + 2] * dz) > 0.5) return false;
				}
				return true;
			};
			for (let z = c0[2]; z <= c1[2]; z++)
				for (let y = c0[1]; y <= c1[1]; y++) {
					const row = (z * ny + y) * nx;
					for (let x = c0[0]; x <= c1[0]; x++) {
						const cx = lo[0] + x * OCC_CELL;
						const cy = lo[1] + y * OCC_CELL;
						const cz = lo[2] + z * OCC_CELL;
						let n = 0;
						for (let s = 0; s < 8; s++) {
							const px = cx + quarter * (s & 1 ? 3 : 1);
							const py = cy + quarter * (s & 2 ? 3 : 1);
							const pz = cz + quarter * (s & 4 ? 3 : 1);
							if (inside(px, py, pz)) n++;
						}
						fill[row + x] += (n / 8) * shape;
					}
				}
		}
		const out = new Uint8Array(fill.length);
		for (let k = 0; k < fill.length; k++) out[k] = Math.round(Math.min(1, fill[k]) * 255);
		return out;
	}
}

/**
 * A part's axes (columns c0, c1, c2, each scaled to its size along it)
 * inverted, as rows: each row dotted with a point's offset from the middle
 * gives where along that axis it is, -0.5 to 0.5 inside. The rows are the
 * cross products of the other two columns over the determinant.
 */
function inverseRows(m: readonly number[]): number[] {
	const c0 = [m[0], m[1], m[2]];
	const c1 = [m[3], m[4], m[5]];
	const c2 = [m[6], m[7], m[8]];
	const cross = (u: number[], v: number[]) => [
		u[1] * v[2] - u[2] * v[1],
		u[2] * v[0] - u[0] * v[2],
		u[0] * v[1] - u[1] * v[0],
	];
	const r0 = cross(c1, c2);
	const r1 = cross(c2, c0);
	const r2 = cross(c0, c1);
	const det = c0[0] * r0[0] + c0[1] * r0[1] + c0[2] * r0[2];
	if (Math.abs(det) < 1e-12) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
	return [...r0, ...r1, ...r2].map((v) => v / det);
}
