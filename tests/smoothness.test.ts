/**
 * A Smoothness run (1.1.0-canary.121): the frames that reach the screen,
 * paced by the display, with nothing on the GPU timed. What a run of gaps
 * between shown frames comes to, the report it makes, and a comparison that
 * will not set it beside a run that measured the GPU.
 */

import { describe, expect, it } from "vitest";
import { compareRuns } from "../src/extensions/placeEditor/app/benchmark/compare.js";
import {
	type BenchmarkResult,
	benchmarkReport,
	shownScore,
} from "../src/extensions/placeEditor/app/benchmark/result.js";
import { shownFrames } from "../src/extensions/placeEditor/app/viewport/profile.js";

const hz60 = 1000 / 60;

describe("frames shown", () => {
	it("are the display's rate where every refresh shows a new frame", () => {
		const s = shownFrames(Array(60).fill(hz60));
		expect(s?.fps).toBeCloseTo(60, 5);
		expect(s?.missed).toBe(0);
		expect(s?.refresh).toBeCloseTo(hz60, 5);
	});

	it("count the refreshes a late frame left showing the one before", () => {
		// 50 on time, 8 two refreshes long, 2 three long: 8 + 4 missed.
		const gaps = [...Array(50).fill(hz60), ...Array(8).fill(2 * hz60), ...Array(2).fill(3 * hz60)];
		const s = shownFrames(gaps);
		expect(s?.missed).toBe(12);
		expect(s?.worst).toBeCloseTo(3 * hz60, 5);
		// 60 frames over 72 refreshes.
		expect(s?.fps).toBeCloseTo(50, 5);
	});

	it("take the refresh from the frames, so Low Power Mode's 30 counts nothing missed", () => {
		const s = shownFrames(Array(30).fill(2 * hz60));
		expect(s?.refresh).toBeCloseTo(2 * hz60, 5);
		expect(s?.missed).toBe(0);
		expect(s?.fps).toBeCloseTo(30, 5);
	});

	it("count a late frame on a 240 Hz screen too", () => {
		const hz240 = 1000 / 240;
		const s = shownFrames([...Array(230).fill(hz240), ...Array(10).fill(2 * hz240)]);
		expect(s?.refresh).toBeCloseTo(hz240, 5);
		expect(s?.missed).toBe(10);
	});

	it("count late frames against the refresh measured with nothing drawn, though most are late", () => {
		// 100 lights on an iPad: nearly every frame 42 ms. Its own gaps read 42 ms as the refresh.
		const gaps = [...Array(3).fill(hz60), ...Array(40).fill(42)];
		expect(shownFrames(gaps)?.missed).toBe(0);
		const s = shownFrames(gaps, hz60);
		expect(s?.refresh).toBeCloseTo(hz60, 5);
		// Each 42 ms gap is two refreshes and a half, rounded to three: two missed.
		expect(s?.missed).toBe(80);
	});

	it("say nothing from too few frames", () => {
		expect(shownFrames([hz60, hz60])).toBeUndefined();
	});
});

const run = (measure: "busy" | "shown"): BenchmarkResult => {
	const shown = measure === "shown" ? shownFrames(Array(60).fill(hz60)) : undefined;
	const late =
		measure === "shown"
			? shownFrames([...Array(40).fill(hz60), ...Array(10).fill(2 * hz60)])
			: undefined;
	return {
		benchmark: 5,
		seed: 1,
		kind: measure === "shown" ? "smooth" : "current",
		measure,
		release: "1.1.0-canary.121",
		date: "2026-11-26T08:00:00.000Z",
		renderer: "WebGL2",
		gpu: "apple",
		gpuTimers: false,
		pixelRatio: 2,
		userAgent: "test",
		levels: [
			{
				label: "Level 21",
				level: 21,
				canvas: { width: 2266, height: 1316 },
				antialias: "Off",
				stations: [
					{
						n: 1,
						id: "empty",
						name: "Empty",
						still: { label: "Empty", median: hz60, p95: hz60, ...(shown ? { shown } : {}) },
						gpu: [],
						gpuTotal: { median: Number.NaN, p95: Number.NaN },
						moving: [
							{
								label: "Orbit drag",
								median: hz60,
								p95: 2 * hz60,
								frames: 50,
								stages: [],
								gpu: [],
								gpuTotal: { median: Number.NaN, p95: Number.NaN },
								redrawn: null,
								...(late ? { shown: late } : {}),
							},
						],
						counts: { draws: 1, instances: 1, triangles: 2 },
					},
				],
			},
		],
	} as unknown as BenchmarkResult;
};

describe("a Smoothness run's report", () => {
	it("says the frames shown, still and orbiting, and what it measured", () => {
		const text = benchmarkReport(run("shown"));
		expect(text).toContain("· Smoothness");
		expect(text).toContain("with nothing on the GPU timed");
		expect(text).toMatch(/Shown: 60\.0 frames a second across the stations/);
		expect(text).toMatch(/1 Empty\s+60\.0\s+16\.7 ms\s+0\s+\d+\.\d\s+33\.3 ms\s+10/);
		expect(shownScore(run("shown"))).toBeCloseTo(60, 5);
	});

	it("names each GPU error with where it was first seen (1.1.0-canary.133)", () => {
		const errored = {
			...run("busy"),
			gpuErrors: [{ at: "Level 21 · 12 Highlights · Still", message: "Invalid RenderPipeline" }],
		};
		expect(benchmarkReport(errored)).toContain(
			"\n  Level 21 · 12 Highlights · Still: Invalid RenderPipeline",
		);
		expect(benchmarkReport(run("busy"))).not.toContain("GPU errors");
	});

	it("is not compared with a run that measured the GPU, but is with another", () => {
		expect(compareRuns(run("busy"), run("shown")).warnings[0]).toMatch(/Smoothness run/);
		expect(compareRuns(run("busy"), run("shown")).levels).toEqual([]);
		expect(compareRuns(run("shown"), run("shown")).warnings.join(" ")).not.toMatch(
			/Smoothness run/,
		);
	});
});
