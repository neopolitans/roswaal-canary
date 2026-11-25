/**
 * The light grid filled again only where changed lights reach (1.1.0-canary.112):
 * which lights differ between two lists, and the cells of a cascade each
 * one's reach takes in, rather than all three cascades whole.
 */

import { describe, expect, it } from "vitest";
import {
	LIGHT_CHANGES_MOST,
	LIGHT_GRID_CELLS,
	lightChanges,
	lightGridDirty,
} from "../src/extensions/placeEditor/app/viewport/view.js";
import { LIGHT_STRIDE } from "../src/extensions/placeEditor/core/scene.js";

/** A PointLight at `at` reaching `range`, as sceneLights writes one. */
const point = (at: number[], range: number, colour = 1): number[] => {
	const row = new Array<number>(LIGHT_STRIDE).fill(0);
	row.splice(0, 4, at[0], at[1], at[2], range);
	row.splice(4, 4, colour, colour, colour, 0);
	return row;
};

describe("which lights changed", () => {
	it("finds none between the same lights", () => {
		const lights = [...point([0, 5, 0], 16), ...point([40, 5, 0], 8)];
		expect(lightChanges(lights, [...lights])).toEqual([]);
	});

	it("gives a moved light's reach where it was and where it is", () => {
		const was = [...point([0, 5, 0], 16), ...point([40, 5, 0], 8)];
		const now = [...point([0, 5, 0], 16), ...point([60, 5, 0], 8)];
		const boxes = lightChanges(was, now) ?? [];
		expect(boxes).toHaveLength(2);
		expect(boxes).toContainEqual({ min: [32, -3, -8], max: [48, 13, 8] });
		expect(boxes).toContainEqual({ min: [52, -3, -8], max: [68, 13, 8] });
	});

	it("tells two lights the same apart when one goes", () => {
		const one = point([0, 5, 0], 16);
		expect(lightChanges([...one, ...one], one)).toHaveLength(1);
	});

	it("counts a SurfaceLight's face in its reach", () => {
		const face = point([0, 0, 0], 10);
		face.splice(12, 3, 4, 0, 0);
		face.splice(16, 3, 0, 0, 3);
		expect(lightChanges([], face)).toEqual([{ min: [-17, -17, -17], max: [17, 17, 17] }]);
	});

	it("fills whole where there is nothing to compare with, or too many changed", () => {
		expect(lightChanges(undefined, point([0, 0, 0], 8))).toBeNull();
		const many = Array.from({ length: LIGHT_CHANGES_MOST + 1 }, (_, i) =>
			point([i * 10, 0, 0], 8),
		).flat();
		expect(lightChanges([], many)).toBeNull();
	});
});

describe("the cells a changed light reaches", () => {
	it("is its reach in cells, a cell more each way, within the cascade", () => {
		// A cascade of 4-stud cells from cell -16 each way; a light at 0 reaching 8.
		const region = lightGridDirty([-16, -16, -16], 4, { min: [-8, -8, -8], max: [8, 8, 8] });
		expect(region).toEqual({ min: [-3, -3, -3], count: [7, 7, 7] });
	});

	it("stops at the cascade's edge", () => {
		const region = lightGridDirty([0, 0, 0], 4, { min: [-20, 10, 10], max: [10, 20, 20] });
		expect(region?.min[0]).toBe(0);
		const top = lightGridDirty([0, 0, 0], 4, { min: [100, 0, 0], max: [200, 4, 4] });
		expect(top && top.min[0] + top.count[0]).toBe(LIGHT_GRID_CELLS);
	});

	it("is none where the light reaches nothing of it", () => {
		expect(lightGridDirty([0, 0, 0], 4, { min: [500, 0, 0], max: [520, 8, 8] })).toBeNull();
	});
});
