/**
 * Sun cascades drawn on a cadence while only the camera moves: the near one
 * each frame, the far ones less often, each read as its map was drawn, and
 * all caught up once the camera stops.
 */

import { describe, expect, it } from "vitest";

import {
	CASCADE_BLOCK,
	CascadeCadence,
	SUN_CASCADES,
} from "../src/extensions/placeEditor/app/viewport/view.js";

const n = SUN_CASCADES.length;
const SUN = [0.3, 0.9, 0.2];

/** A block whose matrices say the camera's x, and fixed extras. */
function blockAt(x: number): Float32Array {
	const b = new Float32Array(CASCADE_BLOCK);
	for (let k = 0; k < n; k++) {
		b[k * 16] = x;
		b[n * 16 + 4 + k] = 0.5 + k;
		b[n * 16 + k] = 64 * 4 ** k;
	}
	b[n * 16 + 3] = 0.3;
	b[n * 16 + 7] = 1;
	return b;
}

describe("the sun cascades' cadence", () => {
	it("draws all of them first, then near every frame, the next every second, the far every third", () => {
		const cadence = new CascadeCadence();
		let last: Float32Array<ArrayBufferLike> = new Float32Array(CASCADE_BLOCK);
		const dues: boolean[][] = [];
		for (let f = 0; f < 7; f++) {
			const step = cadence.next(blockAt(f + 1), last, SUN, false);
			expect(step).not.toBeNull();
			dues.push(step!.due);
			last = step!.block;
		}
		expect(dues[0]).toEqual([true, true, true]);
		expect(dues.slice(1).map((d) => d[0])).toEqual([true, true, true, true, true, true]);
		expect(dues.slice(1).filter((d) => d[1]).length).toBe(3);
		expect(dues.slice(1).filter((d) => d[2]).length).toBe(2);
	});

	it("keeps a cascade not drawn as its map was drawn, and asks for a frame more", () => {
		const cadence = new CascadeCadence();
		let last = cadence.next(blockAt(1), new Float32Array(CASCADE_BLOCK), SUN, false)!.block;
		const step = cadence.next(blockAt(2), last, SUN, false)!;
		for (let k = 0; k < n; k++) expect(step.block[k * 16]).toBe(step.due[k] ? 2 : 1);
		expect(step.again).toBe(!step.due.every(Boolean));
		last = step.block;
		// The camera stopped: the frame after draws every one still behind.
		const stopped = cadence.next(blockAt(2), last, SUN, false)!;
		expect(stopped.due).toEqual([true, true, true]);
		expect(stopped.again).toBe(false);
		// And then nothing is to be drawn.
		expect(cadence.next(blockAt(2), stopped.block, SUN, false)).toBeNull();
	});

	it("draws them all when the parts move or the sun turns", () => {
		const cadence = new CascadeCadence();
		let last = cadence.next(blockAt(1), new Float32Array(CASCADE_BLOCK), SUN, false)!.block;
		last = cadence.next(blockAt(2), last, SUN, false)!.block;
		expect(cadence.next(blockAt(3), last, SUN, true)!.due).toEqual([true, true, true]);
		expect(cadence.next(blockAt(4), last, [0, 1, 0], false)!.due).toEqual([true, true, true]);
	});
});
