/**
 * The Place Editor's profile (1.1.0): each stage's time where the browser has
 * no GPU timers, and what the sweeps say.
 */

import { describe, expect, it, vi } from "vitest";
import {
	type ProfileResult,
	passTimes,
	profileReport,
	profileVerdict,
	QueueClock,
	queueStages,
	type StageFrame,
	spread,
	stageRows,
	steady,
	stepCosts,
	WaitingClock,
} from "../src/extensions/placeEditor/app/viewport/profile.js";

describe("timing stages", () => {
	it("charges the time between waits to each stage", () => {
		let now = 0;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const frames: StageFrame[] = [];
		const clock = new WaitingClock(
			() => undefined,
			(f) => frames.push(f),
		);
		clock.start();
		now = 4;
		clock.mark("shadows");
		now = 10;
		clock.mark("place");
		now = 11;
		clock.mark("place");
		clock.end();
		vi.restoreAllMocks();
		expect(frames).toEqual([{ shadows: 4, place: 7 }]);
	});

	it("times a queue's stages from when each could start to when it was done", () => {
		// Shadows submitted at 0, done at 5; the place submitted at 1 but waits
		// for the shadows, done at 12; post submitted at 20, after, done at 23.
		expect(
			queueStages([
				{ stage: "shadows", at: 0, done: 5 },
				{ stage: "place", at: 1, done: 12 },
				{ stage: "composite", at: 20, done: 23 },
			]),
		).toEqual({ shadows: 5, place: 7, composite: 3 });
	});

	it("hands a queued frame over once every stage is done", async () => {
		const frames: StageFrame[] = [];
		const clock = new QueueClock((f) => frames.push(f));
		let finish!: () => void;
		clock.start();
		clock.submitted("shadows", Promise.resolve());
		clock.submitted("place", new Promise<void>((r) => (finish = r)));
		clock.end();
		await Promise.resolve();
		expect(frames).toHaveLength(0);
		finish();
		await new Promise((r) => setTimeout(r, 0));
		expect(frames).toHaveLength(1);
		expect(Object.keys(frames[0])).toEqual(["shadows", "place"]);
	});
});

describe("reading a frame's GPU stamps", () => {
	const ms = (v: number) => BigInt(Math.round(v * 1e6));
	const at = (...pairs: number[]) => pairs.map(ms);

	it("shares out passes that overlap rather than counting the overlap twice", () => {
		// A tile GPU starts the next pass while the last one finishes.
		expect(passTimes(at(0, 4, 3, 6, 5, 10))).toEqual([4, 2, 4]);
	});

	it("starts a pass whose begin was left stale where the pass before it ended", () => {
		const stamps = at(1000, 1004, 1004, 1006);
		stamps[2] = ms(1); // written a second ago, by another frame
		expect(passTimes(stamps)).toEqual([4, 2]);
	});

	it("drops a pass whose end is before the last one's, and a first pass with no sound pair", () => {
		const stamps = at(10, 12, 12, 15, 15, 18);
		stamps[3] = ms(5);
		expect(passTimes(stamps)).toEqual([2, Number.NaN, 3]);
		expect(passTimes([ms(5000), ms(10), ms(10), ms(12)])).toEqual([Number.NaN, 2]);
	});

	it("leaves the gap before a pass that begins after the last one ended out", () => {
		expect(passTimes(at(0, 2, 5, 6))).toEqual([2, 1]);
	});
});

describe("the middle of rounded times", () => {
	it("falls between a coarse clock's steps, where a median cannot", () => {
		// Frames of 5.4 ms on a clock of whole milliseconds: 60% read 5, 40% read 6.
		const rounded = Array.from({ length: 50 }, (_, i) => (i % 5 < 3 ? 5 : 6));
		expect(spread(rounded).median).toBe(5);
		expect(steady(rounded)).toBeCloseTo(5.4, 1);
	});

	it("is not moved by a hitch at either end", () => {
		const times = [...Array(18).fill(4), 40, 0.01];
		expect(steady(times)).toBe(4);
		expect(steady([3, 5])).toBe(4);
		expect(steady([])).toBeNaN();
	});
});

describe("the numbers", () => {
	it("gives the median and the time 95 frames in 100 come in under", () => {
		const times = Array.from({ length: 100 }, (_, i) => i + 1);
		expect(spread(times)).toEqual({ median: 50.5, p95: 96 });
		expect(spread([3, Number.NaN, 1, 2])).toEqual({ median: 2, p95: 3 });
		expect(spread([]).median).toBeNaN();
	});

	it("lists stages in drawing order, with how many frames drew each", () => {
		const rows = stageRows([
			{ place: 8, shadows: 2 },
			{ place: 10, shadows: 4, skyMaps: 30 },
		]);
		expect(rows.map((r) => [r.stage, r.frames, r.median])).toEqual([
			["skyMaps", 1, 30],
			["shadows", 2, 3],
			["place", 2, 9],
		]);
	});

	it("costs each step by how much slower the frame got", () => {
		const costs = stepCosts([
			{ label: "Parts", median: 10, p95: 12 },
			{ label: "+ Shadows", median: 25, p95: 30 },
		]);
		expect(costs[0].cost).toBeNaN();
		expect(costs[1]).toEqual({ label: "+ Shadows", frame: 25, cost: 15 });
	});
});

