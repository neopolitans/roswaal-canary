/**
 * Where Highlights draw (1.1.0-canary.144): the highlighted parts' boxes
 * from scene rows, and the screen rectangle round them that the outline's
 * passes keep to.
 */

import { describe, expect, it } from "vitest";
import {
	BOX_FLOATS,
	highlightBoxes,
	meshReach,
	screenRect,
} from "../src/extensions/placeEditor/app/viewport/highlightRect.js";
import { lookAt, multiply, perspective } from "../src/extensions/placeEditor/app/viewport/math.js";
import { SCENE_STRIDE } from "../src/extensions/placeEditor/core/scene.js";

/** A row: a part `size` studs at `at`, square to the axes, with id `id`. */
function row(at: number[], size: number[], id: number): number[] {
	const r = new Array(SCENE_STRIDE).fill(0);
	r[0] = size[0];
	r[4] = size[1];
	r[8] = size[2];
	r[9] = at[0];
	r[10] = at[1];
	r[11] = at[2];
	r[13] = id;
	return r;
}

function rows(list: number[][]): { data: Float32Array; count: number } {
	const data = new Float32Array(list.length * SCENE_STRIDE);
	const words = new Uint32Array(data.buffer);
	list.forEach((r, i) =>
		r.forEach((v, k) => {
			if (k === 13) words[i * SCENE_STRIDE + k] = v;
			else data[i * SCENE_STRIDE + k] = v;
		}),
	);
	return { data, count: list.length };
}

// Looking down -z from 20 studs out, a square view.
const vp = multiply(
	perspective(Math.PI / 3, 1, 0.1, 1000, false, false),
	lookAt([0, 0, 20], [0, 0, 0]),
);

describe("the highlighted parts' boxes", () => {
	it("are the rows whose id is highlighted, each its mesh's reach", () => {
		const set = rows([row([0, 0, 0], [2, 2, 2], 3), row([5, 0, 0], [2, 2, 2], 4)]);
		const boxes = highlightBoxes([{ ...set, reach: [1, 0.5, 0.5] }], new Set([4]));
		expect(boxes.length).toBe(BOX_FLOATS);
		// Its x axis doubled, as its mesh reaches twice the unit box's half that way.
		expect(Array.from(boxes.subarray(0, 3))).toEqual([4, 0, 0]);
		expect(Array.from(boxes.subarray(9, 12))).toEqual([5, 0, 0]);
		expect(highlightBoxes([set], new Set())).toHaveLength(0);
	});

	it("reach as far as a mesh's vertices do", () => {
		const v = new Float32Array([0.5, -1.5, 0.2, 0, 1, 0, -0.75, 1, -0.1, 0, 1, 0]);
		expect(meshReach(v)).toEqual([0.75, 1.5, expect.closeTo(0.2, 5)]);
	});
});

describe("the screen rectangle", () => {
	const boxAt = (at: number[], size = 2) =>
		highlightBoxes([rows([row(at, [size, size, size], 1)])], new Set([1]));

	it("is round a part in the middle, widened by the pad", () => {
		const r = screenRect(boxAt([0, 0, 0]), vp, 1000, 1000, 4);
		expect(r).not.toBeNull();
		if (!r) return;
		expect(r.x0).toBeGreaterThan(400);
		expect(r.x1).toBeLessThan(600);
		expect(r.y0).toBeGreaterThan(400);
		expect(r.y1).toBeLessThan(600);
		expect(r.x1 - r.x0).toBeCloseTo(r.y1 - r.y0, -1);
	});

	it("counts down from the top: a part above the middle is in the upper half", () => {
		const r = screenRect(boxAt([0, 5, 0]), vp, 1000, 1000, 0);
		expect(r && r.y1).toBeLessThan(500);
	});

	it("is none where no part is in front of the camera or on the screen", () => {
		expect(screenRect(boxAt([0, 0, 40]), vp, 1000, 1000, 4)).toBeNull();
		expect(screenRect(boxAt([500, 0, 0]), vp, 1000, 1000, 4)).toBeNull();
	});

	it("is the whole canvas where a part reaches behind the eye", () => {
		expect(screenRect(boxAt([0, 0, 20], 4), vp, 1000, 800, 4)).toEqual({
			x0: 0,
			y0: 0,
			x1: 1000,
			y1: 800,
		});
	});
});
