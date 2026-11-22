/**
 * The Place Editor's profile (1.1.0): each stage's time where the browser has
 * no GPU timers, and what the sweeps say.
 */

import { describe, expect, it, vi } from "vitest";
import {
	type ProfileResult,
	profileReport,
	profileVerdict,
	QueueClock,
	queueStages,
	type StageFrame,
	spread,
	stageRows,
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
	clock: 1,
};

describe("what the profile says", () => {
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
		expect(text).toMatch(/Parts' depth only\s+not here/);
		expect(text).toMatch(/Without Sky shadows\s+30\.0 ms\s+50\.0 ms/);
	});
});
