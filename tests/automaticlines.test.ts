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
	depth: { chosen: null, medians: null },
	lamps: { setting: "auto", lights: 0, mode: "full", chosen: null, medians: null },
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
			lines({ depth: { chosen: null, medians: { full: 9, lean: 8.5 } } })["Depth path"].value,
		).toBe("Measuring");
		const chosen = lines({ depth: { chosen: "lean", medians: { full: 10.2, lean: 7.5 } } })[
			"Depth path"
		];
		expect(chosen.value).toBe("Lean · 2.7 ms faster");
		expect(chosen.detail).toBe("A frame's median: full 10.2 ms, lean 7.5 ms.");
	});

	/** WebGL2 draws one way: no depth path to choose. */
	it("leaves out the depth path where there is one way", () => {
		expect(lines({ depth: null })["Depth path"]).toBeUndefined();
	});

	it("says light objects were set, absent, or measured", () => {
		expect(
			lines({ lamps: { ...base.lamps, setting: "half", mode: "half" } })["Light objects"],
		).toMatchObject({
			value: "Half",
			detail: "Set in Settings › Graphics, not measured.",
		});
		expect(lines({})["Light objects"].value).toBe("None in this place");
		const measured = lines({
			lamps: {
				setting: "auto",
				lights: 100,
				mode: "half",
				chosen: "half",
				medians: { full: 16, half: 11.4 },
			},
		})["Light objects"];
		expect(measured.value).toBe("Half · 4.6 ms faster");
		expect(measured.detail).toContain("with 100 lights");
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
