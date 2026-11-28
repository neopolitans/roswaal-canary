/**
 * The light grid's cells worth filling (1.1.0-canary.146): those within
 * LIGHT_PAD cells of a part, as a bit a cell in the order each renderer
 * fills them; and whole cascades filled a budget a frame.
 */

import { describe, expect, it } from "vitest";
import {
	boxIndex,
	LIGHT_PAD,
	lightKeepBits,
	lightKeepLayers,
} from "../src/extensions/placeEditor/app/viewport/cellSpans.js";
import {
	GRID_WHOLE_BUDGET,
	GridFillPlan,
	LIGHT_GRID_CELLS,
} from "../src/extensions/placeEditor/app/viewport/view.js";

const bit = (bits: Uint32Array, i: number) => (bits[i >> 5] >>> (i & 31)) & 1;

// One 4-stud part, its box from (40, 0, 40) to (44, 4, 44).
const index = boxIndex(new Float32Array([40, 0, 40, 44, 4, 44]));

describe("the light grid's cells to fill", () => {
	it("are those within LIGHT_PAD cells of a part, x then y then z", () => {
		// A region of 32 x 8 x 32 cells of 4 studs from the world's corner.
		const count = [32, 8, 32];
		const bits = lightKeepBits(index, [0, 0, 0], count, 4);
		const at = (x: number, y: number, z: number) => bit(bits, x + 32 * (y + 8 * z));
		// The part's cells (10 and 11 across, its far face on 11's edge), LIGHT_PAD past them, and one more.
		expect(at(10, 0, 10)).toBe(1);
		expect(at(11 + LIGHT_PAD, 0, 10)).toBe(1);
		expect(at(12 + LIGHT_PAD, 0, 10)).toBe(0);
		expect(at(10, 1 + LIGHT_PAD, 10)).toBe(1);
		expect(at(10, 2 + LIGHT_PAD, 10)).toBe(0);
		// Far off, in the open.
		expect(at(30, 0, 30)).toBe(0);
		expect(at(0, 3, 0)).toBe(0);
	});

	it("are every cell where there is no scene", () => {
		const bits = lightKeepBits(null, [0, 0, 0], [4, 4, 4], 4);
		for (let i = 0; i < 64; i++) expect(bit(bits, i)).toBe(1);
	});

	it("are none where no part is near", () => {
		const bits = lightKeepBits(index, [100, 100, 100], [8, 8, 8], 4);
		expect(bits.every((w) => w === 0)).toBe(true);
	});

	it("for WebGL2's layers, are wrapped round as the grid is", () => {
		// Each layer a word a z texel, a bit an x texel: world cell 10 on texel 10.
		const layers = lightKeepLayers(index, [0, 0, 0], [32, 2, 32], 4, LIGHT_GRID_CELLS);
		expect((layers[0][10] >>> 10) & 1).toBe(1);
		expect((layers[0][30] >>> 30) & 1).toBe(0);
		const moved = lightKeepLayers(index, [-2, 0, -2], [32, 2, 32], 4, LIGHT_GRID_CELLS);
		// World cell 10 is still texel 10: wrapped by the world's cell, not the region's.
		expect((moved[0][10] >>> 10) & 1).toBe(1);
		expect((moved[0][12] >>> 12) & 1).toBe(1);
		expect((moved[0][20] >>> 20) & 1).toBe(0);
	});
});

describe("a whole cascade's fill", () => {
	it("is a whole one, taken a larger budget a frame", () => {
		const plan = new GridFillPlan();
		const n = LIGHT_GRID_CELLS;
		plan.start(0, [5, 5, 5], [{ min: [5, 5, 5], count: [n, n, n] }], true);
		expect(plan.whole(0)).toBe(true);
		const frames: number[] = [];
		for (let i = 0; i < 20 && plan.busy(0); i++) {
			const part = plan.take(0, GRID_WHOLE_BUDGET);
			frames.push(part.cells);
			if (part.done) expect(part.done).toEqual([5, 5, 5]);
		}
		expect(frames.reduce((a, b) => a + b, 0)).toBe(n ** 3);
		expect(frames.length).toBe(n ** 3 / GRID_WHOLE_BUDGET);
		expect(plan.whole(0)).toBe(false);
	});

	it("is not a step's", () => {
		const plan = new GridFillPlan();
		plan.start(1, [0, 0, 0], [{ min: [0, 0, 0], count: [32, 32, 2] }]);
		expect(plan.whole(1)).toBe(false);
		expect(plan.busy(1)).toBe(true);
	});
});
