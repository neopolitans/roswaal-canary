/**
 * A benchmark run's results: what each station measured at each level, its
 * score, and the run as text to copy and as JSON to download.
 *
 * A station's score is the frames a second its GPU time allows, beside the
 * rate its waited frame allows, so a station the CPU holds back shows as
 * such. A level's score is the geometric mean of its stations', so one heavy
 * station cannot hide the rest. Scores compare only within one benchmark
 * version and the same levels.
 */

import type { BenchmarkKind } from "../../benchmarkEvent.js";
import {
	fpsText,
	type MovingRow,
	msText,
	STAGE_SHORT,
	type StageRow,
	type Timed,
} from "../viewport/profile.js";

export type { BenchmarkKind };

export interface BenchmarkStationResult {
	n: number;
	id: string;
	name: string;
	/** "50 lights"; empty for a station of one. */
	variant: string;
	/** Still frames, waited for: the waited time, the GPU's and the CPU's. */
	still: Timed;
	/**
	 * The same, measured again after the whole first pass: the device warm.
	 * Shown beside the first, never scored or compared: see the warm pass.
	 */
	repeat?: Timed;
	/** An A/B run's measurements: its switch on, off, on, off, in that order. */
	ab?: { on: Timed[]; off: Timed[] };
	/** The GPU's own time by stage, sun maps drawn every frame as when moving. */
	gpu: StageRow[];
	gpuTotal: { median: number; p95: number };
	/** An orbit; for the Moving station, each control's motion. */
	moving: MovingRow[];
	counts: { draws: number; instances: number; triangles: number; particles: number; beams: number };
}

export interface BenchmarkLevelResult {
	/** "Level 13", or "Level 13 (Automatic's)" for the current settings. */
	label: string;
	level: number;
	canvas: { width: number; height: number };
	antialias: string;
	stations: BenchmarkStationResult[];
}

export interface BenchmarkResult {
	benchmark: number;
	seed: number;
	kind: BenchmarkKind;
	/** 2 where each station was measured again, warm (its `repeat`); absent in a run of one pass. */
	passes?: number;
	/** The render switches that were off for the run, by their names in the Rendering panel. */
	switchedOff?: string[];
	/** An A/B run's switch, by its key and its name. */
	ab?: { feature: string; label: string };
	/**
	 * "busy": frames timed with the GPU kept busy, two in flight, so the
	 * still frame's `median` is the time between frames (Benchmark 2). Its
	 * times are the mean of each set's middle 80%, not medians, since 1.1.0-canary.25:
	 * a coarse clock (Safari's whole milliseconds) rounded every median.
	 * Absent: one at a time, waited for (Benchmark 1).
	 */
	measure?: "busy";
	release: string;
	date: string;
	renderer: string;
	gpu: string;
	gpuTimers: boolean;
	pixelRatio: number;
	userAgent: string;
	levels: BenchmarkLevelResult[];
	/** Stopped before the end: what was measured so far. */
	cancelled?: boolean;
}

/** Frames a second from a frame's milliseconds: NaN where it was not measured. */
const rate = (ms: number | undefined) =>
	ms !== undefined && Number.isFinite(ms) && ms > 0 ? 1000 / ms : Number.NaN;

/** A station's score: the rate its GPU time allows, and the rate its waited frame allows. */
export function stationScore(s: BenchmarkStationResult): { gpu: number; waited: number } {
	return { gpu: rate(s.still.gpuMs), waited: rate(s.still.median) };
}

function geomean(values: number[]): number {
	const ok = values.filter((v) => Number.isFinite(v) && v > 0);
	if (ok.length === 0) return Number.NaN;
	return Math.exp(ok.reduce((sum, v) => sum + Math.log(v), 0) / ok.length);
}

/** A level's score: the geometric mean of its stations' scores. */
export function levelScore(level: BenchmarkLevelResult): { gpu: number; waited: number } {
	const scores = level.stations.map(stationScore);
	return { gpu: geomean(scores.map((s) => s.gpu)), waited: geomean(scores.map((s) => s.waited)) };
}

/** A run's score: the geometric mean of its levels'. */
export function runScore(result: BenchmarkResult): { gpu: number; waited: number } {
	const levels = result.levels.map(levelScore);
	return { gpu: geomean(levels.map((l) => l.gpu)), waited: geomean(levels.map((l) => l.waited)) };
}

const score = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString("en") : "–");

/**
 * Where the CPU holds a station back: the page's own work well over the GPU's.
 * Not the waited frame against the GPU's: a wait has a floor of its own (a
 * desktop's was about 2.7 ms however little was drawn), which is neither.
 */
