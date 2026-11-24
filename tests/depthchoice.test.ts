/**
 * Automatic's depth path, measured: the two alternate frame by frame, and
 * the faster is kept, full unless lean is clearly faster.
 */

import { describe, expect, it } from "vitest";

import {
	DEPTH_SAMPLES,
	DepthChoice,
} from "../src/extensions/placeEditor/app/viewport/depthChoice.js";

function measure(full: number, lean: number): DepthChoice {
	const choice = new DepthChoice();
	for (let i = 0; i < DEPTH_SAMPLES * 2 + 4 && !choice.chosen; i++) {
		const path = choice.next();
		// A camera whose cost drifts as it moves: both paths see the same drift.
		const drift = Math.sin(i / 5) * 2;
		choice.record(path, (path === "full" ? full : lean) + drift);
	}
	return choice;
}

describe("Automatic's depth path", () => {
	it("alternates the two while it measures", () => {
		const choice = new DepthChoice();
		expect([choice.next(), choice.next(), choice.next()]).toEqual(["full", "lean", "full"]);
	});

	it("keeps lean where it is clearly faster, as on a tile-based GPU in a dense place", () => {
		const choice = measure(16, 13.3);
		expect(choice.chosen).toBe("lean");
		expect(choice.medians()?.lean).toBeLessThan(choice.medians()!.full);
	});

	it("keeps full where lean is slower, or barely faster", () => {
		expect(measure(6, 9).chosen).toBe("full");
		expect(measure(10, 9.8).chosen).toBe("full");
	});

	it("measures again once reset", () => {
		const choice = measure(16, 13);
		choice.reset();
		expect(choice.chosen).toBeNull();
		expect(choice.medians()).toBeNull();
	});
});
