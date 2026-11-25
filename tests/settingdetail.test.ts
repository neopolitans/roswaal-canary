/**
 * A setting says what it is in one line, and the rest behind an "i": the
 * Scene view's texts, and the Settings row that shows them.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InfoButton, Row } from "../src/app/settingsParts.jsx";
import { SCENE_VIEW } from "../src/extensions/placeEditor/settings.js";

const declared = SCENE_VIEW.flatMap((group) => group.settings);

describe("the Scene view's texts", () => {
	/** One line under the name, on a tablet's panel as in Settings. */
	it("say what each setting is in one short line", () => {
		for (const decl of declared) {
			expect(decl.help.length, decl.key).toBeLessThanOrEqual(64);
			expect(decl.help.endsWith("."), decl.key).toBe(true);
		}
	});

	/** The detail adds to the line rather than repeating it. */
	it("keep the rest behind the i, and never the line again", () => {
		for (const decl of declared) {
			if (decl.detail === undefined) continue;
			expect(decl.detail.length, decl.key).toBeGreaterThan(decl.help.length);
			expect(decl.detail, decl.key).not.toBe(decl.help);
		}
		// All but the selection outline's, whose line says it all.
		expect(declared.filter((decl) => decl.detail === undefined).map((decl) => decl.key)).toEqual([
			"outlineWidth",
		]);
	});
});

describe("a Settings row", () => {
	const row = (detail?: string) =>
		renderToStaticMarkup(
			createElement(Row, { label: "Frame rate", help: "The most frames a second.", detail }),
		);

	it("has an i only when there is more to say", () => {
		expect(row()).not.toContain("info-button");
		expect(row("VSync matches the display.")).toContain('aria-label="More about Frame rate"');
	});

	/** Closed until tapped: the line shows, the detail waits. */
	it("starts with the detail closed", () => {
		const html = row("VSync matches the display.");
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain("The most frames a second.");
		expect(html).not.toContain("VSync matches the display.");
	});
});

describe("the i", () => {
	it("names what it opens, for a screen reader", () => {
		const html = renderToStaticMarkup(
			createElement(InfoButton, {
				label: "Sunlight",
				open: true,
				controls: "what",
				onToggle: () => undefined,
			}),
		);
		expect(html).toContain('aria-controls="what"');
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('aria-hidden="true">i<');
	});
});
