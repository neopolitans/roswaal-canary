/**
 * What parts fill of the world, in 4-stud cells, for the light grid's
 * blocking: each cell the share of it the parts' boxes take up.
 */

import { describe, expect, it } from "vitest";

import { OCC_CELL, Occupancy } from "../src/extensions/placeEditor/app/viewport/occupancy.js";

describe("what parts fill", () => {
	it("is the share of each cell a box takes up", () => {
		const occ = new Occupancy();
		// A wall 1 stud thick along x, 8 high, at z 0 to 1.
		occ.add({ min: [0, 0, 0], max: [8, 8, 1] });
		expect(occ.at(0, 0, 0)).toBeCloseTo(0.25, 2);
		expect(occ.at(1, 1, 0)).toBeCloseTo(0.25, 2);
		expect(occ.at(0, 0, 1)).toBe(0);
		expect(occ.at(2, 0, 0)).toBe(0);
	});

	it("adds boxes in one cell, to full at most", () => {
		const occ = new Occupancy();
		occ.add({ min: [0, 0, 0], max: [4, 4, 3] });
		occ.add({ min: [0, 0, 1], max: [4, 4, 4] });
		expect(occ.at(0, 0, 0)).toBe(1);
	});

	it("works below zero as above", () => {
		const occ = new Occupancy();
		occ.add({ min: [-8, -4, -8], max: [-4, 0, -4] });
		expect(occ.at(-2, -1, -2)).toBe(1);
		expect(occ.at(-1, -1, -1)).toBe(0);
	});

	it("gives a region's cells as bytes, x fastest, then y, then z", () => {
		const occ = new Occupancy();
		occ.add({ min: [OCC_CELL, 0, 0], max: [2 * OCC_CELL, OCC_CELL, OCC_CELL] });
		const bytes = occ.region([0, 0, 0], [2, 1, 2]);
		expect([...bytes]).toEqual([0, 255, 0, 0]);
	});
});

describe("what turned parts and shapes fill", () => {
	it("is the part's own box, not the box round it", () => {
		const occ = new Occupancy();
		// A plank 16 long and 1 thick, turned 45 degrees about y, round (0, 2, 0).
		const c = Math.SQRT1_2;
		occ.add({
			min: [-6.01, 0, -6.01],
			max: [6.01, 4, 6.01],
			axes: [16 * c, 0, -16 * c, 0, 4, 0, 1 * c, 0, 1 * c],
		});
		// On the line it runs along, x = -z: filled in part.
		expect(occ.at(0, 0, -1)).toBeGreaterThan(0);
		// Beside it, inside the box round it: empty.
		expect(occ.at(0, 0, 0)).toBe(0);
		// The box round it reaches the corner cell (-2, 0, -2), off the plank: empty.
		expect(occ.at(-2, 0, -2)).toBe(0);
	});

	it("fills a wedge's box by half", () => {
		const occ = new Occupancy();
		occ.add({ min: [0, 0, 0], max: [4, 4, 4], fill: 0.5 });
		expect(occ.at(0, 0, 0)).toBeCloseTo(0.5, 2);
	});
});
