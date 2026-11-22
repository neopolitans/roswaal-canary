/**
 * Quality levels: Studio's render distances and bands, Automatic's first
 * level and its steps, and what a level asks of the sun's cascades.
 */

import { describe, expect, it } from "vitest";
import {
	AutoQuality,
	DOWN_AFTER,
	levelPreset,
	presetLevel,
	QUALITY_LEVELS,
	qualityLevel,
	startLevel,
	UP_AFTER,
} from "../src/extensions/placeEditor/app/viewport/quality.js";
import {
	changedFrom,
	type FeatureKey,
	STUDIO_FEATURES,
} from "../src/extensions/placeEditor/app/viewport/renderFeatures.js";
import {
	boxBeyond,
	CASCADE_BLOCK,
	cascadeBlock,
	cascadeFars,
	SUN_CASCADES,
} from "../src/extensions/placeEditor/app/viewport/view.js";

describe("quality levels", () => {
	it("are 21, the top one everything, As Studio", () => {
		expect(QUALITY_LEVELS).toHaveLength(21);
		const top = qualityLevel(21);
		expect(top.features).toEqual(STUDIO_FEATURES);
		expect(top.distance).toBeNull();
		expect(top.antialias).toBe(4);
		expect(top.scale).toBe(1);
		expect(top.reach).toBe(SUN_CASCADES[SUN_CASCADES.length - 1]);
	});

	it("draw as far as Studio's did at each level", () => {
		const distances = QUALITY_LEVELS.map((q) => q.distance);
		expect(distances).toEqual([
			500,
			800,
			1100,
			1550,
			1550,
			1550,
			1550,
			1550,
			1550,
			1550,
			1550,
			1550,
			2200,
			3000,
			4000,
			6000,
			null,
			null,
			null,
			null,
			null,
		]);
	});

	it("keep Fast (iPad)'s switches at Level 15", () => {
		const fast: FeatureKey[] = ["softEdges", "skyReflections", "farShadows", "particles", "blur"];
		expect(changedFrom(qualityLevel(15).features).sort()).toEqual([...fast].sort());
	});

	it("turn glow on at 6 and sharp shadows at 10, with a blurred stand-in below", () => {
		expect(qualityLevel(5).features.neonGlow).toBe(false);
		expect(qualityLevel(6).features.neonGlow).toBe(true);
		expect(qualityLevel(9).blobWidth).not.toBeNull();
		expect(qualityLevel(9).shadowMap).toBe(512);
		expect(qualityLevel(10).blobWidth).toBeNull();
		expect(qualityLevel(10).shadowMap).toBe(1024);
		expect(qualityLevel(13).shadowMap).toBe(2048);
		for (const q of QUALITY_LEVELS) expect(q.features.sunShadows).toBe(true);
	});

	it("antialias from 13 and draw fewer pixels below 10", () => {
		expect(qualityLevel(12).antialias).toBe(1);
		expect(qualityLevel(13).antialias).toBe(4);
		expect([1, 2, 3, 9, 10].map((n) => qualityLevel(n).scale)).toEqual([0.5, 0.5, 0.75, 0.75, 1]);
	});

	it("never take away what a lower level has, and reach further as they rise", () => {
		for (let i = 1; i < QUALITY_LEVELS.length; i++) {
			const lower = QUALITY_LEVELS[i - 1];
			const q = QUALITY_LEVELS[i];
			expect(changedFrom(q.features).every((k) => changedFrom(lower.features).includes(k))).toBe(
				true,
			);
			expect(q.reach).toBeGreaterThanOrEqual(lower.reach);
			expect(q.distance ?? Infinity).toBeGreaterThanOrEqual(lower.distance ?? Infinity);
		}
	});

	it("are held within 1–21 and named as presets", () => {
		expect(qualityLevel(0).level).toBe(1);
		expect(qualityLevel(40).level).toBe(21);
		expect(levelPreset(7)).toBe("level-7");
		expect(presetLevel("level-7")).toBe(7);
		expect(presetLevel("debug-sun")).toBeNull();
	});
});