const RESULT: ProfileResult = {
	facts: {
		renderer: "WebGPU",
		gpu: "apple common-3",
		gpuTimers: false,
		canvas: { width: 1488, height: 2000 },
		css: { width: 744, height: 1000 },
		pixelRatio: 2,
		samples: 4,
		frameRate: "vsync",
		renderScale: "Automatic, 75%",
		depthPath: "lean",
		quality: "Automatic, Level 12",
		antialias: "FXAA",
		camera: "eye (1, 2, 3) · looking at (0, 0, 0) · 60 studs out",
		draws: 12,
		instances: 40,
		triangles: 2400,
		beams: 0,
		particles: 0,
		userAgent: "Test",
		version: "1.1.0-canary.1",
	},
	baseline: { label: "On screen", median: 83, p95: 120 },
	frame: { label: "One frame", median: 80, p95: 110 },
	stages: [{ stage: "place", frames: 90, median: 40, p95: 50 }],
	stageTotal: { median: 90, p95: 110 },
	gpuStages: [{ stage: "place", frames: 90, median: 12, p95: 14 }],
	gpuStageTotal: { median: 12, p95: 14 },
	stageFrames: 90,
	base: [
		{ label: "Empty frame", median: 20, p95: 22 },
		{ label: "Parts' depth only", median: Number.NaN, p95: Number.NaN },
	],
	asSet: { label: "As set", median: 80, p95: 90 },
	without: [
		{
			title: "Shadows",
			rows: [
				{ label: "Sky shadows", median: 30, p95: 32, saves: 50 },
				{ label: "Soft edges", median: 70, p95: 72, saves: 10 },
			],
		},
	],
	steps: [
		{ label: "Parts, nothing else", median: 30, p95: 35 },
		{ label: "+ Shadows", median: 70, p95: 80 },
	],
	resolution: [
		{ label: "100%", median: 80, p95: 90 },
		{ label: "25%", median: 20, p95: 25 },
	],
	antialias: [
		{ label: "Off", median: 50, p95: 55 },
		{ label: "4×", median: 80, p95: 85 },
	],
	moving: [
		{
			label: "Orbit drag",
			median: 16,
			p95: 18,
			frames: 60,
			stages: [],
			gpu: [
				{ stage: "skyMaps", frames: 20, median: 3, p95: 4 },
				{ stage: "place", frames: 60, median: 5, p95: 6 },
			],
			gpuTotal: { median: 7, p95: 9 },
			redrawn: { probeFaces: 60, nearMaps: 20, sunMaps: 60 },
		},
	],
	precision: [
		{ label: "Half precision", median: 18, p95: 19 },
		{ label: "Full precision", median: 20, p95: 21 },
	],
	depthPath: [
		{ label: "Full depth pre-pass", median: 30, p95: 32 },
		{ label: "Lean, for tile GPUs", median: 20, p95: 22 },
	],
	quality: [
		{
			label: "Level 1",
			median: 8,
			p95: 9,
			level: 1,
			canvas: { width: 372, height: 500 },
			antialias: "Off",
			shadowMap: 512,
			reach: 384,
			blobs: true,
			distance: 500,
			glow: "off",
			adds: [],
			stages: [
				{ stage: "shadows", frames: 20, median: 1, p95: 2 },
				{ stage: "place", frames: 20, median: 3, p95: 4 },
			],
			stageTotal: { median: 4, p95: 6 },
			gpu: [
				{ stage: "shadows", frames: 20, median: 0.5, p95: 1 },
				{ stage: "place", frames: 20, median: 2, p95: 3 },
			],
			gpuTotal: { median: 2.5, p95: 4 },
			draws: 10,
			instances: 30,
			triangles: 1200,
		},
		{
			label: "Level 21",
			median: 40,
			p95: 45,
			level: 21,
			canvas: { width: 1488, height: 2000 },
			antialias: "MSAA 4×",
			shadowMap: 2048,
			reach: 578,
			blobs: false,
			distance: null,
			glow: "full",
			adds: ["Blur"],
			stages: [{ stage: "place", frames: 20, median: 30, p95: 33 }],
			stageTotal: { median: 30, p95: 33 },
			gpu: [{ stage: "place", frames: 20, median: 20, p95: 22 }],
			gpuTotal: { median: 20, p95: 22 },
			draws: 12,
			instances: 40,
			triangles: 2400,
		},
	],
	clock: 1,
};

