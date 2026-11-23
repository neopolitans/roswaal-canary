/**
 * Upscaling: each still frame's samples land where the jitter put them, and
 * weigh by how near a screen pixel's centre they fall (see upscale.ts).
 */

import { describe, expect, it } from "vitest";
import {
	MOVING_DECAY,
	SAMPLE_FALLOFF,
	sampleWeights,
	UPSCALE_WGSL,
} from "../src/extensions/placeEditor/app/viewport/upscale.js";

describe("upscaling's samples", () => {
	it("weigh a sample on the screen pixel's centre fully, and the rest by distance in screen pixels", () => {
		// 100% on a Retina screen: two screen pixels to a draw pixel.
		const w = sampleWeights([10.5, 10.5], [0, 0], 2);
		expect(w.map((s) => s.pixel)).toEqual([
			[10, 10],
			[11, 10],
			[10, 11],
			[11, 11],
		]);
		expect(w[0].weight).toBe(1);
		// One draw pixel along is two screen pixels away.
		expect(w[1].weight).toBeCloseTo(Math.exp(-SAMPLE_FALLOFF * 4), 9);
		expect(w[3].weight).toBeCloseTo(Math.exp(-SAMPLE_FALLOFF * 8), 9);
	});

	it("follow the jitter: a frame drawn a quarter pixel right holds each point a quarter pixel further on", () => {
		const w = sampleWeights([10.5, 10.5], [0.25, 0], 2);
		// Pixel 10's centre, 10.5, holds the frame's point at 10.25: half a screen pixel short.
		expect(w[0].pixel).toEqual([10, 10]);
		expect(w[0].weight).toBeCloseTo(Math.exp(-SAMPLE_FALLOFF * 0.25), 9);
		// Far enough over, the four pixels round the point move on too.
		const on = sampleWeights([10.5, 10.5], [0.75, 0], 2);
		expect(on[0].pixel).toEqual([10, 10]);
		expect(on[1].pixel).toEqual([11, 10]);
		expect(sampleWeights([10.9, 10.5], [0.75, 0], 2)[0].pixel).toEqual([11, 10]);
	});

	it("give every screen pixel a nearby sample over the sixteen jittered frames", () => {
		// Halton (2, 3) as still-frame TAA steps it: each screen pixel, at 2x, near one at least once.
		const halton = (i: number, b: number) => {
			let f = 1;
			let r = 0;
			for (let n = i; n > 0; n = Math.floor(n / b)) {
				f /= b;
				r += f * (n % b);
			}
			return r;
		};
		for (const q of [
			[10.25, 10.25],
			[10.75, 10.25],
			[10.25, 10.75],
			[10.75, 10.75],
		] as const) {
			let most = 0;
			for (let i = 1; i < 16; i++) {
				const j: [number, number] = [halton(i, 2) - 0.5, halton(i, 3) - 0.5];
				for (const s of sampleWeights(q, j, 2)) most = Math.max(most, s.weight);
			}
			expect(most).toBeGreaterThan(0.6);
		}
	});

	it("is the shader's own arithmetic, and keeps a moving scene's history short", () => {
		expect(UPSCALE_WGSL).toContain(`exp(-${SAMPLE_FALLOFF} * dot(d, d))`);
		expect(UPSCALE_WGSL).toContain("floor(q + j - 0.5)");
		expect(MOVING_DECAY).toBeLessThan(1);
	});
});
