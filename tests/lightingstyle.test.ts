/**
 * Lighting's style, Soft or Realistic: LightingStyle, which replaced
 * Technology; a file with Technology alone read as its lighting was.
 */

import { describe, expect, it } from "vitest";

import type { Prop, RbxInstance } from "../src/core/rbx/dom.js";
import { lightingSoft } from "../src/extensions/placeEditor/core/lighting.js";

function lighting(props: Record<string, Prop>): RbxInstance {
	return {
		className: "Lighting",
		name: "Lighting",
		parent: null,
		children: [],
		props: new Map(Object.entries(props)),
		service: true,
	};
}

describe("Lighting's style", () => {
	it("is LightingStyle's, Technology aside", () => {
		expect(lightingSoft(lighting({ LightingStyle: { type: "Enum", value: 1 } }))).toBe(true);
		expect(
			lightingSoft(
				lighting({
					LightingStyle: { type: "Enum", value: 0 },
					Technology: { type: "Enum", value: 1 },
				}),
			),
		).toBe(false);
	});

	it("follows Technology in a file from before LightingStyle", () => {
		expect(lightingSoft(lighting({ Technology: { type: "Enum", value: 1 } }))).toBe(true);
		expect(lightingSoft(lighting({ Technology: { type: "Enum", value: 2 } }))).toBe(true);
		expect(lightingSoft(lighting({ Technology: { type: "Enum", value: 3 } }))).toBe(false);
		expect(lightingSoft(lighting({ Technology: { type: "Enum", value: 4 } }))).toBe(false);
	});

	it("is Realistic with neither", () => {
		expect(lightingSoft(lighting({}))).toBe(false);
		expect(lightingSoft(undefined)).toBe(false);
	});
});
