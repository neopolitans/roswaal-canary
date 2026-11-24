/**
 * Render scale's labels say what Native comes to on the screen in front of
 * you, and mark a share it cannot reach, which draws Native.
 */

import { describe, expect, it } from "vitest";
import { renderScaleLabels } from "../src/extensions/placeEditor/settings.js";

describe("Render scale's labels", () => {
	it("say what Native is here: 200% on a Retina screen, 100% on an ordinary one", () => {
		expect(renderScaleLabels(2, true).native).toBe("Native (200%, Retina)");
		expect(renderScaleLabels(2, false).native).toBe("Native (200%)");
		expect(renderScaleLabels(1.5, false).native).toBe("Native (150%)");
		expect(renderScaleLabels(1, false).native).toBe("Native (100%)");
		// A phone's 3: the view draws at most 2.
		expect(renderScaleLabels(3, true).native).toBe("Native (200%, Retina)");
	});

	it("mark a share past the screen's own pixels, which draws Native", () => {
		const ordinary = renderScaleLabels(1, false);
		expect(ordinary["150"]).toBe("150% (draws Native here)");
		expect(ordinary["100"]).toBeUndefined();
		expect(renderScaleLabels(1.5, false)["150"]).toBeUndefined();
		expect(renderScaleLabels(2, true)["150"]).toBeUndefined();
	});
});
