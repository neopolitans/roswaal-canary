/**
 * The lighting cells worth filling (1.1.0-canary.136): those within a few
 * cells of a part's box, marked in a mask the fill shaders read, and each
 * slice's rectangle of them.
 */

import { describe, expect, it } from "vitest";
import {
	boxIndex,
	cellBlock,
	innerSpans,
	unionSpan,
} from "../src/extensions/placeEditor/app/viewport/cellSpans.js";

/** A box from its lowest corner to its highest. */
const boxes = (...list: number[][]) => new Float32Array(list.flat());

describe("the cells worth filling", () => {
	it("are those within the pad of a part, and nothing over open ground", () => {
		// A 3-stud cube inside cell (4, 4, 4), cells 4 studs, a pad of 1.
		const block = cellBlock(
			boxIndex(boxes([16.5, 16.5, 16.5, 19.5, 19.5, 19.5])),
			[0, 0, 0],
			[10, 10, 10],
			4,
			1,
		);
		expect(block.marked).toBe(27);
		const at = (x: number, y: number, z: number) => block.mask[(y * 10 + z) * 10 + x];
		expect(at(4, 4, 4)).toBe(1);
		expect(at(3, 5, 4)).toBe(1);
		expect(at(2, 4, 4)).toBe(0);
		expect(block.spans[4]).toEqual({ x0: 3, z0: 3, x1: 5, z1: 5 });
		expect(block.spans[0]).toBeNull();
		expect(block.spans[9]).toBeNull();
	});

	it("clamp a part reaching past the block, and leave out one beyond it", () => {
		const index = boxIndex(
			boxes(
				[-100, 0, -100, 100, 1, 100], // a baseplate under the whole block
				[500, 500, 500, 504, 504, 504], // far away
			),
		);
		const block = cellBlock(index, [0, 0, 0], [8, 8, 8], 4, 1);
		// The baseplate's layer and the one over it, every cell of both.
		expect(block.marked).toBe(2 * 64);
		expect(block.spans[1]).toEqual({ x0: 0, z0: 0, x1: 7, z1: 7 });
		expect(block.spans[2]).toBeNull();
	});

	it("find a part through its bucket, a wide one apart, as walking every part does", () => {
		const parts: number[][] = [];
		for (let i = 0; i < 200; i++)
			parts.push([i * 37 - 4000, 3, i * 53 - 5000, i * 37 - 3990, 9, i * 53 - 4990]);
		parts.push([-20000, -2, -20000, 20000, 0, 20000]);
		const index = boxIndex(boxes(...parts));
		const origin = [-500, -64, -600];
		const block = cellBlock(index, origin, [96, 32, 96], 4, 3);
		// Every box against the block, by hand.
		const want = new Uint8Array(96 * 32 * 96);
		for (const b of parts) {
			const lo = [0, 1, 2].map((a) => Math.max(0, Math.floor((b[a] - origin[a]) / 4) - 3));
			const hi = [0, 1, 2].map((a) =>
				Math.min([96, 32, 96][a] - 1, Math.floor((b[a + 3] - origin[a]) / 4) + 3),
			);
			if (lo.some((l, a) => l > hi[a])) continue;
			for (let y = lo[1]; y <= hi[1]; y++)
				for (let z = lo[2]; z <= hi[2]; z++)
					for (let x = lo[0]; x <= hi[0]; x++) want[(y * 96 + z) * 96 + x] = 1;
		}
		expect(Buffer.from(block.mask).equals(Buffer.from(want))).toBe(true);
	});

	it("give the inner block's spans from the bordered one's", () => {
		const spans = [null, { x0: 2, z0: 3, x1: 5, z1: 6 }, null, null];
		// Inner slice y holds bordered slices y to y + 2, a cell in.
		expect(innerSpans(spans, [8, 2, 8])).toEqual([
			{ x0: 1, z0: 2, x1: 4, z1: 5 },
			{ x0: 1, z0: 2, x1: 4, z1: 5 },
		]);
		expect(unionSpan([null, null])).toBeNull();
	});
});
