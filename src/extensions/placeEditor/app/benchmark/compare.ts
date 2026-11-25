/**
 * Two benchmark runs compared station by station, with the drift between
 * them taken out and the noise said.
 *
 * An iPad's GPU runs slower once warm, so a second run can be 10% slower
 * across every station a release never touched, and some stations scatter by
 * far more (Benchmark 1 on an iPad Mini, 22 Nov 2026: unchanged stations from
 * 3% faster to 46% slower). So the median change across the stations is
 * taken as the run's drift: the one or two stations a release changed do not
 * move a median. Each station's change is judged after that drift, against a
 * band of how far the stations scatter round it (three deviations, from
 * their median absolute deviation, 5% at least). Each run is compared by its
 * first pass: a second, where there is one, is the device warm.
 *
 * Three deviations, not two: canary.21 against canary.22 on an iPad, where
 * nothing drawn had changed, called two of eighteen stations changed at two.
 * An iPad's GPU changes its clock with how hard it is worked, so the noise
 * comes in bursts, and a light station's two passes were 20 to 35% apart.
 */

import type { BenchmarkLevelResult, BenchmarkResult, BenchmarkStationResult } from "./result.js";

/** The least band: under 5% is never called a change. */
export const NOISE_FLOOR = 0.05;
/**
 * The least change in milliseconds: under it, never called one. A browser's
 * GPU timer counts in steps (Chrome's about 0.067 ms), so on a fast GPU a
 * station of 0.2 ms moved a third by one step.
 */
export const CHANGE_FLOOR_MS = 0.15;

export interface StationChange {
	n: number;
	name: string;
	variant: string;
	/** Milliseconds: the GPU's own time where both runs have it, else the waited frame. */
	before: number;
	after: number;
	/** after / before, and that over the run's drift. */
	ratio: number;
	adjusted: number;
	/** The band this station's change is judged against: 0.2 is ±20%. */
	band: number;
	verdict: "faster" | "slower" | "within noise";
}

export interface LevelComparison {
	label: string;
	/** What both runs' stations were timed by. */
	by: "GPU" | "waited frame";
	drift: number;
	band: number;
	stations: StationChange[];
}

export interface Comparison {
	before: BenchmarkResult;
	after: BenchmarkResult;
	levels: LevelComparison[];
	/** Why the two are not like for like, where they are not: another device, another size. */
	warnings: string[];
}

