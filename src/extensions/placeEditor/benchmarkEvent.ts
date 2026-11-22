/**
 * Asking Roswaal to run its benchmark, from wherever the button is: Settings ›
 * Scene view, or the Rendering panel. App listens, hides the editor and shows
 * the run. Small, so the editor's own bundle carries it without the Place
 * Editor's.
 */

export type BenchmarkKind = "current" | "sweep";

export const BENCHMARK_EVENT = "roswaal:benchmark";

export function startBenchmark(kind: BenchmarkKind): void {
	window.dispatchEvent(new CustomEvent<BenchmarkKind>(BENCHMARK_EVENT, { detail: kind }));
}
