/**
 * The view's field of view, from the place's Camera, holding the angle
 * FieldOfViewMode says as the view is resized, as Studio does.
 */

import { describe, expect, it } from "vitest";

import { FOV, viewFovY } from "../src/extensions/placeEditor/app/viewport/view.js";

const deg = (rad: number) => (rad * 180) / Math.PI;

describe("the view's field of view", () => {
	it("is 70 degrees vertical without a Camera", () => {
		expect(viewFovY(undefined, 1.5)).toBe(FOV);
	});

	it("is FieldOfView, vertical, whatever the view's shape", () => {
		expect(deg(viewFovY({ fieldOfView: 90 }, 1.5))).toBeCloseTo(90);
		expect(deg(viewFovY({ fieldOfView: 90, fieldOfViewMode: 0 }, 0.5))).toBeCloseTo(90);
	});

	it("keeps the diagonal angle across the corners for Diagonal", () => {
		const aspect = 16 / 9;
		const v = viewFovY({ fieldOfView: 70, fieldOfViewMode: 1, diagonalFieldOfView: 90 }, aspect);
		const diagonal = 2 * Math.atan(Math.tan(v / 2) * Math.hypot(1, aspect));
		expect(deg(diagonal)).toBeCloseTo(90);
	});

	it("keeps the angle along the longer side for MaxAxis", () => {
		const wide = viewFovY({ fieldOfView: 70, fieldOfViewMode: 2, maxAxisFieldOfView: 100 }, 2);
		expect(deg(2 * Math.atan(Math.tan(wide / 2) * 2))).toBeCloseTo(100);
		// Taller than wide: the vertical side is the longer.
		expect(
			deg(viewFovY({ fieldOfView: 70, fieldOfViewMode: 2, maxAxisFieldOfView: 100 }, 0.6)),
		).toBeCloseTo(100);
	});

	it("falls back to FieldOfView where the mode's angle is missing, within 1 to 120", () => {
		expect(deg(viewFovY({ fieldOfView: 60, fieldOfViewMode: 1 }, 1.5))).toBeCloseTo(60);
		expect(deg(viewFovY({ fieldOfView: 170 }, 1.5))).toBeCloseTo(120);
	});
});