function cpuBound(s: BenchmarkStationResult): boolean {
	const gpu = s.still.gpuMs;
	const cpu = s.still.cpuMs;
	return (
		gpu !== undefined && cpu !== undefined && Number.isFinite(gpu) && cpu > 1 && cpu > gpu * 1.5
	);
}

/** The run as text, to paste: a section a level, a line a station, then each station's stages. */
export function benchmarkReport(result: BenchmarkResult): string {
	const lines: string[] = [];
	const total = runScore(result);
	lines.push(
		`Roswaal Benchmark ${result.benchmark} · Roswaal ${result.release} · ${result.ab ? `A/B: ${result.ab.label}` : result.kind === "sweep" ? "Full sweep" : "Current settings"}`,
	);
	lines.push(
		`Renderer: ${result.renderer} · GPU: ${result.gpu} · GPU timers: ${result.gpuTimers ? "yes" : "no"} · Pixel ratio ${Number(result.pixelRatio.toFixed(2))}`,
	);
	lines.push(`Browser: ${result.userAgent}`);
	if (result.switchedOff?.length)
		lines.push(`Switched off in the Rendering panel: ${result.switchedOff.join(", ")}`);
	if (result.measure === "busy")
		lines.push(
			"Measured with the GPU kept busy, two frames in flight: the time between frames, and the GPU's own time for one, at its full clock.",
		);
	lines.push(
		`Seed ${result.seed} · ${result.date}${(result.passes ?? 1) > 1 ? " · with a warm pass" : ""}${result.cancelled ? " · stopped before the end" : ""}`,
	);
	lines.push(
		`Score: ${score(total.gpu)} by the GPU's time, ${score(total.waited)} by the ${result.measure === "busy" ? "frame interval" : "waited frame"}`,
	);
	if (result.ab) {
		lines.push(...abReport(result));
		return lines.join("\n");
	}
	for (const level of result.levels) {
		const ls = levelScore(level);
		const warm = warmDrift(level, result.gpuTimers);
		lines.push("");
		lines.push(
			`${level.label} · ${level.canvas.width}×${level.canvas.height} · ${level.antialias} · score ${score(ls.gpu)} / ${score(ls.waited)}`,
		);
		lines.push(
			`  ${"Station".padEnd(28)}${"GPU".padStart(10)}${(result.measure === "busy" ? "Interval" : "Waited").padStart(10)}${"CPU".padStart(10)}${"Orbit".padStart(10)}${"Score".padStart(17)}${warm === null ? "" : "      Warm"}`,
		);
		for (const s of level.stations) {
			const sc = stationScore(s);
			const orbit = s.moving[0];
			const name = `${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`;
			lines.push(
				`  ${name.padEnd(28)}${msText(s.still.gpuMs ?? Number.NaN).padStart(10)}${msText(s.still.median).padStart(10)}${msText(s.still.cpuMs ?? Number.NaN).padStart(10)}${msText(orbit ? (orbit.gpu.length > 0 ? orbit.gpuTotal.median : orbit.median) : Number.NaN).padStart(10)}${`${score(sc.gpu)} / ${score(sc.waited)}`.padStart(17)}${warm === null ? "" : warmText(s, result.gpuTimers).padStart(10)}${cpuBound(s) ? "  CPU-bound" : ""}`,
			);
		}
		if (warm !== null)
			lines.push(
				`  Warm: each station again after the whole first pass, ${pctText(warm)} across the stations (the median). The scores are the first pass's.`,
			);
		lines.push("");
		lines.push(
			`  Each station's GPU stages, and its CPU's steps (${result.measure === "busy" ? "the middle 80%'s means" : "medians"}):`,
		);
		for (const s of level.stations) {
			const stages = s.gpu.map((r) => `${STAGE_SHORT[r.stage]} ${msText(r.median)}`).join(" · ");
			const steps = s.still.cpuSteps;
			const cpu = steps
				? `effects ${msText(steps.effects)} · culling ${msText(steps.culling)} · the rest ${msText(Math.max(0, (s.still.cpuMs ?? 0) - steps.effects - steps.culling))}`
				: "";
			lines.push(`  ${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`);
			if (stages) lines.push(`      GPU: ${stages}`);
			if (cpu) lines.push(`      CPU: ${cpu}`);
			lines.push(
				`      ${s.counts.draws.toLocaleString("en")} draws · ${s.counts.instances.toLocaleString("en")} instances · ${Math.round(s.counts.triangles).toLocaleString("en")} triangles${s.counts.particles ? ` · ${s.counts.particles.toLocaleString("en")} particles` : ""}`,
			);
			for (const m of s.moving.length > 1 ? s.moving : []) {
				const total = m.gpu.length > 0 ? `GPU ${msText(m.gpuTotal.median)}` : "";
				lines.push(`      ${m.label.padEnd(14)} ${msText(m.median)} ${fpsText(m.median)} ${total}`);
			}
		}
	}
	return lines.join("\n");
}

