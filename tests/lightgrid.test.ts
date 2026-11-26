/**
 * The light grid: the setting's finest cell, where each cascade stands as
 * the eye moves, and how many samples a cell averages.
 */

import { describe, expect, it } from "vitest";

import {
	ambientGrid,
	autoLightGrid,
	coarseOrigin,
	LIGHT_CELL,
	LIGHT_GRID_CELLS,
	LIGHT_GRID_SLACK,
	lightGridCell,
	lightGridMove,
	lightGridSamples,
	SKY_COARSE_CELL,
	SKY_COARSE_CELLS,
	SKY_COARSE_SNAP,
	SOFT_LIGHT_CELL,
	TOUCH_LIGHT_CELL,
} from "../src/extensions/placeEditor/app/viewport/view.js";

describe("the light grid", () => {
	it("is off, a cell, or Automatic", () => {
		expect(lightGridCell("off")).toBeNull();
		expect(lightGridCell(undefined)).toBe("auto");
		expect(lightGridCell("auto")).toBe("auto");
		expect(lightGridCell("4")).toBe(4);
		expect(lightGridCell("32")).toBe(32);
	});

	it("is 8-stud cells when Automatic on a touch screen, whatever the style; as set otherwise", () => {
		expect(lightGridCell("auto", true)).toBe(TOUCH_LIGHT_CELL);
		expect(lightGridCell(undefined, true)).toBe(4);
		expect(lightGridCell("4", true)).toBe(4);
		expect(lightGridCell("off", true)).toBeNull();
	});

	it("is Soft's 4-stud cells when Automatic and the place is Soft, otherwise as set", () => {
		expect(autoLightGrid("auto", true)).toBe(SOFT_LIGHT_CELL);
		expect(autoLightGrid("auto", false)).toBeNull();
		expect(autoLightGrid(16, true)).toBe(16);
		expect(autoLightGrid(null, true)).toBeNull();
	});

	it("centres a cascade on the eye in whole cells, filling it all first", () => {
		const move = lightGridMove([100, 20, -50], 8, null);
		expect(move.origin).toEqual([12 - 16, 2 - 16, -7 - 16]);
		expect(move.fill).toEqual([{ min: move.origin, count: [32, 32, 32] }]);
	});

	it("fills nothing for a small step, and only the new edge for a longer one", () => {
		const was = lightGridMove([0, 0, 0], 8, null).origin;
		expect(lightGridMove([8 * LIGHT_GRID_SLACK, 0, 0], 8, was).fill).toEqual([]);
		// Five cells along x: five slices of cells, the ones the eye now reaches.
		const on = lightGridMove([40, 0, 0], 8, was);
		expect(on.origin).toEqual([was[0] + 5, was[1], was[2]]);
		expect(on.fill).toEqual([
			{ min: [was[0] + LIGHT_GRID_CELLS, was[1], was[2]], count: [5, 32, 32] },
		]);
		// Back the other way along z: the slices below.
		const back = lightGridMove([0, 0, -40], 8, was);
		expect(back.fill).toEqual([{ min: [was[0], was[1], was[2] - 5], count: [32, 32, 5] }]);
	});

	it("fills only the new layers going up or down, as across", () => {
		const was = lightGridMove([0, 0, 0], 8, null).origin;
		expect(lightGridMove([0, 8 * LIGHT_GRID_SLACK, 0], 8, was).fill).toEqual([]);
		const up = lightGridMove([0, 8 * 9, 0], 8, was);
		expect(up.origin).toEqual([was[0], was[1] + 9, was[2]]);
		expect(up.fill).toEqual([
			{ min: [was[0], was[1] + LIGHT_GRID_CELLS, was[2]], count: [32, 9, 32] },
		]);
		const down = lightGridMove([0, -8 * 3, 0], 8, was);
		expect(down.fill).toEqual([{ min: [was[0], was[1] - 3, was[2]], count: [32, 3, 32] }]);
	});

	it("fills a slab for each axis a diagonal step moves along", () => {
		const was = lightGridMove([0, 0, 0], 8, null).origin;
		const move = lightGridMove([40, -40, 0], 8, was);
		expect(move.fill.map((r) => r.count)).toEqual([
			[5, 32, 32],
			[32, 5, 32],
		]);
	});

	it("fills it all again for a jump past it", () => {
		const was = lightGridMove([0, 0, 0], 8, null).origin;
		expect(lightGridMove([1000, 0, 0], 8, was).fill[0].count).toEqual([32, 32, 32]);
		expect(lightGridMove([0, -1000, 0], 8, was).fill[0].count).toEqual([32, 32, 32]);
	});

	/** Each sample one lighting cell or less: its lights are never another sample's too. */
	it("averages samples a lighting cell apart at most", () => {
		expect(lightGridSamples(8)).toBe(1);
		expect(lightGridSamples(16)).toBe(1);
		expect(lightGridSamples(32)).toBe(2);
		expect(lightGridSamples(128)).toBe(128 / LIGHT_CELL);
	});
});

describe("Ambient lighting (1.1.0-canary.129)", () => {
	it("is Grid on a touch screen and Realtime elsewhere, unless set", () => {
		expect(ambientGrid(undefined)).toBe(false);
		expect(ambientGrid("auto")).toBe(false);
		expect(ambientGrid("auto", true)).toBe(true);
		expect(ambientGrid("grid")).toBe(true);
		expect(ambientGrid("realtime", true)).toBe(false);
	});
});

describe("the coarse cells (1.1.0-canary.130)", () => {
	const middle = (o: number[]) => o.map((v, a) => v + (SKY_COARSE_CELLS[a] * SKY_COARSE_CELL) / 2);

	it("stand round the eye, their middle on the step's grid", () => {
		expect(middle(coarseOrigin([0, 0, 0]))).toEqual([0, 0, 0]);
		expect(middle(coarseOrigin([1079, 601, -625]))).toEqual([1024, 640, -640]);
		expect(coarseOrigin([1079, 601, -625]).every((v) => v % SKY_COARSE_CELL === 0)).toBe(true);
	});

	it("move only once the eye crosses half a step", () => {
		const at = coarseOrigin([10, 10, 10]);
		expect(coarseOrigin([SKY_COARSE_SNAP / 2 - 1, 10, -SKY_COARSE_SNAP / 2 + 1])).toEqual(at);
		expect(coarseOrigin([SKY_COARSE_SNAP / 2 + 1, 10, 10])).not.toEqual(at);
	});
});
