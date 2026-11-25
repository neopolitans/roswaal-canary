/**
 * Properties leaves out what the engine marks deprecated, as Studio's does:
 * Lighting.Technology, replaced by LightingStyle, and Outlines. The file
 * keeps them; only the panel does not list them.
 */

import { describe, expect, it } from "vitest";

import { describeInstance } from "../src/core/rbx/browse.js";
import type { Prop, RbxInstance } from "../src/core/rbx/dom.js";

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

describe("deprecated properties", () => {
	it("are left out of an instance's properties, LightingStyle kept", () => {
		const inst = lighting({
			Technology: { type: "Enum", value: 4 },
			Outlines: { type: "Bool", value: false },
			LightingStyle: { type: "Enum", value: 0 },
			Brightness: { type: "Float32", value: 2 },
		});
		const names = describeInstance(inst, 0, () => undefined).properties.map((p) => p.name);
		expect(names).not.toContain("Technology");
		expect(names).not.toContain("Outlines");
		expect(names).toContain("LightingStyle");
		expect(names).toContain("Brightness");
		// Still in the file, untouched.
		expect(inst.props.get("Technology")?.value).toBe(4);
	});
});
