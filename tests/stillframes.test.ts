/**
 * Frames drawn only for the view's own animation, the camera still: every
 * display frame or one in two, three or four, as Particle animation rate
 * says; and the refresh measured without the ones drawn late.
 */

import { describe, expect, it } from "vitest";

import { RefreshMeter } from "../src/extensions/placeEditor/app/viewport/pacing.js";
import { stillSkip } from "../src/extensions/placeEditor/app/viewport/view.js";

const PERIOD = 1000 / 60;

describe("Particle animation rate", () => {
	it("is Half on a touch screen and Full on a computer when Automatic", () => {
		expect(stillSkip("auto", true)).toBe(1);
		expect(stillSkip("auto", false)).toBe(0);
		expect(stillSkip(undefined, true)).toBe(1);
	});

	it("lets one, two or three display frames go by for Half, Third and Quarter", () => {
		expect(stillSkip("full", true)).toBe(0);
		expect(stillSkip("half", false)).toBe(1);
		expect(stillSkip("third", false)).toBe(2);
		expect(stillSkip("quarter", false)).toBe(3);
	});

	/** Measured from late frames' gaps, the refresh doubled, and halving them went on doubling it. */
	it("leaves frames drawn late out of the refresh's measure", () => {
		const meter = new RefreshMeter();
		let now = 0;
		for (let f = 0; f < 30; f++) meter.drawn((now += PERIOD));
		for (let f = 0; f < 200; f++) meter.drawn((now += PERIOD * 2), false);
		expect(meter.period()).toBeCloseTo(PERIOD);
		// Counted as the refresh, they would have doubled it.
		const counted = new RefreshMeter();
		for (let f = 0; f < 200; f++) counted.drawn((now += PERIOD * 2));
		expect(counted.period()).toBeCloseTo(PERIOD * 2);
	});
});