describe("Automatic", () => {
	it("starts from the device", () => {
		expect(startLevel({ touch: true, shortSide: 390, gpu: "" })).toBe(5);
		expect(startLevel({ touch: true, shortSide: 744, gpu: "apple" })).toBe(10);
		expect(startLevel({ touch: false, shortSide: 1080, gpu: "intel gen-12lp" })).toBe(15);
		expect(startLevel({ touch: false, shortSide: 1080, gpu: "nvidia ampere" })).toBe(21);
		expect(startLevel({ touch: false, shortSide: 1080, gpu: "" })).toBe(21);
	});

	const run = (auto: AutoQuality, ms: number, forMs: number) => {
		let moved: number | null = null;
		for (let t = 0; t < forMs; t += ms) moved = auto.frame(ms) ?? moved;
		return moved;
	};

	it("steps down after slow frames and up after a long run of fast ones", () => {
		const auto = new AutoQuality(10);
		expect(run(auto, 25, DOWN_AFTER - 100)).toBeNull();
		expect(run(auto, 25, 200)).toBe(9);
		// Never back up to a level it came down from.
		expect(run(auto, 8, UP_AFTER * 3)).toBeNull();
		expect(auto.level).toBe(9);
		expect(run(auto, 25, DOWN_AFTER + 50)).toBe(8);
		// A level it has not come down from it climbs to.
		const fresh = new AutoQuality(10);
		expect(run(fresh, 8, UP_AFTER + 50)).toBe(11);
	});

	it("starts again after a pause, and holds between the bounds", () => {
		const auto = new AutoQuality(20);
		run(auto, 25, DOWN_AFTER - 100);
		auto.frame(500);
		expect(run(auto, 25, DOWN_AFTER - 100)).toBeNull();
		expect(run(auto, 15, 20000)).toBeNull();
		expect(auto.level).toBe(20);
	});
});

describe("a level's sun shadows", () => {
	const camera = { eye: [0, 10, 0], at: [0, 10, -1], near: 0.1, far: 10000 };
	const box = { min: [-2000, -10, -2000], max: [2000, 400, 2000] };
	const n = SUN_CASCADES.length;

	it("reach a share of the default", () => {
		expect(cascadeFars(SUN_CASCADES[n - 1])).toEqual(SUN_CASCADES);
		expect(cascadeFars(128)).toEqual([8, 32, 128]);
		const block = cascadeBlock(camera as never, 1.5, [0.3, 1, 0.2], box, 0.2, true, true, {
			distance: 1550,
			reach: 128,
			blobWidth: 3,
		});
		expect(block).toHaveLength(CASCADE_BLOCK);
		expect([...block.subarray(n * 16, n * 16 + n)]).toEqual([8, 32, 128]);
		// The stand-in's width, in studs, rather than ShadowSoftness's.
		expect(block[n * 16 + 3]).toBe(3);
	});

	it("have coarser texels on a smaller map", () => {
		const big = cascadeBlock(camera as never, 1.5, [0.3, 1, 0.2], box, 0.2, true, true);
		const small = cascadeBlock(
			camera as never,
			1.5,
			[0.3, 1, 0.2],
			box,
			0.2,
			true,
			true,
			undefined,
			512,
		);
		expect(small[n * 16 + 4] / big[n * 16 + 4]).toBeCloseTo(4);
	});
});

describe("render distance", () => {
	it("leaves out boxes whose nearest point is past it", () => {
		expect(boxBeyond([0, 0, 0], [100, -1, -1], [110, 1, 1], 99)).toBe(true);
		expect(boxBeyond([0, 0, 0], [100, -1, -1], [110, 1, 1], 101)).toBe(false);
		expect(boxBeyond([0, 0, 0], [-5, -5, -5], [5, 5, 5], 1)).toBe(false);
	});
});
