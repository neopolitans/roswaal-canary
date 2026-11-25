/**
 * The light grid: the setting's finest cell, where each cascade stands as
 * the eye moves, and how many samples a cell averages.
 */

import { describe, expect, it } from "vitest";

import {
	autoLightGrid,
	LIGHT_CELL,
	LIGHT_GRID_CELLS,
	LIGHT_GRID_SLACK,
	lightGridCell,
	lightGridMove,
	lightGridSamples,
	SOFT_LIGHT_CELL,
} from "../src/extensions/placeEditor/app/viewport/view.js";

describe("the light grid", () => {
	it("is off, a cell, or Automatic", () => {
		expect(lightGridCell("off")).toBeNull();
		expect(lightGridCell(undefined)).toBe("auto");
		expect(lightGridCell("auto")).toBe("auto");
		expect(lightGridCell("4")).toBe(4);
		expect(lightGridCell("32")).toBe(32);
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

	it("fills it all again for a jump past it, or the eye going up out of its middle", () => {
		const was = lightGridMove([0, 0, 0], 8, null).origin;
		expect(lightGridMove([1000, 0, 0], 8, was).fill[0].count).toEqual([32, 32, 32]);
		expect(lightGridMove([0, 8 * 9, 0], 8, was).fill[0].count).toEqual([32, 32, 32]);
		expect(lightGridMove([0, 8 * 7, 0], 8, was).fill).toEqual([]);
	});

	/** Each sample one lighting cell or less: its lights are never another sample's too. */
	it("averages samples a lighting cell apart at most", () => {
		expect(lightGridSamples(8)).toBe(1);
		expect(lightGridSamples(16)).toBe(1);
		expect(lightGridSamples(32)).toBe(2);
		expect(lightGridSamples(128)).toBe(128 / LIGHT_CELL);
	});
});
