/**
 * Scene reflections kept on a grid: the cube drawn the first time the camera
 * enters a cell is read while it stays there, so nothing is redrawn as it
 * moves. Automatic keeps one on a touch screen and follows on a computer.
 */

import { describe, expect, it } from "vitest";

import {
	REFLECTION_CACHE,
	reflectionCell,
	reflectionGrid,
} from "../src/extensions/placeEditor/app/viewport/view.js";

describe("the reflection grid", () => {
	it("puts every point of one cell under one key, and the next cell under another", () => {
		expect(reflectionCell([1, 2, 3], 64)).toBe(reflectionCell([63.9, 0, 63.9], 64));
		expect(reflectionCell([64, 2, 3], 64)).not.toBe(reflectionCell([63.9, 2, 3], 64));
		// Below zero too: -1 is in the cell before 0, not the same one.
		expect(reflectionCell([-1, 0, 0], 32)).not.toBe(reflectionCell([1, 0, 0], 32));
	});

	it("follows on a computer and keeps 64 studs on a touch screen, as Automatic", () => {
		expect(reflectionGrid("auto", false)).toBeNull();
		expect(reflectionGrid("auto", true)).toBe(64);
		expect(reflectionGrid(undefined, true)).toBe(64);
	});

	it("does as set, on either", () => {
		expect(reflectionGrid("follow", true)).toBeNull();
		expect(reflectionGrid("32", false)).toBe(32);
		expect(reflectionGrid("128", true)).toBe(128);
	});

	it("keeps a few cubes, not the whole place's", () => {
		expect(REFLECTION_CACHE).toBeGreaterThan(1);
		expect(REFLECTION_CACHE).toBeLessThanOrEqual(16);
	});
});
