/**
 * "Automatic" as "Auto" where a control in the Rendering panel has not the
 * room for it: the word, and only it, at the start of what a control says.
 */

import { describe, expect, it } from "vitest";

import { shortAuto } from "../src/extensions/placeEditor/app/autoFit.js";

describe("Auto for Automatic", () => {
	it("shortens the word where the control is tight, and only then", () => {
		expect(shortAuto("Automatic · Level 10", true)).toBe("Auto · Level 10");
		expect(shortAuto("Automatic", true)).toBe("Auto");
		expect(shortAuto("Automatic · Level 10", false)).toBe("Automatic · Level 10");
	});

	it("leaves every other word alone", () => {
		expect(shortAuto("VSync", true)).toBe("VSync");
		expect(shortAuto("Half", true)).toBe("Half");
		// Only the word at the start, and only the whole word.
		expect(shortAuto("Not Automatic", true)).toBe("Not Automatic");
		expect(shortAuto("Automatically", true)).toBe("Automatically");
	});
});
