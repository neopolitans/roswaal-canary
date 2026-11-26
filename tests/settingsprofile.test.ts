/**
 * A settings profile (1.1.0-canary.131): the Place Editor's Graphics
 * settings as a file, exported and imported through a stored value's checks.
 */

import { describe, expect, it } from "vitest";
import { declaredSettings, readExtension } from "../src/app/extensionSettings.js";
import { PLACE_EDITOR } from "../src/extensions/placeEditor/manifest.js";
import {
	applyProfile,
	PROFILE_KIND,
	profileFileName,
	profileOf,
} from "../src/extensions/placeEditor/settingsProfile.js";

const none = { getItem: () => null };
const defaults = () => readExtension(PLACE_EDITOR, none);

describe("a settings profile", () => {
	it("exports every Graphics setting, and reads back as it was", () => {
		const state = defaults();
		state.values = { ...state.values, ambientLighting: "grid", lightGrid: "8" };
		const profile = profileOf(
			PLACE_EDITOR,
			state,
			"1.1.0-canary.131",
			"2026-11-26T09:30:00.000Z",
			"iPad grid",
		);
		expect(profile.kind).toBe(PROFILE_KIND);
		expect(Object.keys(profile.values).sort()).toEqual(
			declaredSettings(PLACE_EDITOR)
				.map((d) => d.key)
				.sort(),
		);
		const read = applyProfile(PLACE_EDITOR, defaults(), JSON.stringify(profile));
		if (!read.ok) throw new Error(read.error);
		expect(read.state.values).toEqual(state.values);
		expect(read.left).toEqual([]);
		expect(read.name).toBe("iPad grid");
		expect(profileFileName(profile)).toBe("roswaal-settings-ipad-grid-2026-11-26T09-30.json");
	});

	it("sets only what it names, and leaves out what this version does not offer", () => {
		const read = applyProfile(
			PLACE_EDITOR,
			defaults(),
			JSON.stringify({
				kind: PROFILE_KIND,
				extension: "placeEditor",
				values: { ambientLighting: "grid", lightGrid: "7", madeUp: true, renderer: "webgl2" },
			}),
		);
		if (!read.ok) throw new Error(read.error);
		expect(read.applied.sort()).toEqual(["ambientLighting", "renderer"]);
		expect(read.left.sort()).toEqual(["lightGrid", "madeUp"]);
		expect(read.state.values.lightGrid).toBe(defaults().values.lightGrid);
		expect(read.state.values).not.toHaveProperty("madeUp");
	});

	it("refuses a file that is not one", () => {
		for (const text of [
			"not json",
			JSON.stringify({ kind: "roswaal-benchmark", values: {} }),
			JSON.stringify({ kind: PROFILE_KIND, extension: "other", values: {} }),
			JSON.stringify({ kind: PROFILE_KIND, extension: "placeEditor" }),
		]) {
			expect(applyProfile(PLACE_EDITOR, defaults(), text).ok, text).toBe(false);
		}
	});
});
