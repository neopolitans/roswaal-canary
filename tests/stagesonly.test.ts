/**
 * A busy benchmark keeps only the GPU's own stage times (1.1.0-canary.116):
 * a renderer with timers still splits its frame by stage, and one without
 * (WebGL2) is not made to wait for its GPU at every stage of every frame,
 * which on an iPad stalled each moving frame for 60 to 137 ms.
 */

import { describe, expect, it } from "vitest";
import { stagesOnly } from "../src/extensions/placeEditor/app/viewport/controller.js";

const facts = (timers: boolean) => ({
	deviceFacts: () => ({ gpu: "test", timers, samples: 1 }),
});

describe("a busy run's stage sink", () => {
	it("throws the waited stages away where the GPU has timers, so its frame is still split", () => {
		const sink = stagesOnly(facts(true));
		expect(typeof sink).toBe("function");
		expect(() => sink?.({})).not.toThrow();
	});

	it("is none where it has no timers, so nothing waits for the GPU at each stage", () => {
		expect(stagesOnly(facts(false))).toBeNull();
	});
});
