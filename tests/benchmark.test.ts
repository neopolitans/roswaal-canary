/**
 * Roswaal Benchmark: its places are generated the same way every time, as
 * the plan promises, and its scores and report say what was measured.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compareRuns } from "../src/extensions/placeEditor/app/benchmark/compare.js";
import {
	abFinding,
	type BenchmarkResult,
	type BenchmarkStationResult,
	benchmarkReport,
	levelScore,
	pixelFit,
	stationPixelFits,
	stationScore,
} from "../src/extensions/placeEditor/app/benchmark/result.js";
import {
	BENCHMARK_VERSION,
	STATIONS,
	seeded,
} from "../src/extensions/placeEditor/app/benchmark/stations.js";
import { readGlb } from "../src/extensions/placeEditor/core/glb.js";
import { benchmarkAsset, SCENE_KINDS } from "../src/extensions/placeEditor/core/scene.js";

const parts = (place: {
	kinds: Record<string, { count: number }>;
	translucent: Record<string, { count: number }>;
}) => SCENE_KINDS.reduce((n, k) => n + place.kinds[k].count + place.translucent[k].count, 0);

// The carried models and textures, read from the repository rather than fetched.
beforeAll(() => {
	vi.stubGlobal("fetch", async (url: string) => {
		const bytes = readFileSync(fileURLToPath(url));
		return new Response(bytes);
	});
});
afterAll(() => vi.unstubAllGlobals());

describe("Roswaal Benchmark's places", () => {
	it("is version 4, with fifteen stations in run order", () => {
		expect(BENCHMARK_VERSION).toBe(4);
		expect(STATIONS.map((s) => s.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
		expect(STATIONS.map((s) => s.id).slice(0, 5)).toEqual([
			"empty",
			"materials",
			"textures",
			"shapes",
			"meshes",
		]);
		expect(STATIONS.find((s) => s.id === "lights")?.variants.map((v) => v.label)).toEqual([
			"10 lights",
			"20 lights",
			"50 lights",
			"100 lights",
		]);
	});

	it("are made the same way every time: the seeded generator and the places it makes", async () => {
		const a = seeded(1);
		const b = seeded(1);
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
		const shapes = STATIONS.find((s) => s.id === "shapes")!.variants[0];
		const one = await shapes.place();
		const two = await shapes.place();
		expect(Array.from(one.kinds.block.data)).toEqual(Array.from(two.kinds.block.data));
		expect(parts(one)).toBe(1201);
	});

	it("hold what each station is for", async () => {
		const place = (id: string, i = 0) =>
			Promise.resolve(STATIONS.find((s) => s.id === id)!.variants[i].place());
		expect(parts(await place("dense"))).toBe(1 + 140 * 140);
		expect((await place("lights", 3)).lights?.length).toBe(100 * 20);
		expect((await place("highlights")).highlights).toHaveLength(4);
		const effects = (await place("effects", 2)).effects;
		expect(effects?.beams).toHaveLength(100);
		expect(effects?.emitters).toHaveLength(20);
		const air = (await place("air")).lighting;
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
		const busy = benchmarkReport({ ...result, benchmark: 2, measure: "busy" });
		expect(busy).toContain("Measured with the GPU kept busy, two frames in flight");
		expect(busy).toMatch(/Station\s+GPU\s+Interval/);
		expect(busy).toContain("by the frame interval");
		const warmLevel = {
			...result.levels[0],
			stations: result.levels[0].stations.map((s) => ({ ...s, repeat: { ...s.still, gpuMs: 5 } })),
		};
		const warm = benchmarkReport({ ...result, passes: 2, levels: [warmLevel] });
		expect(warm).toContain("with a warm pass");
		expect(warm).toMatch(/Score\s+Warm/);
		expect(warm).toContain(
			"Warm: each station again after the whole first pass, +25% across the stations",
		);
		const off = benchmarkReport({ ...result, switchedOff: ["Occlusion culling"] });
		expect(off).toContain("Switched off in the Rendering panel: Occlusion culling");
	});
});

describe("the models and textures it carries", () => {
	const station = (id: string) =>
		Promise.resolve(STATIONS.find((s) => s.id === id)!.variants[0].place());

	it("reads every tank as its parts, emblems left out", () => {
		const tiger = readGlb(
			new Uint8Array(
				readFileSync(
					new URL("../src/extensions/placeEditor/app/benchmark/tanks/TigerI.glb", import.meta.url),
				),
			),
		);
		expect(tiger).toHaveLength(25);
		expect(tiger.reduce((n, p) => n + p.mesh.indices.length / 3, 0)).toBe(4934);
		const churchill = readGlb(
			new Uint8Array(
				readFileSync(
					new URL(
						"../src/extensions/placeEditor/app/benchmark/tanks/Churchill_VII.glb",
						import.meta.url,
					),
				),
			),
		);
		expect(churchill.some((p) => /emblem|gloriana/i.test(p.name))).toBe(false);
	});

	it("lays out ninety-six tanks of MeshParts, each mesh carried, none asked of Roblox", async () => {
		const place = await station("meshes");
		const meshes = place.provided?.meshes;
		expect(meshes?.size).toBe(298);
		// Every mesh the place names is one it carries.
		for (const use of place.meshes ?? []) expect(meshes?.has(use.asset)).toBe(true);
		expect(place.meshes?.every((use) => use.asset.startsWith("benchmark/"))).toBe(true);
		expect(place.kinds.mesh.count).toBe(6 * 298);
		const again = await station("meshes");
		expect(Array.from(again.kinds.mesh.data)).toEqual(Array.from(place.kinds.mesh.data));
	});

	it("puts a texture on every face of the wall, and tiles the floor", async () => {
		const place = await station("textures");
		expect(place.images).toHaveLength(24 * 6 + 18);
		expect(new Set(place.images?.map((i) => i.asset))).toEqual(
			new Set(place.images?.map((i) => i.asset).filter((a) => a.startsWith("benchmark/"))),
		);
		expect(place.images?.[0].asset).toMatch(new RegExp(`^${benchmarkAsset("")}`));
	});
});

describe("an A/B run", () => {
	const timed = (gpuMs: number) => ({ label: "", median: gpuMs + 1, p95: gpuMs + 1, gpuMs });
	const measured = (on: number[], off: number[]): BenchmarkStationResult => ({
		...station(1, on[0], on[0] + 1),
		ab: { on: on.map(timed), off: off.map(timed) },
	});

	it("says a switch pays where turning it off costs more than its own measurements vary", () => {
		expect(abFinding(measured([10, 10.2], [12, 12.3]), true)).toMatchObject({
			verdict: "pays",
			saves: expect.closeTo(2.05, 6),
		});
		expect(abFinding(measured([10, 10.2], [8, 8.1]), true)?.verdict).toBe("costs");
		// The two measurements either side were a millisecond apart: half a millisecond is not called.
		expect(abFinding(measured([10, 11], [10.5, 11.5]), true)?.verdict).toBe("no clear difference");
		// Nor is a difference a fast GPU's timer cannot resolve.
		expect(abFinding(measured([0.2, 0.2], [0.33, 0.33]), true)?.verdict).toBe(
			"no clear difference",
		);
		expect(abFinding(station(1, 4, 5), true)).toBeNull();
	});

	it("reports what the switch saves at each station, and is never compared as a run", () => {
		const result: BenchmarkResult = {
			benchmark: 3,
			seed: 1,
			kind: "ab",
			ab: { feature: "occlusionCulling", label: "Occlusion culling" },
			release: "1.1.0-canary.27",
			date: "2026-11-22T12:00:00.000Z",
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
					stations: [
						measured([10, 10.2], [12, 12.3]),
						{ ...measured([6, 6], [4, 4.1]), n: 2, name: "Station 2" },
					],
				},
			],
		};
		const text = benchmarkReport(result);
		expect(text).toContain("· A/B: Occlusion culling");
		expect(text).toMatch(/1 Station 1\s+10\.1 ms\s+12\.2 ms\s+\+2\.05 ms\s+pays 2\.05 ms/);
		expect(text).toMatch(/2 Station 2\s+6\.00 ms\s+4\.05 ms\s+−1\.95 ms\s+costs 1\.95 ms/);
		const plain = {
			...result,
			ab: undefined,
			kind: "current" as const,
			date: "2026-11-22T11:00:00.000Z",
		};
		expect(compareRuns(plain, result).levels).toEqual([]);
		expect(compareRuns(plain, result).warnings[0]).toMatch(/A\/B run/);
	});
});

describe("a Pixel cost run", () => {
	const timed = (gpuMs: number) => ({ label: "", median: gpuMs + 1, p95: gpuMs + 1, gpuMs });
	// An iPad Mini's view at 50%, 100% and Native: 0.19, 0.75 and 2.98 million pixels.
	const sizes = [
		[0.5, 567, 329],
		[1, 1133, 658],
		[2, 2266, 1316],
	] as const;
	const measured = (fixed: number, perMp: number, depthPerMp: number): BenchmarkStationResult => ({
		...station(1, 0, 0),
		pixels: sizes.map(([scale, width, height]) => {
			const mp = (width * height) / 1e6;
			return {
				scale,
				width,
				height,
				still: timed(fixed + perMp * mp),
				depthOnly: timed(fixed + depthPerMp * mp),
				gpu: [
					{ stage: "occlusion" as const, frames: 30, median: 0.2 + 0.5 * mp, p95: 0 },
					{ stage: "place" as const, frames: 30, median: fixed + (perMp - 0.5) * mp, p95: 0 },
				],
				gpuTotal: { median: fixed + perMp * mp, p95: 0 },
			};
		}),
	});

	it("fits a fixed cost and a cost a million pixels, and how nearly the times lie on it", () => {
		const fit = pixelFit([
			[1, 3],
			[2, 5],
			[4, 9],
		]);
		expect(fit?.fixed).toBeCloseTo(1, 9);
		expect(fit?.perMp).toBeCloseTo(2, 9);
		expect(fit?.r2).toBeCloseTo(1, 9);
		expect(pixelFit([[1, 3]])).toBeNull();
		expect(
			pixelFit([
				[1, 3],
				[1, 4],
			]),
		).toBeNull();
		expect(
			pixelFit([
				[1, 3],
				[2, Number.NaN],
			]),
		).toBeNull();
		expect(
			pixelFit([
				[1, 1],
				[2, 3],
				[3, 2],
			])?.r2,
		).toBeLessThan(0.5);
	});

	it("separates the shaded pixel from the parts' depth, and each stage", () => {
		const fits = stationPixelFits(measured(1.5, 4, 0.6), true);
		expect(fits?.shaded?.fixed).toBeCloseTo(1.5, 6);
		expect(fits?.shaded?.perMp).toBeCloseTo(4, 6);
		expect(fits?.depth?.perMp).toBeCloseTo(0.6, 6);
		expect(fits?.stages.map(([stage, f]) => [stage, Number(f.perMp.toFixed(6))])).toEqual([
			["occlusion", 0.5],
			["place", 3.5],
		]);
		expect(stationPixelFits(station(1, 4, 5), true)).toBeNull();
	});

	it("reports each station's costs, and is never compared as a run", () => {
		const result: BenchmarkResult = {
			benchmark: 4,
			seed: 1,
			kind: "pixels",
			release: "1.1.0-canary.34",
			date: "2026-11-23T20:00:00.000Z",
			renderer: "WebGPU",
			gpu: "apple",
			gpuTimers: true,
			pixelRatio: 2,
			userAgent: "Test",
			levels: [
				{
					label: "Level 18",
					level: 18,
					canvas: { width: 2266, height: 1316 },
					antialias: "SMAA",
					stations: [
						measured(1.5, 4, 0.6),
						{ ...measured(2, 3, 0.5), n: 2, name: "Station 2" },
						{ ...measured(1, 2, 0.4), n: 3, name: "Station 3" },
					],
				},
			],
		};
		const text = benchmarkReport(result);
		expect(text).toContain("· Pixel cost");
		expect(text).toContain("Level 18 · SMAA · 50% 567×329, 100% 1133×658, 200% 2266×1316");
		expect(text).toContain(
			"A shaded pixel: 3.00 ns across the stations (the median), up to 4.00; the parts' depth alone 0.50 ns.",
		);
		expect(text).toMatch(/1 Station 1\s+1\.50 ms\s+4\.00\s+0\.60\s+3\.40\s+1\.00/);
		expect(text).toContain("Occlusion 0.50 (0.20 ms)");
		const plain = { ...result, kind: "current" as const, date: "2026-11-23T19:00:00.000Z" };
		expect(compareRuns(plain, result).levels).toEqual([]);
		expect(compareRuns(plain, result).warnings[0]).toMatch(/Pixel cost run/);
	});
});
