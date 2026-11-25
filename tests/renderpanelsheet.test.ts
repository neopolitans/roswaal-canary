/**
 * The Rendering panel's sheet: on a touch screen held upright, its drawer
 * comes up from the bottom at the height its grab is pulled to. Only its
 * drawer, and only then: every other panel keeps the side card.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8").replace(
	/\r\n/g,
	"\n",
);

/** The body of the one media block that starts with this query. */
function block(query: string): string {
	const at = css.indexOf(`@media ${query} {`);
	expect(at, query).toBeGreaterThan(-1);
	let depth = 0;
	for (let i = css.indexOf("{", at); i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}" && --depth === 0) return css.slice(at, i + 1);
	}
	throw new Error("unclosed");
}

describe("the Rendering panel's sheet", () => {
	const sheet = block("(hover: none) and (pointer: coarse) and (orientation: portrait)");

	it("is a touch screen held upright's alone", () => {
		expect(css.match(/\.render-panel\[data-detent="peek"\]/g)?.length).toBeGreaterThan(0);
		// Every rule about the detents is inside the portrait block.
		const outside = css.replace(sheet, "");
		expect(outside).not.toContain('data-detent="peek"');
		expect(outside).not.toContain('data-detent="full"');
	});

	it("moves only the drawer the Rendering panel is showing in", () => {
		const drawerRules = [...sheet.matchAll(/^\t(\.dock\.drawer[^{]*)\{/gm)].map((m) => m[1]);
		expect(drawerRules.length).toBeGreaterThan(0);
		for (const selector of drawerRules) {
			// A rule on the panel's own parts, inside the drawer, moves nothing else.
			if (/^\.dock\.drawer \.render-/.test(selector)) continue;
			expect(selector).toContain(".panel-render:not(.panel-away)");
		}
	});

	it("has a height for each of Peek, Half and Full", () => {
		expect(sheet).toMatch(/height: 50%/);
		expect(sheet).toContain('[data-detent="peek"]');
		expect(sheet).toContain('[data-detent="full"]');
	});
});
