/**
 * The shaders' record: what this browser last saw of them, so a start after
 * an update that changed them says so, and builds them once.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	autoBuildWanted,
	markShadersBuilt,
	noteShaders,
	readShaderRecord,
	setAutoBuild,
	shaderHash,
	shadersNew,
} from "../src/extensions/placeEditor/shaderEvent.js";

beforeEach(() => {
	const store = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
	});
});
afterEach(() => vi.unstubAllGlobals());

describe("the shaders' fingerprint", () => {
	it("is the same for the same text, and changes with a character", () => {
		expect(shaderHash("fn main() {}")).toBe(shaderHash("fn main() {}"));
		expect(shaderHash("fn main() {}")).not.toBe(shaderHash("fn main() { }"));
		expect(shaderHash("")).toMatch(/^[0-9a-f]{8}$/);
	});
});

describe("the shaders' record", () => {
	it("calls a first start new, the same shaders again not, and an update's new", () => {
		expect(shadersNew("aaaa0001")).toBe(true);
		expect(noteShaders("aaaa0001")).toMatchObject({ changed: true, record: { previous: null } });
		expect(shadersNew("aaaa0001")).toBe(false);
		expect(noteShaders("aaaa0001").changed).toBe(false);
		expect(noteShaders("bbbb0002")).toMatchObject({
			changed: true,
			record: { current: "bbbb0002", previous: "aaaa0001", built: null },
		});
	});

	it("keeps that they were built until an update changes them", () => {
		noteShaders("aaaa0001");
		markShadersBuilt("aaaa0001", 12345, 40);
		expect(readShaderRecord()).toMatchObject({ built: "aaaa0001", builtMs: 12345, pipelines: 40 });
		expect(noteShaders("aaaa0001").record.built).toBe("aaaa0001");
		expect(noteShaders("bbbb0002").record.built).toBeNull();
	});

	it("builds after an update unless turned off", () => {
		expect(autoBuildWanted()).toBe(true);
		setAutoBuild(false);
		expect(autoBuildWanted()).toBe(false);
	});
});
