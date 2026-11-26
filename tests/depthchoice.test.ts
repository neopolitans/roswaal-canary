/**
 * Automatic's depth path, measured: the two alternate frame by frame, and
 * the faster is kept, full unless lean is clearly faster.
 */

import { describe, expect, it } from "vitest";

import {
	CHOICE_SAMPLES,
	DepthChoice,
	keepDepth,
	keptDepth,
	lampMode,
} from "../src/extensions/placeEditor/app/viewport/depthChoice.js";

function measure(full: number, lean: number): DepthChoice {
	const choice = new DepthChoice();
	for (let i = 0; i < CHOICE_SAMPLES * 2 + 4 && !choice.chosen; i++) {
		const path = choice.next();
		// A camera whose cost drifts as it moves: both paths see the same drift.
		const drift = Math.sin(i / 5) * 2;
		choice.record(path, (path === "full" ? full : lean) + drift);
	}
	return choice;
}

describe("Automatic's depth path", () => {
	it("alternates the two while it measures", () => {
		const choice = new DepthChoice();
		expect([choice.next(), choice.next(), choice.next()]).toEqual(["full", "lean", "full"]);
	});

	it("keeps lean where it is clearly faster, as on a tile-based GPU in a dense place", () => {
		const choice = measure(16, 13.3);
		expect(choice.chosen).toBe("lean");
		expect(choice.medians()?.lean).toBeLessThan(choice.medians()!.full);
	});

	it("keeps full where lean is slower, or barely faster", () => {
		expect(measure(6, 9).chosen).toBe("full");
		expect(measure(10, 9.8).chosen).toBe("full");
	});

	it("measures again once reset", () => {
		const choice = measure(16, 13);
		choice.reset();
		expect(choice.chosen).toBeNull();
		expect(choice.medians()).toBeNull();
	});
});

describe("a depth path kept for a device", () => {
	const memory = () => {
		const kept = new Map<string, string>();
		return {
			getItem: (k: string) => kept.get(k) ?? null,
			setItem: (k: string, v: string) => void kept.set(k, v),
		};
	};

	it("is none until measured, then kept for that device alone", () => {
		const storage = memory();
		expect(keptDepth("WebGPU apple", storage)).toBeNull();
		keepDepth("WebGPU apple", "lean", storage);
		keepDepth("WebGPU nvidia", "full", storage);
		expect(keptDepth("WebGPU apple", storage)).toBe("lean");
		expect(keptDepth("WebGPU nvidia", storage)).toBe("full");
		expect(keptDepth("WebGL2 apple", storage)).toBeNull();
	});

	it("is taken without measuring, once kept", () => {
		const choice = new DepthChoice();
		choice.keep("lean");
		expect(choice.chosen).toBe("lean");
		expect(choice.medians()).toBeNull();
	});

	it("is measured again where the browser keeps nothing, or something unreadable", () => {
		expect(keptDepth("WebGPU apple", null)).toBeNull();
		const broken = { getItem: () => "{not json", setItem: () => {} };
		expect(keptDepth("WebGPU apple", broken)).toBeNull();
		expect(() => keepDepth("WebGPU apple", "full", broken)).not.toThrow();
	});
});

describe("Light objects' resolution", () => {
	it("draws as the switch and the setting say; a saved Automatic is full", () => {
		expect(lampMode("auto", true)).toBe("full");
		expect(lampMode(undefined, true)).toBe("full");
		expect(lampMode("full", true)).toBe("full");
		expect(lampMode("quarter", true)).toBe("quarter");
		// The Rendering panel's switch off: never full.
		expect(lampMode("full", false)).toBe("half");
		expect(lampMode("quarter", false)).toBe("quarter");
	});
});
