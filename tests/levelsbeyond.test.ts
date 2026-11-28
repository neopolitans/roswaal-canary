/**
 * Quality levels past Studio's (1.1.0-canary.147): each adds one of
 * Roswaal's own, the cheapest first, by what the Automatic settings come to;
 * Automatic itself stays within Studio's 21.
 */

import { describe, expect, it } from "vitest";
import {
	FIXES_LEVEL,
	levelLabel,
	REALTIME_AMBIENT,
	REALTIME_LIGHTS,
	REALTIME_REFLECTIONS,
	ROSWAAL_TOP,
	STUDIO_TOP,
} from "../src/extensions/placeEditor/app/viewport/levels.js";
import { AutoQuality } from "../src/extensions/placeEditor/app/viewport/quality.js";
import {
	ambientGrid,
	lightGridCell,
	reflectionGrid,
	TOUCH_LIGHT_CELL,
} from "../src/extensions/placeEditor/app/viewport/view.js";
import { VIEWPORT_QUALITIES } from "../src/extensions/placeEditor/settings.js";

describe("the levels past Studio's", () => {
	it("are 22 to 25, the cheapest on an iPad first", () => {
		expect([
			STUDIO_TOP,
			REALTIME_REFLECTIONS,
			REALTIME_LIGHTS,
			REALTIME_AMBIENT,
			FIXES_LEVEL,
		]).toEqual([21, 22, 23, 24, 25]);
		expect(ROSWAAL_TOP).toBe(25);
		expect([21, 22, 23, 24, 25, 7].map(levelLabel)).toEqual([
			"Level 21 · As Studio",
			"Level 22 · Realtime reflections",
			"Level 23 · Realtime light objects",
			"Level 24 · Realtime ambient lighting",
			"Level 25 · Roswaal fixes",
			"Level 7",
		]);
		expect(VIEWPORT_QUALITIES.map((q) => q.value).slice(0, 3)).toEqual(["auto", "25", "24"]);
		expect(VIEWPORT_QUALITIES).toHaveLength(26);
	});

	it("give a touch screen's Automatic its stand-ins up to 21, Roswaal's own past it", () => {
		// Reflections: a grid of kept cubes, then exact from 22.
		expect(reflectionGrid("auto", true, 21)).toBe(64);
		expect(reflectionGrid("auto", true, 22)).toBeNull();
		// Light objects: the 4-stud grid, then every pixel from 23.
		expect(lightGridCell("auto", true, 22)).toBe(TOUCH_LIGHT_CELL);
		expect(lightGridCell("auto", true, 23)).toBeNull();
		// Ambient lighting: the cells, then Realtime from 24.
		expect(ambientGrid("auto", true, 23)).toBe(true);
		expect(ambientGrid("auto", true, 24)).toBe(false);
	});

	it("leave a computer's Automatic as the place says, and light Soft places pixel by pixel from 23", () => {
		expect(reflectionGrid("auto", false, 21)).toBeNull();
		expect(ambientGrid("auto", false, 21)).toBe(false);
		expect(lightGridCell("auto", false, 21)).toBe("auto");
		expect(lightGridCell("auto", false, 23)).toBeNull();
	});

	it("never overrule a setting chosen by hand", () => {
		expect(lightGridCell("8", true, 25)).toBe(8);
		expect(ambientGrid("grid", false, 25)).toBe(true);
		expect(reflectionGrid("128", false, 25)).toBe(128);
	});

	it("are never Automatic's: from one of them it starts at 21", () => {
		expect(new AutoQuality(25).level).toBe(21);
		expect(new AutoQuality(22).level).toBe(21);
		expect(new AutoQuality(15).level).toBe(15);
	});
});
