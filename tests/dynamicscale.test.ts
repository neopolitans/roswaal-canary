/**
 * Render scale Dynamic: down a step while moving frames do not fit their
 * budget, up once the bigger step would fit with room, at most twice a second.
 */

import { describe, expect, it } from "vitest";

import {
	DYNAMIC_STEPS,
	DynamicScale,
} from "../src/extensions/placeEditor/app/viewport/dynamicScale.js";

const BUDGET = 1000 / 60;

/** A GPU whose frame costs `perShare` ms at the screen's own pixels, scaling with pixels drawn. */
function drive(
	scale: DynamicScale,
	perShare: number,
	frames: number,
	start = 0,
	timed = true,
): number {
	let t = start;
	for (let i = 0; i < frames; i++) {
		t += BUDGET;
		scale.frame(t, perShare * scale.share() ** 2, BUDGET, timed);
	}
	return t;
}

describe("Dynamic render scale", () => {
	it("stays at the screen's own pixels while frames fit", () => {
		const scale = new DynamicScale();
		drive(scale, 10, 300);
		expect(scale.step).toBe(0);
	});

	it("steps down until frames fit, no faster than twice a second", () => {
		const scale = new DynamicScale();
		// 26 ms at native: 75% across (56% of the pixels) is 14.6 ms, which fits.
		let t = drive(scale, 26, 25);
		expect(scale.step).toBe(1);
		t = drive(scale, 26, 10, t);
		expect(scale.step).toBe(1);
		drive(scale, 26, 200, t);
		expect(DYNAMIC_STEPS[scale.step]).toBe(0.75);
	});

	it("steps back up once the bigger step would fit with room", () => {
		const scale = new DynamicScale();
		let t = drive(scale, 26, 200);
		expect(scale.step).toBe(2);
		// The scene grows lighter: 12 ms at native.
		t = drive(scale, 12, 200, t);
		expect(scale.step).toBe(0);
	});

	it("does not climb into a step that would not fit", () => {
		const scale = new DynamicScale();
		drive(scale, 20, 400);
		// 20 ms at native misses; at 87.5% (15.3 ms) it fits, and native's 20 is past 80% of 16.7.
		expect(DYNAMIC_STEPS[scale.step]).toBe(0.875);
	});

	it("without the GPU's times, steps down on missed frames and tries up after three quiet seconds", () => {
		const scale = new DynamicScale();
		let t = 0;
		for (let i = 0; i < 25; i++) {
			t += BUDGET;
			scale.frame(t, BUDGET * 2, BUDGET, false);
		}
		expect(scale.step).toBe(1);
		for (let i = 0; i < 100; i++) {
			t += BUDGET;
			scale.frame(t, BUDGET, BUDGET, false);
		}
		expect(scale.step).toBe(1);
		for (let i = 0; i < 120; i++) {
			t += BUDGET;
			scale.frame(t, BUDGET, BUDGET, false);
		}
		expect(scale.step).toBe(0);
	});

	it("says when it is at either end, where the quality level may act", () => {
		const scale = new DynamicScale();
		expect(scale.atEnd()).toBe(true);
		scale.step = 2;
		expect(scale.atEnd()).toBe(false);
		scale.step = DYNAMIC_STEPS.length - 1;
		expect(scale.atEnd()).toBe(true);
		scale.reset();
		expect(scale.share()).toBe(1);
	});
});

describe("Dynamic optimization", () => {
	it("takes half-size lamp light while frames do not fit, and gives it back with room", async () => {
		const { DynamicSavings } = await import(
			"../src/extensions/placeEditor/app/viewport/dynamicScale.js"
		);
		const savings = new DynamicSavings();
		let t = 0;
		const run = (ms: number, frames: number, mayGiveBack = true) => {
			for (let i = 0; i < frames; i++) {
				t += BUDGET;
				savings.frame(t, ms, BUDGET, true, mayGiveBack);
			}
		};
		run(10, 100);
		expect(savings.off()).toEqual([]);
		run(20, 25);
		expect(savings.off()).toEqual(["fullResLamps"]);
		expect(savings.full()).toBe(true);
		// Room, but the render scale is still lowered: kept.
		run(8, 300, false);
		expect(savings.taken).toBe(1);
		// Room, and not before three seconds since it was taken.
		run(8, 300);
		expect(savings.taken).toBe(0);
	});
});
