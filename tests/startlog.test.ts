/**
 * The start log: each step of opening a place, written as it happens, so the
 * start after a freeze can say where the last one stopped.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
	beginStart,
	clearStartLog,
	endStart,
	logStep,
	startRuns,
	startText,
	thisPageStart,
	unfinishedBefore,
} from "../src/extensions/placeEditor/app/viewport/startLog.js";

/** The browser's storage, as far as the log uses it. */
function fakeStorage(): void {
	const kept = new Map<string, string>();
	Object.assign(globalThis, {
		localStorage: {
			getItem: (key: string) => kept.get(key) ?? null,
			setItem: (key: string, value: string) => kept.set(key, value),
			removeItem: (key: string) => kept.delete(key),
		},
	});
}

beforeEach(() => fakeStorage());

describe("the start log", () => {
	it("writes each step as it happens", () => {
		beginStart("View starting", "120 parts");
		logStep("GPU found", "Apple GPU");
		const [run] = startRuns();
		expect(run.kind).toBe("View starting");
		expect(run.steps.map((s) => s.step)).toEqual(["View starting", "GPU found"]);
		expect(run.steps[1].note).toBe("Apple GPU");
		expect(run.done).toBe(false);
	});

	/** Pipelines and a build's progress update one step rather than filling the log. */
	it("counts a repeated step in place", () => {
		beginStart("Place opened");
		logStep("Pipelines ready", "1", true);
		logStep("Pipelines ready", "2", true);
		logStep("Pipelines ready", "3", true);
		const steps = startRuns()[0].steps;
		expect(steps).toHaveLength(2);
		expect(steps[1].note).toBe("3");
	});

	it("marks a start that reached its end", () => {
		beginStart("Place opened");
		logStep("First frame drawn");
		endStart("Settled");
		const [run] = startRuns();
		expect(run.done).toBe(true);
		expect(run.steps.at(-1)?.step).toBe("Settled");
	});

	/**
	 * The point of it: a page that froze wrote its steps up to the freeze, and
	 * never its end. The next page's start finds it unfinished, at its last step.
	 */
	it("finds the start before this one unfinished, at its last step", () => {
		beginStart("Benchmark");
		endStart("Benchmark finished");
		beginStart("Place opened", "4,800 parts");
		logStep("Scene given to the view");
		logStep("Shader build started");
		// The page froze here. Another one starts.
		beginStart("View starting");
		const frozen = unfinishedBefore(startRuns(), thisPageStart());
		expect(frozen?.kind).toBe("Place opened");
		expect(frozen?.steps.at(-1)?.step).toBe("Shader build started");
	});

	it("says nothing when the start before finished", () => {
		beginStart("Place opened");
		endStart("Settled");
		beginStart("View starting");
		expect(unfinishedBefore(startRuns(), thisPageStart())).toBeNull();
	});

	it("keeps the last three starts, newest first", () => {
		for (const kind of ["A", "B", "C", "D"]) beginStart(kind);
		expect(startRuns().map((run) => run.kind)).toEqual(["D", "C", "B"]);
	});

	it("clears all but the start under way", () => {
		beginStart("A");
		beginStart("B");
		clearStartLog();
		expect(startRuns().map((run) => run.kind)).toEqual(["B"]);
	});

	it("reads as text for a report", () => {
		beginStart("Place opened", "12 parts");
		const text = startText(startRuns()[0]);
		expect(text).toContain("Place opened");
		expect(text).toContain("(did not finish)");
		expect(text).toMatch(/ms {2}Place opened \(12 parts\)/);
	});

	/** No storage, a private window say: the view starts the same, with no log. */
	it("starts the same where the browser keeps nothing", () => {
		Object.assign(globalThis, {
			localStorage: {
				getItem: () => {
					throw new Error("blocked");
				},
				setItem: () => {
					throw new Error("blocked");
				},
			},
		});
		expect(() => {
			beginStart("View starting");
			logStep("GPU found");
			endStart("Settled");
		}).not.toThrow();
		expect(startRuns()).toEqual([]);
	});
});
