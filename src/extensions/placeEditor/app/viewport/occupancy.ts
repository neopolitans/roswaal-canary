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
/** A bucket's side, in studs: a box is listed in each it reaches. */
const OCC_BUCKET = 64;
/** A box reaching more buckets than this a side is kept apart, looked at for every region. */
const OCC_WIDE = 4;

/** A box in studs: its lowest and highest corner. */
export interface OccBox {
	min: readonly number[];
	max: readonly number[];
}

export class Occupancy {
	/** Each box's lowest and highest corner, six numbers a box. */
	private boxes: number[] = [];
	private buckets = new Map<string, number[]>();
	/** Boxes too large to list by bucket. */
	private wide: number[] = [];

	/** The solid parts of a scene, each as its box. */
	static fromScene(scene: PlaceScene): Occupancy {
		const occ = new Occupancy();
		const min = [0, 0, 0];
		const max = [0, 0, 0];
		for (const kind of SCENE_KINDS) {
			const { data, count } = scene.kinds[kind];
			for (let r = 0; r < count; r++) {
				const o = r * SCENE_STRIDE;
				let ok = true;
				for (let a = 0; a < 3; a++) {
					const half =
						0.5 * (Math.abs(data[o + a]) + Math.abs(data[o + 3 + a]) + Math.abs(data[o + 6 + a]));
					const at = data[o + 9 + a];
					if (!Number.isFinite(at) || !Number.isFinite(half)) ok = false;
					min[a] = at - half;
					max[a] = at + half;
				}
				if (ok) occ.add({ min, max });
			}
		}
		return occ;
	}

	/** A box: each cell it reaches gains the share of it the box fills, to full at most. */
	add(box: OccBox): void {
		const i = this.boxes.length / 6;
		this.boxes.push(...box.min, ...box.max);
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
	 * share of it the boxes reaching it fill, to full at most.
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
		for (const i of seen) {
			const o = i * 6;
			// The cells of the region the box reaches.
			const c0 = [0, 1, 2].map((a) =>
				Math.max(0, Math.floor((Math.max(b[o + a], lo[a]) - lo[a]) / OCC_CELL)),
			);
			const c1 = [0, 1, 2].map((a) =>
				Math.min(count[a] - 1, Math.ceil((Math.min(b[o + 3 + a], hi[a]) - lo[a]) / OCC_CELL) - 1),
			);
			if (c1.some((v, a) => v < c0[a])) continue;
			const share = (a: number, c: number) => {
				const from = lo[a] + c * OCC_CELL;
				return (
					Math.max(0, Math.min(b[o + 3 + a], from + OCC_CELL) - Math.max(b[o + a], from)) / OCC_CELL
				);
			};
			for (let z = c0[2]; z <= c1[2]; z++) {
				const sz = share(2, z);
				for (let y = c0[1]; y <= c1[1]; y++) {
					const syz = sz * share(1, y);
					const row = (z * ny + y) * nx;
					for (let x = c0[0]; x <= c1[0]; x++) fill[row + x] += syz * share(0, x);
				}
			}
		}
		const out = new Uint8Array(fill.length);
		for (let k = 0; k < fill.length; k++) out[k] = Math.round(Math.min(1, fill[k]) * 255);
		return out;
	}
}
