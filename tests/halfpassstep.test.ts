/**
 * The half-size pass's size: half the render, but above 100% no fewer pixels
 * than the screen has points, so light objects' and the sky's light keep
 * surfaces sharp at 150%; Quarter as chosen.
 */

import { describe, expect, it } from "vitest";

import { halfPassStep } from "../src/extensions/placeEditor/app/viewport/view.js";

// An iPad Mini held upright: 744 points across, 1,488 pixels.
const POINTS = 744;

describe("the half-size pass's step", () => {
	it("is half the render at Native and at 100% and below, as before", () => {
		expect(halfPassStep(2, 1488, POINTS)).toBe(2);
		expect(halfPassStep(2, 744, POINTS)).toBe(2);
		expect(halfPassStep(2, 558, POINTS)).toBe(2);
	});

	/** 150%: 1,116 pixels across. Half was 558, fewer than the 744 points; now 744. */
	it("works out no fewer pixels than the screen has points above 100%", () => {
		const step = halfPassStep(2, 1116, POINTS);
		expect(step).toBeCloseTo(1.5);
		expect(1116 / step).toBeCloseTo(POINTS);
	});

	it("leaves Quarter as chosen", () => {
		expect(halfPassStep(4, 1116, POINTS)).toBe(4);
	});

	it("is half the render where the screen's points are not known", () => {
		expect(halfPassStep(2, 1116, 0)).toBe(2);
	});
});
