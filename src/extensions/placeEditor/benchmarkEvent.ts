/**
 * Asking Roswaal to run its benchmark, from wherever the button is: Settings ›
 * Benchmark, or the Rendering panel. App listens, hides the editor and shows
 * the run. Small, so the editor's own bundle carries it without the Place
 * Editor's.
 */

/**
 * "ab": each station's still frame with one render switch on and off, in
 * turn. "pixels": each at every render scale, for what a pixel costs.
 * "smooth": Smoothness, the frames that reach the screen, paced by the
 * display as in use, with nothing on the GPU timed.
 */
export type BenchmarkKind = "current" | "sweep" | "ab" | "pixels" | "smooth";

/** Every kind, for what listens to start a run: one list, so a new kind is never refused there. */
export const BENCHMARK_KINDS: readonly BenchmarkKind[] = [
	"current",
	"sweep",
	"ab",
	"pixels",
	"smooth",
];

/** What a run is asked for: its kind, and whether each station is measured twice. */
export interface BenchmarkRequest {
	kind: BenchmarkKind;
	/** 2: each station measured again after the whole first pass, warm; twice as long. */
	passes: 1 | 2;
	/** For an A/B run: the render switch measured on and off, by its key ("occlusionCulling"). */
	ab?: string;
}

export const BENCHMARK_EVENT = "roswaal:benchmark";

export function startBenchmark(
	kind: BenchmarkKind,
	passes: 1 | 2 = twiceWanted() ? 2 : 1,
	ab?: string,
): void {
	window.dispatchEvent(
		new CustomEvent<BenchmarkRequest>(BENCHMARK_EVENT, {
			detail: { kind, passes, ...(ab ? { ab } : {}) },
		}),
	);
}

const TWICE = "roswaal.benchmark.twice";

/** Settings' "Warm pass", kept in this browser. */
export function twiceWanted(): boolean {
	try {
		return localStorage.getItem(TWICE) === "1";
	} catch {
		return false;
	}
}

export function setTwiceWanted(on: boolean): void {
	try {
		localStorage.setItem(TWICE, on ? "1" : "0");
	} catch {
		// Not kept: this run only.
	}
}
