/**
 * A benchmark's files (1.1.0-canary.125): a results file named for its kind
 * and renderer, so a folder of them tells a Smoothness run from a Pixel cost
 * one; and its own models and textures asked for again where the host fails
 * for a moment, as a 503 once stopped an iPad's run.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesAt } from "../src/extensions/placeEditor/app/benchmark/assets.js";
import {
	type BenchmarkResult,
	benchmarkFileName,
} from "../src/extensions/placeEditor/app/benchmark/result.js";

const result = (over: Partial<BenchmarkResult>): BenchmarkResult =>
	({
		benchmark: 5,
		kind: "current",
		renderer: "WebGL2",
		date: "2026-11-26T08:09:41.000Z",
		...over,
	}) as unknown as BenchmarkResult;

describe("a results file's name", () => {
	it("says the kind of run and the renderer", () => {
		expect(benchmarkFileName(result({}))).toBe(
			"roswaal-benchmark-5-current-webgl2-2026-11-26T08-09.json",
		);
		expect(benchmarkFileName(result({ kind: "smooth" }))).toBe(
			"roswaal-benchmark-5-smoothness-webgl2-2026-11-26T08-09.json",
		);
		expect(benchmarkFileName(result({ kind: "pixels", renderer: "WebGPU" }))).toBe(
			"roswaal-benchmark-5-pixel-cost-webgpu-2026-11-26T08-09.json",
		);
		expect(benchmarkFileName(result({ kind: "sweep" }))).toBe(
			"roswaal-benchmark-5-full-sweep-webgl2-2026-11-26T08-09.json",
		);
	});

	it("names an A/B's switch, and a warm pass", () => {
		expect(
			benchmarkFileName(
				result({ kind: "ab", ab: { feature: "sunShadows", label: "Sun shadows" }, passes: 2 }),
			),
		).toBe("roswaal-benchmark-5-ab-sun-shadows-warm-webgl2-2026-11-26T08-09.json");
	});
});

describe("a benchmark file fetched", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const answers = (...statuses: (number | "drop")[]) => {
		const fetch = vi.fn(async () => {
			const s = statuses.shift();
			if (s === "drop") throw new TypeError("Load failed");
			return new Response(s === 200 ? new Uint8Array([1, 2, 3]) : "x", { status: s });
		});
		vi.stubGlobal("fetch", fetch);
		return fetch;
	};

	it("is asked for again after a 503 or a dropped connection", async () => {
		vi.useFakeTimers();
		const fetch = answers(503, "drop", 200);
		const got = bytesAt("https://example.test/assets/CometI.glb");
		await vi.runAllTimersAsync();
		expect([...(await got)]).toEqual([1, 2, 3]);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("fails at once where the file is not there", async () => {
		const fetch = answers(404);
		await expect(bytesAt("https://example.test/assets/Gone.glb")).rejects.toThrow(/Gone\.glb: 404/);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("gives up after four tries", async () => {
		vi.useFakeTimers();
		const fetch = answers(503, 503, 503, 503, 200);
		const got = bytesAt("https://example.test/assets/CometI.glb");
		const failed = expect(got).rejects.toThrow(/CometI\.glb: 503/);
		await vi.runAllTimersAsync();
		await failed;
		expect(fetch).toHaveBeenCalledTimes(4);
	});
});
