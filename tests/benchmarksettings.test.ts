/**
 * A benchmark run records Settings › Scene view as it found them (1.1.0-canary.111):
 * the quality level, render scale and each effect's resolution, by their
 * names in Settings, in the file, in its text, and in a comparison where
 * two runs differ.
 */

import { describe, expect, it } from "vitest";
import { compareRuns } from "../src/extensions/placeEditor/app/benchmark/compare.js";
import {
	type BenchmarkResult,
	benchmarkReport,
	benchmarkSettings,
} from "../src/extensions/placeEditor/app/benchmark/result.js";

const run = (settings: Record<string, string>): BenchmarkResult => ({
	benchmark: 5,
	seed: 1,
	kind: "current",
	settings,
	release: "1.1.0-canary.111",
	date: "2026-11-25T19:00:00.000Z",
	renderer: "WebGPU",
	gpu: "apple",
	gpuTimers: true,
	pixelRatio: 2,
	userAgent: "test",
	levels: [],
});

describe("a benchmark's settings", () => {
	it("names each as Settings does, Automatic where unset", () => {
		const s = benchmarkSettings({
			quality: 21,
			renderScale: 0.75,
			dynamicOptimization: false,
			lightGrid: "8",
			lampResolution: "auto",
			particleResolution: "half",
		});
		expect(s.Quality).toBe("Level 21");
		expect(s["Render scale"]).toBe("75%");
		expect(s["Dynamic optimization"]).toBe("Off");
		expect(s["Light object grid"]).toBe("8");
		expect(s["Light objects resolution"]).toBe("Automatic");
		expect(s["Particle resolution"]).toBe("half");
		expect(s["Sky light resolution"]).toBe("Automatic");
		expect(benchmarkSettings({ quality: "auto" }).Quality).toBe("Automatic");
	});

	it("are in the run's text", () => {
		const text = benchmarkReport(run(benchmarkSettings({ quality: 21, lightGrid: "8" })));
		expect(text).toMatch(/Settings: Quality Level 21 · .*Light object grid 8/);
	});

	it("are said where two runs differ, and not where they agree", () => {
		const a = run(benchmarkSettings({ quality: 21, lightGrid: "8" }));
		const b = run(benchmarkSettings({ quality: 21, lightGrid: "off" }));
		expect(compareRuns(a, b).warnings.join(" ")).toContain("Light object grid 8, then off");
		expect(compareRuns(a, a).warnings.join(" ")).not.toContain("Different settings");
		// A run from before settings were recorded compares without the warning.
		expect(compareRuns({ ...a, settings: undefined }, b).warnings.join(" ")).not.toContain(
			"Different settings",
		);
	});
});
