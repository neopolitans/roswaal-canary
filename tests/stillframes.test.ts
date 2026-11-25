/**
 * Frames drawn only for the view's own animation, the camera still: every
 * other display frame where halved, so a tablet rests between them; and the
 * refresh measured without them.
 */

import { describe, expect, it } from "vitest";

import { RefreshMeter } from "../src/extensions/placeEditor/app/viewport/pacing.js";
import { STILL_SKIP, stillFramesHalved } from "../src/extensions/placeEditor/app/viewport/view.js";

const PERIOD = 1000 / 60;

describe("effects while still", () => {
	it("halves them on a touch screen when Automatic, and as set otherwise", () => {
		expect(stillFramesHalved("auto", true)).toBe(true);
		expect(stillFramesHalved("auto", false)).toBe(false);
		expect(stillFramesHalved(undefined, true)).toBe(true);
		expect(stillFramesHalved("full", true)).toBe(false);
		expect(stillFramesHalved("half", false)).toBe(true);
	});

	it("draws every other display frame", () => {
		expect(STILL_SKIP).toBe(1);
	});

	/** Measured from halved frames' gaps, the refresh doubled, and halving them went on doubling it. */
	it("leaves halved still frames out of the refresh's measure", () => {
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
