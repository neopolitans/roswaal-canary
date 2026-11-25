/**
 * The occupancy window's coarse level (1.1.0-canary.115): each 2 x 2 x 2
 * block of cells the most any of them is filled, kept from the writes as
 * they are uploaded, so a path to a light steps past an empty block unread.
 */

import { describe, expect, it } from "vitest";
import {
	OCC_COARSE_SIZE,
	OCC_SIZE,
	OccupancyCoarse,
	type OccupancyWrite,
} from "../src/extensions/placeEditor/app/viewport/occupancy.js";

const n = OCC_SIZE;
const at = (x: number, y: number, z: number) => (z * n + y) * n + x;

/** The whole window, empty but for the cells given. */
const whole = (cells: [number, number, number, number][]): OccupancyWrite => {
	const bytes = new Uint8Array(n ** 3);
	for (const [x, y, z, v] of cells) bytes[at(x, y, z)] = v;
	return { to: [0, 0, 0], size: [n, n, n], bytes };
};

/** A coarse write's value at a block, or undefined outside it. */
const block = (w: OccupancyWrite, x: number, y: number, z: number) => {
	const [lx, ly, lz] = [x - w.to[0], y - w.to[1], z - w.to[2]];
	if (lx < 0 || ly < 0 || lz < 0 || lx >= w.size[0] || ly >= w.size[1] || lz >= w.size[2])
		return undefined;
	return w.bytes[(lz * w.size[1] + ly) * w.size[0] + lx];
};

describe("the occupancy window's coarse level", () => {
	it("is each block's most, and nothing where its cells are empty", () => {
		const coarse = new OccupancyCoarse();
		const [out] = coarse.apply([
			whole([
				[5, 6, 7, 90],
				[4, 6, 7, 200],
			]),
		]);
		expect(out.size).toEqual([OCC_COARSE_SIZE, OCC_COARSE_SIZE, OCC_COARSE_SIZE]);
		expect(block(out, 2, 3, 3)).toBe(200);
		expect(block(out, 3, 3, 3)).toBe(0);
		expect(out.bytes.filter((v) => v > 0).length).toBe(1);
	});

	it("keeps the cells it was given before, for a block a later slab only half covers", () => {
		const coarse = new OccupancyCoarse();
		coarse.apply([whole([[10, 0, 0, 50]])]);
		// A slab one cell thick at x 11, empty: its block still holds x 10's.
		const slab: OccupancyWrite = { to: [11, 0, 0], size: [1, n, n], bytes: new Uint8Array(n * n) };
		const [out] = coarse.apply([slab]);
		expect(out.to).toEqual([5, 0, 0]);
		expect(out.size).toEqual([1, OCC_COARSE_SIZE, OCC_COARSE_SIZE]);
		expect(block(out, 5, 0, 0)).toBe(50);
		// And emptied once x 10 is written empty too.
		const both: OccupancyWrite = {
			to: [10, 0, 0],
			size: [2, n, n],
			bytes: new Uint8Array(2 * n * n),
		};
		expect(block(coarse.apply([both])[0], 5, 0, 0)).toBe(0);
	});
});