describe("what the profile says", () => {
	it("judges by the GPU's own times where every row has one, and shows them", () => {
		const timed = {
			...RESULT,
			frame: { ...RESULT.frame, gpuMs: 6 },
			// Waited, the full frame reads slow (a refresh missed); the GPU says not.
			resolution: [
				{ label: "100%", median: 16, p95: 17, gpuMs: 4 },
				{ label: "25%", median: 8, p95: 9, gpuMs: 3.5 },
			],
		};
		expect(profileVerdict(timed)[0]).toMatch(
			/^Not bound by filling pixels: a quarter of the pixels is only 1\.1×/,
		);
		const text = profileReport(timed);
		expect(text).toMatch(/100%\s+16\.0 ms\s+63 fps\s+GPU\s+4\.00 ms/);
		expect(text).toContain("then the GPU's own time");
	});

	it("calls a frame that is much faster with fewer pixels bound by filling them", () => {
		expect(profileVerdict(RESULT)).toEqual([
			"Bound by filling pixels: at a quarter of the pixels the frame is 4.0× as fast.",
			"The costliest step is + Shadows: 40.0 ms a frame.",
			"Of the switches tried alone, Sky shadows off saves the most: 50.0 ms a frame.",
		]);
		const flat = {
			...RESULT,
			resolution: [RESULT.resolution[0], { label: "25%", median: 70, p95: 75 }],
		};
		expect(profileVerdict(flat)[0]).toMatch(/^Not bound by filling pixels/);
	});

	it("puts everything in the report, to paste", () => {
		const text = profileReport(RESULT);
		expect(text).toContain("Roswaal 1.1.0-canary.1, Place Editor profile");
		expect(text).toContain("GPU timers: no");
		expect(text).toContain("On screen: 83.0 ms (12 fps)");
		expect(text).toContain("One frame, waited for: 80.0 ms");
		expect(text).toContain("Canvas: 1488×2000 px (744×1000 at 2×)");
		expect(text).toMatch(/Parts and images\s+40\.0 ms\s+50\.0 ms/);
		expect(text).toMatch(/\+ Shadows\s+70\.0 ms \+40\.0 ms/);
		expect(text).toMatch(/25%\s+20\.0 ms\s+50 fps/);
		expect(text).toMatch(/Empty frame\s+20\.0 ms/);
		expect(text).toMatch(
			/Antialiasing, the view built again for each:\n\s+Off\s+50\.0 ms\s+20 fps\n\s+4×\s+80\.0 ms/,
		);
		expect(text).toMatch(
			/Quality levels, each with its own scale and antialiasing:\n\s+Level 1\s+8\.00 ms\s+125 fps\n\s+Level 21\s+40\.0 ms\s+25 fps/,
		);
		expect(text).toMatch(
			/Depth path:\n\s+Full depth pre-pass\s+30\.0 ms[^\n]*\n\s+Lean, for tile GPUs\s+20\.0 ms/,
		);
		expect(text).toMatch(
			/Shader precision, the view built again for each:\n\s+Half precision\s+18\.0 ms/,
		);
		expect(text).toMatch(/Parts' depth only\s+not here/);
		expect(text).toContain("Quality: Automatic, Level 12");
		expect(text).not.toContain("Not loaded");
		expect(text).not.toContain("Did not settle");
		// 1.1.0-canary.135: what did not settle in time, and the GPU's errors.
		const stalled = profileReport({
			...RESULT,
			stalls: [
				"Antialiasing FXAA: the view's shaders were not ready after 45 s; measured as drawn",
			],
			gpuErrors: ["Invalid RenderPipeline"],
		});
		expect(stalled).toContain(
			"Did not settle: Antialiasing FXAA: the view's shaders were not ready after 45 s",
		);
		expect(stalled).toContain("GPU error: Invalid RenderPipeline");
		const gaps = profileReport({
			...RESULT,
			facts: {
				...RESULT.facts,
				assets: {
					meshes: { needed: 300, missing: 298 },
					unions: { needed: 0, missing: 0 },
					images: { needed: 12, missing: 0 },
				},
			},
		});
		expect(gaps).toContain(
			"Not loaded: 298 of 300 meshes. Their parts are drawn as boxes, so these times leave their cost out.\nQuality:",
		);
		expect(text).toMatch(
			/Camera moving[^\n]*\n\s+Orbit drag\s+16\.0 ms\s+63 fps\s+GPU\s+7\.00 ms\n\s+Sky maps 3\.00 ms · Parts 5\.00 ms\n\s+over 60 frames, drawn again: 60 reflection faces, 20 near sky maps/,
		);
		expect(text).toContain("Antialiasing: FXAA");
		expect(text).toMatch(
			/Each level's stages by the GPU's own timers[^\n]*\n\s+Level\s+Frame\s+Shadows\s+Parts\s+Total\n\s+1\s+8\.00 ms\s+0\.50 ms\s+2\.00 ms\s+2\.50 ms\n\s+21\s+40\.0 ms\s+–\s+20\.0 ms\s+20\.0 ms/,
		);
		expect(text).toMatch(
			/The same stages by the GPU's own timers[^\n]*\n\s+Parts and images\s+12\.0 ms\s+14\.0 ms\n\s+All stages\s+12\.0 ms/,
		);
		expect(text).toContain(
			"Level 1   372×500 · Off · soft shadows, map 512 · glow off · to 500 studs · 10 draws · 1,200 triangles",
		);
		expect(text).toMatch(/Level 21 [^\n]*MSAA 4×[^\n]*every distance[^\n]*\n\s+adds Blur/);
		expect(text).toMatch(/Without Sky shadows\s+30\.0 ms\s+50\.0 ms/);
	});
});