/** A station's time by the GPU, where it has timers, else by the frame. */
function stationTime(t: Timed, gpu: boolean): number {
	return gpu ? (t.gpuMs ?? Number.NaN) : t.median;
}

/** How much slower the warm pass was than the first across a level's stations (the median change), or null with none. */
export function warmDrift(level: BenchmarkLevelResult, gpu: boolean): number | null {
	const changes = level.stations
		.filter((s) => s.repeat)
		.map((s) => stationTime(s.repeat as Timed, gpu) / stationTime(s.still, gpu))
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	if (changes.length === 0) return null;
	const m = Math.floor(changes.length / 2);
	return (changes.length % 2 ? changes[m] : (changes[m - 1] + changes[m]) / 2) - 1;
}

function warmText(s: BenchmarkStationResult, gpu: boolean): string {
	if (!s.repeat) return "";
	const change = stationTime(s.repeat, gpu) / stationTime(s.still, gpu) - 1;
	return Number.isFinite(change) ? pctText(change) : "";
}

const pctText = (share: number) => `${share >= 0 ? "+" : "−"}${Math.abs(Math.round(share * 100))}%`;

/** What an A/B run found at a station: the switch's saving (positive) or cost, and whether it is clear. */
export interface AbFinding {
	on: number;
	off: number;
	/** Off minus on, in milliseconds: what the switch saves where positive. */
	saves: number;
	/** How far the measurements on either side were apart: a smaller difference is not called. */
	noise: number;
	verdict: "pays" | "costs" | "no clear difference";
}

/** The least difference an A/B run calls, in milliseconds: a fast GPU's timer steps are about 0.067. */
export const AB_FLOOR_MS = 0.15;

export function abFinding(s: BenchmarkStationResult, gpu: boolean): AbFinding | null {
	if (!s.ab) return null;
	const time = (t: Timed) => (gpu ? (t.gpuMs ?? Number.NaN) : t.median);
	const on = s.ab.on.map(time);
	const off = s.ab.off.map(time);
	if (![...on, ...off].every(Number.isFinite)) return null;
	const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
	const saves = mean(off) - mean(on);
	const noise = Math.max(Math.abs(on[0] - on[1]), Math.abs(off[0] - off[1]), AB_FLOOR_MS);
	return {
		on: mean(on),
		off: mean(off),
		saves,
		noise,
		verdict: saves > noise ? "pays" : -saves > noise ? "costs" : "no clear difference",
	};
}

function abReport(result: BenchmarkResult): string[] {
	const ab = result.ab;
	if (!ab) return [];
	const gpu = result.gpuTimers;
	const lines: string[] = [];
	lines.push(
		`Each station measured with ${ab.label} on, off, on and off, back to back, by the ${gpu ? "GPU's own time" : "frame interval"}.`,
	);
	for (const level of result.levels) {
		lines.push("");
		lines.push(
			`${level.label} · ${level.canvas.width}×${level.canvas.height} · ${level.antialias}`,
		);
		lines.push(
			`  ${"Station".padEnd(28)}${"On".padStart(10)}${"Off".padStart(10)}${"Saves".padStart(10)}  Verdict`,
		);
		for (const s of level.stations) {
			const f = abFinding(s, gpu);
			if (!f) continue;
			const name = `${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`;
			const saves = `${f.saves >= 0 ? "+" : "−"}${msText(Math.abs(f.saves))}`;
			const verdict =
				f.verdict === "pays"
					? `pays ${msText(f.saves)}`
					: f.verdict === "costs"
						? `costs ${msText(-f.saves)}`
						: `no clear difference (±${msText(f.noise)})`;
			lines.push(
				`  ${name.padEnd(28)}${msText(f.on).padStart(10)}${msText(f.off).padStart(10)}${saves.padStart(10)}  ${verdict}`,
			);
		}
	}
	return lines;
}

/** The run as a file's name: roswaal-benchmark-1-2026-11-22T10-30.json. */
export function benchmarkFileName(result: BenchmarkResult): string {
	return `roswaal-benchmark-${result.benchmark}-${result.date.slice(0, 16).replace(/:/g, "-")}.json`;
}

/** The run as JSON, every number in it, to load again for comparison. */
export function benchmarkJson(result: BenchmarkResult): string {
	return JSON.stringify(
		result,
		(_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v),
		1,
	);
}
