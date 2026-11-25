/**
 * The light grid's steps filled a budget a frame (1.1.0-canary.115): a
 * step's slabs cut into pieces, filled over the frames after, the cascade
 * moving only once they are all filled.
 */

import { describe, expect, it } from "vitest";
import {
	GRID_FILL_BUDGET,
	GridFillPlan,
	LIGHT_GRID_CELLS,
	lightGridMove,
	splitRegion,
} from "../src/extensions/placeEditor/app/viewport/view.js";

const cells = (r: { count: number[] }) => r.count.reduce((n, c) => n * c, 1);

describe("a region cut to a budget", () => {
	it("keeps a region that fits whole", () => {
		const r = { min: [0, 0, 0], count: [2, 32, 32] };
		expect(splitRegion(r, 2048)).toEqual([r]);
	});

	it("cuts a slab across its longest side, every cell once, none over the budget", () => {
		const r = { min: [5, -16, 40], count: [3, 32, 32] };
		const pieces = splitRegion(r, 2048);
		expect(pieces.length).toBe(2);
		expect(pieces.every((p) => cells(p) <= 2048)).toBe(true);
		expect(pieces.reduce((n, p) => n + cells(p), 0)).toBe(cells(r));
		expect(pieces[0].min).toEqual([5, -16, 40]);
		expect(pieces[1].min[1] + pieces[1].count[1]).toBe(16);
	});
});

describe("a step filled over frames", () => {
	it("goes on being read where it was until every cell it takes in is filled", () => {
		const plan = new GridFillPlan();
		// Three 4-stud cells along x, past the slack: a slab 3 cells thick.
		const move = lightGridMove([13, 0, 0], 4, [-16, -16, -16]);
		const step = move.fill.reduce((n, r) => n + cells(r), 0);
		expect(step).toBeGreaterThan(GRID_FILL_BUDGET);
		plan.start(0, move.origin, move.fill);
		expect(plan.target(0)).toEqual(move.origin);
		let filled = 0;
		let frames = 0;
		let done: number[] | null = null;
		while (!done) {
			const part = plan.take(0, GRID_FILL_BUDGET);
			expect(part.cells).toBeLessThanOrEqual(GRID_FILL_BUDGET);
			filled += part.cells;
			done = part.done;
			frames++;
			expect(frames).toBeLessThan(10);
		}
		expect(done).toEqual(move.origin);
		expect(filled).toBe(step);
		expect(frames).toBeGreaterThan(1);
		expect(plan.busy(0)).toBe(false);
	});

	it("takes nothing with no budget left, and forgets a step dropped or reset", () => {
		const plan = new GridFillPlan();
		plan.start(1, [0, 0, 0], [{ min: [32, 0, 0], count: [1, LIGHT_GRID_CELLS, LIGHT_GRID_CELLS] }]);
		expect(plan.take(1, 0)).toEqual({ jobs: [], cells: 0, done: null });
		plan.drop(1);
		expect(plan.busy(1)).toBe(false);
		plan.start(2, [0, 0, 0], [{ min: [32, 0, 0], count: [1, 2, 2] }]);
		plan.reset();
		expect(plan.busy(2)).toBe(false);
	});
});
