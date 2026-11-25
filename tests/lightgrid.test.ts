/**
 * The light grid: the setting's finest cell, where each cascade stands as
 * the eye moves, and how many samples a cell averages.
 */

import { describe, expect, it } from "vitest";

import {
	autoLightGrid,
	LIGHT_CELL,
	LIGHT_GRID_CELLS,
	lightGridCell,
	lightGridOrigin,
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

	it("centres a cascade on the eye, its corner on whole cells", () => {
		const at = lightGridOrigin([100, 20, -50], 8, null);
		for (const v of at) expect(Math.abs(v % 8)).toBe(0);
		const extent = 8 * LIGHT_GRID_CELLS;
		[100, 20, -50].forEach((e, a) =>
			expect(Math.abs(e - (at[a] + extent / 2))).toBeLessThanOrEqual(8),
		);
	});

	it("stays while the eye is in its middle half, and moves once it leaves", () => {
		const extent = 8 * LIGHT_GRID_CELLS;
		const at = lightGridOrigin([0, 0, 0], 8, null);
		expect(lightGridOrigin([extent / 8, 0, 0], 8, at)).toEqual(at);
		expect(lightGridOrigin([extent / 2, 0, 0], 8, at)).not.toEqual(at);
	});

	/** Each sample one lighting cell or less: its lights are never another sample's too. */
	it("averages samples a lighting cell apart at most", () => {
		expect(lightGridSamples(8)).toBe(1);
		expect(lightGridSamples(16)).toBe(1);
		expect(lightGridSamples(32)).toBe(2);
		expect(lightGridSamples(128)).toBe(128 / LIGHT_CELL);
	});
});
