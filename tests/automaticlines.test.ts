/**
 * Automatic's choices as Inspect shows them: what was measured and chosen in
 * this place, with the times behind each.
 */

import { describe, expect, it } from "vitest";

import {
	type AutomaticChoices,
	automaticLines,
} from "../src/extensions/placeEditor/app/viewport/automaticLines.js";

const base: AutomaticChoices = {
	backend: "WebGPU",
	fellBackWhy: null,
	quality: { auto: true, level: 10 },
	depth: { chosen: null, medians: null, kept: false },
	lamps: { lights: 0, mode: "full" },
	dynamic: null,
};
const lines = (over: Partial<AutomaticChoices>) =>
	Object.fromEntries(
		automaticLines({ ...base, ...over }, (key) => `[${key}]`).map((l) => [l.label, l]),
	);

describe("Automatic's choices", () => {
	it("says the level Automatic is at", () => {
		expect(lines({}).Quality.value).toBe("Automatic · Level 10");
		expect(lines({ quality: { auto: false, level: 15 } }).Quality.value).toBe("Level 15");
	});

	it("says a choice is still to be measured, then what it came to", () => {
		expect(lines({})["Depth path"].value).toBe("Measured as the view moves");
		expect(
			lines({ depth: { chosen: null, medians: { full: 9, lean: 8.5 }, kept: false } })["Depth path"]
				.value,
		).toBe("Measuring");
		const chosen = lines({
			depth: { chosen: "lean", medians: { full: 10.2, lean: 7.5 }, kept: true },
		})["Depth path"];
		expect(chosen.value).toBe("Lean · 2.7 ms faster");
		expect(chosen.detail).toBe("A frame's median: full 10.2 ms, lean 7.5 ms.");
	});

	it("says a depth path was kept from before on this device, with nothing measured now", () => {
		const kept = lines({ depth: { chosen: "lean", medians: null, kept: true } })["Depth path"];
		expect(kept.value).toBe("Lean");
		expect(kept.detail).toBe("Measured on this device before, and kept.");
	});

	/** WebGL2 draws one way: no depth path to choose. */
	it("leaves out the depth path where there is one way", () => {
		expect(lines({ depth: null })["Depth path"]).toBeUndefined();
	});

	it("says light objects were set, or that there are none", () => {
		expect(lines({ lamps: { lights: 100, mode: "half" } })["Light objects"]).toMatchObject({
			value: "Half",
			detail: "Set in Settings › Graphics, not measured.",
		});
		expect(lines({})["Light objects"].value).toBe("None in this place");
	});

	it("names Dynamic's share and the savings it took", () => {
		expect(lines({}).Dynamic.value).toBe("Off");
		const on = lines({ dynamic: { share: 0.75, savings: ["fullResLamps"] } }).Dynamic;
		expect(on.value).toBe("75% of Native");
		expect(on.detail).toBe("Savings taken: [fullResLamps].");
	});

	it("says why WebGL2 draws where WebGPU did not start", () => {
		expect(
			lines({ backend: "WebGL2", fellBackWhy: "OperationError: no adapter" }).Renderer,
		).toMatchObject({
			value: "WebGL2",
			detail: "WebGPU did not start: OperationError: no adapter",
		});
		expect(lines({ backend: null }).Renderer.value).toBe("Not started");
	});
});
