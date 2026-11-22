/**
 * Roswaal Benchmark 1: its places are generated the same way every time, as
 * the plan promises, and its scores and report say what was measured.
 */

import { describe, expect, it } from "vitest";
import {
	type BenchmarkResult,
	type BenchmarkStationResult,
	benchmarkReport,
	levelScore,
	stationScore,
} from "../src/extensions/placeEditor/app/benchmark/result.js";
import {
	BENCHMARK_VERSION,
	STATIONS,
	seeded,
} from "../src/extensions/placeEditor/app/benchmark/stations.js";
import { SCENE_KINDS } from "../src/extensions/placeEditor/core/scene.js";

const parts = (place: {
	kinds: Record<string, { count: number }>;
	translucent: Record<string, { count: number }>;
}) => SCENE_KINDS.reduce((n, k) => n + place.kinds[k].count + place.translucent[k].count, 0);

describe("Roswaal Benchmark 1's places", () => {
	it("is version 1, with thirteen stations in run order", () => {
		expect(BENCHMARK_VERSION).toBe(1);
		expect(STATIONS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
		expect(STATIONS.find((s) => s.id === "lights")?.variants.map((v) => v.label)).toEqual([
			"10 lights",
			"20 lights",
			"50 lights",
			"100 lights",
		]);
	});

	it("are made the same way every time: the seeded generator and the places it makes", () => {
		const a = seeded(1);
		const b = seeded(1);
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
		const shapes = STATIONS.find((s) => s.id === "shapes")!.variants[0];
		const one = shapes.place();
		const two = shapes.place();
		expect(Array.from(one.kinds.block.data)).toEqual(Array.from(two.kinds.block.data));
		expect(parts(one)).toBe(1201);
	});

	it("hold what each station is for", () => {
		const place = (id: string, i = 0) => STATIONS.find((s) => s.id === id)!.variants[i].place();
		expect(parts(place("dense"))).toBe(1 + 140 * 140);
		expect(place("lights", 3).lights?.length).toBe(100 * 20);
		expect(place("highlights").highlights).toHaveLength(4);
		const effects = place("effects", 2).effects;
		expect(effects?.beams).toHaveLength(100);
		expect(effects?.emitters).toHaveLength(20);
		const air = place("air").lighting;
		expect(air.post.bloom).toBeDefined();
		expect(air.post.blur).toBe(4);
	});
});

const station = (n: number, gpuMs: number, waited: number): BenchmarkStationResult => ({
	n,
	id: `s${n}`,
	name: `Station ${n}`,
	variant: "",
	still: {
		label: "",
		median: waited,
		p95: waited,
		gpuMs,
		cpuMs: waited - 1,
		cpuSteps: { effects: 1, culling: 0.5 },
	},
	gpu: [{ stage: "place", frames: 30, median: gpuMs, p95: gpuMs }],
	gpuTotal: { median: gpuMs, p95: gpuMs },
	moving: [],
	counts: { draws: 10, instances: 100, triangles: 1200, particles: 0, beams: 0 },
});

describe("a benchmark's scores", () => {
	it("are the rate a station's GPU time allows, beside its waited frame's", () => {
		expect(stationScore(station(1, 4, 10))).toEqual({ gpu: 250, waited: 100 });
	});

	it("take a level's as the geometric mean, so one heavy station does not hide the rest", () => {
		const level = {
			label: "Level 13",
			level: 13,
			canvas: { width: 1, height: 1 },
			antialias: "SMAA",
			stations: [station(1, 1, 2), station(2, 100, 200)],
		};
		expect(levelScore(level).gpu).toBeCloseTo(100, 6);
		expect(levelScore(level).waited).toBeCloseTo(50, 6);
	});

	it("are reported station by station, a CPU-bound one marked", () => {
		const result: BenchmarkResult = {
			benchmark: 1,
			seed: 1,
			kind: "current",
			release: "1.1.0-canary.20",
			date: "2026-11-22T10:30:00.000Z",
			renderer: "WebGPU",
			gpu: "apple",
			gpuTimers: true,
			pixelRatio: 2,
			userAgent: "Test",
			levels: [
				{
					label: "Level 13",
					level: 13,
					canvas: { width: 1133, height: 658 },
					antialias: "SMAA",
					stations: [station(1, 4, 6), station(9, 4, 20)],
				},
			],
		};
		const text = benchmarkReport(result);
		expect(text).toContain("Roswaal Benchmark 1 · Roswaal 1.1.0-canary.20 · Current settings");
		expect(text).toMatch(/Level 13 · 1133×658 · SMAA/);
		expect(text).toMatch(/9 Station 9\s+4\.00 ms\s+20\.0 ms\s+19\.0 ms[^\n]*CPU-bound/);
		expect(text).not.toMatch(/1 Station 1[^\n]*CPU-bound/);
		expect(text).toContain("CPU: effects 1.00 ms · culling 0.50 ms");
	});
});
