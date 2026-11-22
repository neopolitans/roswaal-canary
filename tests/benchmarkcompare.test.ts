/**
 * Two benchmark runs compared: the drift between them (a warmer device is
 * slower everywhere) taken out, and a change called only past the noise.
 */

import { describe, expect, it } from "vitest";
import {
	compareRuns,
	comparisonReport,
	NOISE_FLOOR,
	readResults,
} from "../src/extensions/placeEditor/app/benchmark/compare.js";
import type {
	BenchmarkResult,
	BenchmarkStationResult,
} from "../src/extensions/placeEditor/app/benchmark/result.js";

const station = (n: number, gpuMs: number, repeat?: number): BenchmarkStationResult => ({
	n,
	id: `s${n}`,
	name: `Station ${n}`,
	variant: "",
	still: { label: "", median: gpuMs + 4, p95: gpuMs + 5, gpuMs },
	...(repeat !== undefined
		? { repeat: { label: "", median: repeat + 4, p95: repeat + 5, gpuMs: repeat } }
		: {}),
	gpu: [],
	gpuTotal: { median: gpuMs, p95: gpuMs },
	moving: [],
	counts: { draws: 1, instances: 1, triangles: 12, particles: 0, beams: 0 },
});

const run = (
	date: string,
	times: (number | [number, number])[],
	more: Partial<BenchmarkResult> = {},
): BenchmarkResult => ({
	benchmark: 1,
	seed: 1,
	kind: "current",
	release: "1.1.0-canary.21",
	date,
	renderer: "WebGPU",
	gpu: "apple",
	gpuTimers: true,
	pixelRatio: 2,
	userAgent: "Test",
	levels: [
		{
			label: "Level 21",
			level: 21,
			canvas: { width: 2266, height: 1316 },
			antialias: "Off",
			stations: times.map((t, i) =>
				Array.isArray(t) ? station(i + 1, t[0], t[1]) : station(i + 1, t),
			),
		},
	],
	...more,
});

const BEFORE = [10, 12, 8, 15, 9, 11, 14, 10];

describe("comparing two benchmark runs", () => {
	it("takes out a drift the whole run shares, so nothing is called a change", () => {
		const c = compareRuns(
			run("2026-11-22T08:00", BEFORE),
			run(
				"2026-11-22T09:00",
				BEFORE.map((t) => t * 1.2),
			),
		);
		const level = c.levels[0];
		expect(level.drift).toBeCloseTo(1.2, 6);
		expect(level.band).toBe(NOISE_FLOOR);
		expect(level.stations.every((s) => s.verdict === "within noise")).toBe(true);
		expect(level.stations[0].adjusted).toBeCloseTo(1, 6);
	});

	it("calls the one station that changed, past the drift", () => {
		const after = BEFORE.map((t) => t * 1.1);
		after[3] = BEFORE[3] * 0.7;
		const level = compareRuns(run("a", BEFORE), run("b", after)).levels[0];
		expect(level.drift).toBeCloseTo(1.1, 6);
		expect(level.stations[3].verdict).toBe("faster");
		expect(level.stations[3].adjusted).toBeCloseTo(0.7 / 1.1, 6);
		expect(level.stations.filter((s) => s.verdict !== "within noise")).toHaveLength(1);
	});

	it("widens a station's band by how far its own two passes were apart", () => {
		const before: (number | [number, number])[] = [...BEFORE];
		before[2] = [8, 12];
		const after = BEFORE.map((t) => t * 1.0);
		after[2] = 7;
		const level = compareRuns(run("a", before), run("b", after)).levels[0];
		// Its passes were 50% apart, and the other run, measured once, is taken as as noisy: the two add.
		expect(level.stations[2].band).toBeCloseTo(Math.hypot(0.5, 0.5), 6);
		expect(level.stations[2].before).toBe(10);
		expect(level.stations[2].verdict).toBe("within noise");
	});

	it("calls no change under what the GPU's timer resolves", () => {
		const fast = [0.2, 0.13, 0.13, 0.2, 0.33, 0.2, 0.13, 0.2];
		const after = [...fast];
		after[0] = 0.26;
		expect(compareRuns(run("a", fast), run("b", after)).levels[0].stations[0].verdict).toBe(
			"within noise",
		);
	});

	it("says when the runs are not like for like, or share no level", () => {
		const c = compareRuns(run("a", BEFORE), run("b", BEFORE, { gpu: "nvidia blackwell" }));
		expect(c.warnings[0]).toMatch(/Different devices or renderers/);
		const other = run("b", BEFORE);
		other.levels[0].level = 13;
		expect(compareRuns(run("a", BEFORE), other).warnings).toContain(
			"The two runs share no quality level.",
		);
	});

	it("reports the drift, the noise, each station's change before and after it, and when the noise is too wide", () => {
		const after = BEFORE.map((t, i) => t * (i % 2 ? 1.5 : 0.8));
		const text = comparisonReport(
			compareRuns(run("2026-11-22T08:59:00Z", BEFORE), run("2026-11-22T09:10:00Z", after)),
		);
		expect(text).toContain(
			"Roswaal Benchmark 1: 1.1.0-canary.21, 2026-11-22 09:10 against 1.1.0-canary.21, 2026-11-22 08:59",
		);
		expect(text).toMatch(
			/Level 21, by the GPU: the second run is [+−]\d+% across the stations \(the median; drift\), noise ±\d+%/,
		);
		expect(text).toMatch(/Noise this wide hides changes under about \d+%/);
		expect(text).toMatch(/ 1 Station 1\s+10\.0 ms\s+8\.00 ms\s+−20%/);
	});

	it("reads a results file back, and refuses what is not one", () => {
		expect("result" in readResults(JSON.stringify(run("a", BEFORE)))).toBe(true);
		expect(readResults("{}")).toEqual({ error: "It is not a Roswaal Benchmark results file." });
		expect(readResults("not json")).toEqual({ error: "It is not JSON." });
	});
});
