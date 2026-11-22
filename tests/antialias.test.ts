/**
 * Antialiasing: the modes each renderer draws, still-frame TAA's average
 * and jitter, SMAA's tables, and Settings' values.
 */

import { describe, expect, it } from "vitest";
import {
	antialiasFor,
	antialiasModes,
	halton,
	jitterClip,
	StillFrames,
	TAA_FRAMES,
} from "../src/extensions/placeEditor/app/viewport/antialias.js";
import {
	SMAA_AREA,
	SMAA_SEARCH,
	smaaTables,
} from "../src/extensions/placeEditor/app/viewport/smaaTables.js";
import { antialiasSetting, VIEWPORT_ANTIALIAS } from "../src/extensions/placeEditor/settings.js";

describe("antialiasing modes", () => {
	it("are WebGPU's 1 or 4 samples, and WebGL2's as far as its GPU goes", () => {
		expect(antialiasModes("WebGPU", 4)).toEqual(["off", "fxaa", "smaa", "msaa4", "taa"]);
		expect(antialiasModes("WebGL2", 8)).toEqual([
			"off",
			"fxaa",
			"smaa",
			"msaa2",
			"msaa4",
			"msaa8",
			"taa",
		]);
		expect(antialiasModes("WebGL2", 4)).toEqual(["off", "fxaa", "smaa", "msaa2", "msaa4", "taa"]);
	});

	it("fall to the nearest MSAA a renderer has", () => {
		expect(antialiasFor("msaa8", "WebGPU", 4)).toBe("msaa4");
		expect(antialiasFor("msaa2", "WebGPU", 4)).toBe("msaa4");
		expect(antialiasFor("msaa8", "WebGL2", 4)).toBe("msaa4");
		expect(antialiasFor("smaa", "WebGPU", 4)).toBe("smaa");
	});

	it("are each Settings' value, and Automatic none", () => {
		expect(VIEWPORT_ANTIALIAS.map((a) => antialiasSetting(a.value))).toEqual([
			undefined,
			"off",
			"fxaa",
			"smaa",
			"msaa2",
			"msaa4",
			"msaa8",
			"taa",
		]);
	});
});

describe("still-frame TAA", () => {
	it("averages TAA_FRAMES frames a fraction of a pixel apart, then stops", () => {
		const still = new StillFrames();
		const first = still.next(false, "a");
		expect(first).toEqual({ jitter: [0, 0], weight: 1 });
		const weights: number[] = [];
		const jitters = new Set<string>();
		while (still.settling) {
			const s = still.next(true, "a");
			weights.push(s.weight);
			jitters.add(s.jitter.join(","));
			for (const j of s.jitter) expect(Math.abs(j)).toBeLessThanOrEqual(0.5);
		}
		expect(weights).toHaveLength(TAA_FRAMES - 1);
		expect(weights[0]).toBeCloseTo(1 / 2);
		expect(weights.at(-1)).toBeCloseTo(1 / TAA_FRAMES);
		expect(jitters.size).toBe(TAA_FRAMES - 1);
		// Done: a still frame adds nothing.
		expect(still.next(true, "a").weight).toBe(0);
	});

	it("starts again when the view moves or anything but the average asks", () => {
		const still = new StillFrames();
		still.next(false, "a");
		still.next(true, "a");
		expect(still.next(true, "b")).toEqual({ jitter: [0, 0], weight: 1 });
		still.next(true, "b");
		expect(still.next(false, "b").weight).toBe(1);
	});

	it("moves every depth by the same pixels", () => {
		const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0]);
		const j = jitterClip(m, [0.5, -0.25], 100, 50);
		for (const z of [-1, -10, -100]) {
			const p = [0.3 * -z, 0.1 * -z, z, 1];
			const clip = (mm: Float32Array) =>
				[0, 1, 3].map(
					(r) => mm[r] * p[0] + mm[4 + r] * p[1] + mm[8 + r] * p[2] + mm[12 + r] * p[3],
				);
			const [x0, y0, w0] = clip(m);
			const [x1, y1, w1] = clip(j);
			expect(((x1 / w1 - x0 / w0) * 100) / 2).toBeCloseTo(0.5, 5);
			expect(((y1 / w1 - y0 / w0) * 50) / 2).toBeCloseTo(-0.25, 5);
		}
		expect(jitterClip(m, [0, 0], 100, 50)).toBe(m);
	});

	it("steps by the Halton sequence", () => {
		expect([1, 2, 3, 4].map((i) => halton(i, 2))).toEqual([0.5, 0.25, 0.75, 0.125]);
		expect(halton(1, 3)).toBeCloseTo(1 / 3);
	});
});

describe("SMAA's tables", () => {
	it("unpack to the reference's sizes", async () => {
		const { area, search } = await smaaTables();
		expect(area.length).toBe(SMAA_AREA.width * SMAA_AREA.height * SMAA_AREA.channels);
		expect(search.length).toBe(SMAA_SEARCH.width * SMAA_SEARCH.height);
		expect(area.some((b) => b > 0)).toBe(true);
	});
});

describe("still-frame TAA while beams or particles move", () => {
	it("keeps a running average, the newest frame at least a quarter of it", async () => {
		const { StillFrames: Still, TAA_MOVING: floor } = await import(
			"../src/extensions/placeEditor/app/viewport/antialias.js"
		);
		const still = new Still();
		still.next(false, "a", true);
		const weights = Array.from({ length: 40 }, () => still.next(true, "a", true).weight);
		expect(weights[0]).toBeCloseTo(1 / 2);
		expect(Math.min(...weights)).toBeCloseTo(floor);
		expect(still.settling).toBe(true);
		// Once they stop, it averages to the end and stops.
		still.next(true, "a", false);
		expect(still.settling).toBe(true);
	});
});
