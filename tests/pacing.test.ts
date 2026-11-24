/**
 * Frame pacing: a cap that keeps its average on a display whose refreshes
 * do not divide it, and Steady, which halves while frames miss refreshes and
 * comes back once they fit.
 */

import { describe, expect, it } from "vitest";

import { FrameCap, SteadyVsync } from "../src/extensions/placeEditor/app/viewport/pacing.js";

const HZ60 = 1000 / 60;

/** The refreshes a cap draws at, over `seconds`, on a display of `hz`. */
function drawnAt(rate: number, hz: number, seconds = 1): number[] {
	const cap = new FrameCap();
	const out: number[] = [];
	for (let i = 0; i < seconds * hz; i++) {
		const t = (i * 1000) / hz;
		if (cap.allows(t, rate)) out.push(t);
	}
	return out;
}

describe("a frame-rate cap", () => {
	it("draws 24 a second on a 60 Hz display, two refreshes and three in turn", () => {
		const drawn = drawnAt(24, 60, 5);
		expect(drawn.length).toBeGreaterThanOrEqual(119);
		expect(drawn.length).toBeLessThanOrEqual(121);
		const gaps = new Set(drawn.slice(1).map((t, i) => Math.round((t - drawn[i]) / HZ60)));
		expect([...gaps].sort()).toEqual([2, 3]);
	});

	it("draws 30 and 60 at every second and every refresh, evenly", () => {
		expect(drawnAt(30, 60).length).toBe(30);
		expect(drawnAt(60, 60).length).toBe(60);
		expect(drawnAt(24, 120).length).toBe(24);
		expect(drawnAt(60, 144, 2).length).toBeGreaterThanOrEqual(119);
	});

	it("starts again from now after the view was still", () => {
		const cap = new FrameCap();
		expect(cap.allows(0, 30)).toBe(true);
		expect(cap.allows(16, 30)).toBe(false);
		expect(cap.allows(5000, 30)).toBe(true);
		expect(cap.allows(5016, 30)).toBe(false);
		expect(cap.allows(5033, 30)).toBe(true);
	});
});

describe("Steady", () => {
	/** Frames drawn with these gaps, from a running clock. */
	function run(steady: SteadyVsync, gaps: number[], start: number, workTimed = true): number {
		let t = start;
		for (const g of gaps) {
			t += g;
			if (steady.allows(t)) steady.drawn(t, workTimed);
		}
		return t;
	}

	it("keeps full rate while frames fit the refresh", () => {
		const steady = new SteadyVsync();
		run(steady, Array(200).fill(HZ60), 0);
		expect(steady.halved).toBe(false);
		expect(steady.refresh()).toBeCloseTo(HZ60, 3);
	});

	it("halves when a quarter of frames miss a refresh, and then draws every other one", () => {
		const steady = new SteadyVsync();
		let t = run(steady, Array(60).fill(HZ60), 0);
		// 40-ish Hz: one refresh, then two, in turn.
		t = run(
			steady,
			Array.from({ length: 30 }, (_, i) => (i % 2 ? HZ60 * 2 : HZ60)),
			t,
		);
		expect(steady.halved).toBe(true);
		let drawn = 0;
		for (let k = 0; k < 60; k++) {
			t += HZ60;
			if (steady.allows(t)) drawn++;
		}
		expect(drawn).toBe(30);
	});

	it("comes back to full rate once the GPU's frames fit with room", () => {
		const steady = new SteadyVsync();
		let t = run(steady, Array(60).fill(HZ60), 0);
		t = run(steady, Array(30).fill(HZ60 * 2), t);
		expect(steady.halved).toBe(true);
		for (let i = 0; i < 60; i++) steady.worked(15);
		expect(steady.halved).toBe(true);
		for (let i = 0; i < 60; i++) steady.worked(9);
		expect(steady.halved).toBe(false);
	});

	it("without the GPU's times, tries full rate again after a wait that doubles when it fails", () => {
		const steady = new SteadyVsync();
		let t = run(steady, Array(60).fill(HZ60), 0, false);
		// Eight frames that miss halve it.
		t = run(steady, Array(8).fill(HZ60 * 2), t, false);
		expect(steady.halved).toBe(true);
		const halvedAt = t;
		/** When it went back to full rate, frame by frame, if it did. */
		const fullAt = (frames: number): number | null => {
			for (let i = 0; i < frames; i++) {
				t += HZ60 * 2;
				if (steady.allows(t)) steady.drawn(t, false);
				if (!steady.halved) return t;
			}
			return null;
		};
		// Back to full rate once five seconds have passed, not before.
		const first = fullAt(300);
		expect(first).not.toBeNull();
		expect((first ?? 0) - halvedAt).toBeGreaterThan(4500);
		expect((first ?? 0) - halvedAt).toBeLessThan(6000);
		// Frames still miss: halved again at once, and the next try waits about ten seconds.
		t = run(steady, Array(8).fill(HZ60 * 2), t, false);
		expect(steady.halved).toBe(true);
		const again = t;
		const second = fullAt(600);
		expect((second ?? 0) - again).toBeGreaterThan(9000);
	});
});