function median(values: number[]): number {
	const v = [...values].sort((a, b) => a - b);
	if (v.length === 0) return Number.NaN;
	const m = Math.floor(v.length / 2);
	return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * A station's time: its first pass's. The second, where there is one, is
 * the device warm (after the whole first pass at full clock, an iPad's GPU
 * was 14 to 33% slower at most stations), said apart rather than averaged in.
 */
function timeOf(s: BenchmarkStationResult, gpu: boolean): number {
	return gpu ? (s.still.gpuMs ?? Number.NaN) : s.still.median;
}

const keyOf = (s: BenchmarkStationResult) => `${s.n}|${s.variant}`;

function compareLevel(
	a: BenchmarkLevelResult,
	b: BenchmarkLevelResult,
	gpu: boolean,
): LevelComparison {
	const after = new Map(b.stations.map((s) => [keyOf(s), s]));
	const pairs = a.stations
		.map((s) => [s, after.get(keyOf(s))] as const)
		.filter(
			(p): p is readonly [BenchmarkStationResult, BenchmarkStationResult] => p[1] !== undefined,
		)
		.map(([s, t]) => ({ s, t, before: timeOf(s, gpu), after: timeOf(t, gpu) }))
		.filter(
			(p) => Number.isFinite(p.before) && Number.isFinite(p.after) && p.before > 0 && p.after > 0,
		);
	const logs = pairs.map((p) => Math.log(p.after / p.before));
	const centre = median(logs);
	const drift = Math.exp(centre);
	// Three deviations: 1.4826 times the median absolute deviation is one, for a normal spread.
	const mad = median(logs.map((l) => Math.abs(l - centre))) * 1.4826;
	const band = Math.max(NOISE_FLOOR, Math.exp(3 * mad) - 1);
	return {
		label: a.label === b.label ? a.label : `${a.label} → ${b.label}`,
		by: gpu ? "GPU" : "waited frame",
		drift,
		band,
		stations: pairs.map(({ s, before, after }) => {
			const ratio = after / before;
			const adjusted = ratio / drift;
			const own = band;
			return {
				n: s.n,
				name: s.name,
				variant: s.variant,
				before,
				after,
				ratio,
				adjusted,
				band: own,
				verdict:
					Math.abs(after - before * drift) < CHANGE_FLOOR_MS
						? "within noise"
						: adjusted < 1 / (1 + own)
							? "faster"
							: adjusted > 1 + own
								? "slower"
								: "within noise",
			};
		}),
	};
}

/** `after` against `before`: each level they share, by its level number. */
export function compareRuns(before: BenchmarkResult, after: BenchmarkResult): Comparison {
	const warnings: string[] = [];
	// An A/B run measures a switch, not the stations' scores.
	if (before.kind === "pixels" || after.kind === "pixels")
		return {
			before,
			after,
			levels: [],
			warnings: [
				"One of these is a Pixel cost run, which measures what a pixel costs rather than the stations: its own report says.",
			],
		};
	if (before.ab || after.ab)
		return {
			before,
			after,
			levels: [],
			warnings: [
				"One of these is an A/B run, which measures a switch rather than the stations: its own report says what the switch saves.",
			],
		};
	// Another benchmark measures other scenes, or the same ones another way: no station compares.
	if (before.benchmark !== after.benchmark)
		return {
			before,
			after,
			levels: [],
			warnings: [
				`These are Benchmark ${before.benchmark} and Benchmark ${after.benchmark}, which measure differently, so they cannot be compared. Compare two runs of the same benchmark.`,
			],
		};
	if (before.gpu !== after.gpu || before.renderer !== after.renderer)
		warnings.push(
			`Different devices or renderers: ${before.renderer} on ${before.gpu}, and ${after.renderer} on ${after.gpu}.`,
		);
	const gpu = before.gpuTimers && after.gpuTimers;
	const levels: LevelComparison[] = [];
	for (const a of before.levels) {
		// A sweep's render scales are its own section, not a level to set beside one.
		if (a.pixels) continue;
		const b = after.levels.find((l) => l.level === a.level && !l.pixels);
		if (!b) continue;
		if (
			a.canvas.width !== b.canvas.width ||
			a.canvas.height !== b.canvas.height ||
			a.antialias !== b.antialias
		)
			warnings.push(
				`${a.label} was drawn at ${a.canvas.width}×${a.canvas.height} with ${a.antialias}, then at ${b.canvas.width}×${b.canvas.height} with ${b.antialias}.`,
			);
		levels.push(compareLevel(a, b, gpu));
	}
	if (levels.length === 0) warnings.push("The two runs share no quality level.");
	return { before, after, levels, warnings };
}

const pct = (share: number) => `${share >= 0 ? "+" : "−"}${Math.abs(Math.round(share * 100))}%`;
const ms = (v: number) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} ms`;

/** The comparison as text, to paste. */
export function comparisonReport(c: Comparison): string {
	const when = (r: BenchmarkResult) => `${r.release}, ${r.date.slice(0, 16).replace("T", " ")}`;
	const lines: string[] = [];
	lines.push(`Roswaal Benchmark ${c.after.benchmark}: ${when(c.after)} against ${when(c.before)}`);
	lines.push(`${c.after.renderer} · GPU: ${c.after.gpu}`);
	for (const w of c.warnings) lines.push(`Note: ${w}`);
	for (const level of c.levels) {
		lines.push("");
		lines.push(
			`${level.label}, by the ${level.by}: the second run is ${pct(level.drift - 1)} across the stations (the median; drift), noise ±${Math.round(level.band * 100)}%`,
		);
		if (level.band > 0.15)
			lines.push(
				`  Noise this wide hides changes under about ${Math.round(level.band * 100)}%. A device as cool at the start of each run narrows it.`,
			);
		lines.push(
			`  ${"Station".padEnd(28)}${"Before".padStart(10)}${"After".padStart(10)}${"Change".padStart(9)}${"After drift".padStart(13)}  Verdict`,
		);
		for (const s of level.stations) {
			const name = `${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`;
			const verdict =
				s.verdict === "within noise"
					? `within noise (±${Math.round(s.band * 100)}%)`
					: `${s.verdict} by ${Math.abs(Math.round((s.adjusted - 1) * 100))}%`;
			lines.push(
				`  ${name.padEnd(28)}${ms(s.before).padStart(10)}${ms(s.after).padStart(10)}${pct(s.ratio - 1).padStart(9)}${pct(s.adjusted - 1).padStart(13)}  ${verdict}`,
			);
		}
	}
	return lines.join("\n");
}

/** A results file read back: a run, or null with why not. */
export function readResults(text: string): { result: BenchmarkResult } | { error: string } {
	try {
		const r = JSON.parse(text) as BenchmarkResult;
		if (typeof r.benchmark !== "number" || !Array.isArray(r.levels))
			return { error: "It is not a Roswaal Benchmark results file." };
		// What was not measured is null in the file: read as not measured (not finite) below.
		return { result: r };
	} catch {
		return { error: "It is not JSON." };
	}
}
