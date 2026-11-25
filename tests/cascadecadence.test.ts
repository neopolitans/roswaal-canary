/**
 * Sun cascades drawn again only once their slice of the view leaves their
 * map: each map is CASCADE_SLACK wider than its slice, and a map still
 * holding its slice is read with the matrix it was drawn with.
 */

import { describe, expect, it } from "vitest";

import {
	CASCADE_BLOCK,
	CASCADE_SLACK,
	CascadeCadence,
	type CascadeFit,
	cascadeBlock,
	cascadeCovers,
	SUN_CASCADES,
} from "../src/extensions/placeEditor/app/viewport/view.js";

const n = SUN_CASCADES.length;
const SUN = [0.3, 0.9, 0.2];
const BOX = { min: [-2000, -10, -2000], max: [2000, 400, 2000] };

/** A camera at `x` along X, looking down +Z and a little down. */
function at(x: number, z = 0) {
	return { eye: [x, 20, z], at: [x, 10, z + 40] } as never;
}

/** The block and fits for a camera. */
function view(camera: never): { block: Float32Array; fits: CascadeFit[] } {
	const fits: CascadeFit[] = [];
	const block = cascadeBlock(camera, 1.5, SUN, BOX, 0.2, true, true, undefined, undefined, fits);
	return { block, fits };
}

describe("the sun cascades' maps", () => {
	it("are drawn CASCADE_SLACK wider than the slice they hold", () => {
		const { fits } = view(at(0));
		expect(fits).toHaveLength(n);
		for (const f of fits) {
			expect(f.radius).toBeCloseTo(f.need * (1 + CASCADE_SLACK));
			expect(cascadeCovers(f, f)).toBe(true);
		}
	});

	it("are all drawn first, then not again while the slices stay inside them", () => {
		const cadence = new CascadeCadence();
		const first = view(at(0));
		const step = cadence.next(first.block, first.fits, new Float32Array(CASCADE_BLOCK), SUN, false);
		expect(step?.due).toEqual([true, true, true]);
		// A small step: every slice still fits, so nothing is drawn.
		const small = view(at(0.2));
		expect(cadence.next(small.block, small.fits, step!.block, SUN, false)).toBeNull();
	});

	it("draws the near one again once its slice leaves its map, the far ones kept as drawn", () => {
		const cadence = new CascadeCadence();
		const first = view(at(0));
		const last = cadence.next(
			first.block,
			first.fits,
			new Float32Array(CASCADE_BLOCK),
			SUN,
			false,
		)!.block;
		// Past the near map's slack, within the far ones'.
		const step = first.fits[0].need * CASCADE_SLACK * 1.5;
		expect(step).toBeLessThan(first.fits[n - 1].need * CASCADE_SLACK);
		const moved = view(at(step));
		const next = cadence.next(moved.block, moved.fits, last, SUN, false)!;
		expect(next.due[0]).toBe(true);
		expect(next.due[n - 1]).toBe(false);
		// The far one read with the matrix its map was drawn with.
		const k = n - 1;
		expect([...next.block.subarray(k * 16, k * 16 + 16)]).toEqual([
			...last.subarray(k * 16, k * 16 + 16),
		]);
		expect([...next.block.subarray(0, 16)]).toEqual([...moved.block.subarray(0, 16)]);
	});

	it("draws them all when the parts move or the sun turns", () => {
		const cadence = new CascadeCadence();
		const first = view(at(0));
		const last = cadence.next(
			first.block,
			first.fits,
			new Float32Array(CASCADE_BLOCK),
			SUN,
			false,
		)!.block;
		expect(cadence.next(first.block, first.fits, last, SUN, true)!.due).toEqual([true, true, true]);
		expect(cadence.next(first.block, first.fits, last, [0, 1, 0], false)!.due).toEqual([
			true,
			true,
			true,
		]);
	});

	it("passes the block on once when there are no maps", () => {
		const cadence = new CascadeCadence();
		const off = cascadeBlock(at(0), 1.5, SUN, BOX, 0.2, false, true);
		expect(cadence.next(off, [], new Float32Array(CASCADE_BLOCK), SUN, false)).not.toBeNull();
		expect(cadence.next(off, [], off, SUN, false)).toBeNull();
	});
});
