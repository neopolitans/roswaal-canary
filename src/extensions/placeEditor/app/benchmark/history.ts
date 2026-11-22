/**
 * The last few benchmark runs, kept in this browser, to compare a new run
 * with the one before it. Only a convenience: a run that matters is
 * downloaded, and storage that is cleared or blocked just keeps none.
 */

import type { BenchmarkResult } from "./result.js";

const KEY = "roswaal.benchmark.runs";
/** About 60 KB a run. */
const KEPT = 5;

export function keptRuns(): BenchmarkResult[] {
	try {
		const raw = localStorage.getItem(KEY);
		const runs = raw ? (JSON.parse(raw) as BenchmarkResult[]) : [];
		return Array.isArray(runs) ? runs : [];
	} catch {
		return [];
	}
}

/** Keeps `run`, newest first; a stopped run is not kept. */
export function keepRun(run: BenchmarkResult): void {
	if (run.cancelled) return;
	try {
		const runs = [run, ...keptRuns().filter((r) => r.date !== run.date)].slice(0, KEPT);
		localStorage.setItem(KEY, JSON.stringify(runs));
	} catch {
		// Full or blocked: not kept.
	}
}

/** The run before `run` of the same benchmark on the same device, to compare it with. */
export function runBefore(run: BenchmarkResult): BenchmarkResult | null {
	return (
		keptRuns().find(
			(r) =>
				r.date !== run.date &&
				r.benchmark === run.benchmark &&
				!r.ab &&
				!run.ab &&
				r.gpu === run.gpu &&
				r.levels.some((l) => run.levels.some((m) => m.level === l.level)),
		) ?? null
	);
}
