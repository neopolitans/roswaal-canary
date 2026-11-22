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
	/** The same, measured again in a second pass over the stations, where the run measured each twice. */
	repeat?: Timed;
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
	/** 2 where each station was measured twice (its `repeat`); absent in a run of one pass. */
	passes?: number;
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
		`Roswaal Benchmark ${result.benchmark} · Roswaal ${result.release} · ${result.kind === "sweep" ? "Full sweep" : "Current settings"}`,
	);
	lines.push(
		`Renderer: ${result.renderer} · GPU: ${result.gpu} · GPU timers: ${result.gpuTimers ? "yes" : "no"} · Pixel ratio ${Number(result.pixelRatio.toFixed(2))}`,
	);
	lines.push(`Browser: ${result.userAgent}`);
	lines.push(
		`Seed ${result.seed} · ${result.date}${(result.passes ?? 1) > 1 ? " · each station twice" : ""}${result.cancelled ? " · stopped before the end" : ""}`,
	);
	lines.push(
		`Score: ${score(total.gpu)} by the GPU's time, ${score(total.waited)} by the waited frame`,
	);
	for (const level of result.levels) {
		const ls = levelScore(level);
		lines.push("");
		lines.push(
			`${level.label} · ${level.canvas.width}×${level.canvas.height} · ${level.antialias} · score ${score(ls.gpu)} / ${score(ls.waited)}`,
		);
		lines.push(
			`  ${"Station".padEnd(28)}${"GPU".padStart(10)}${"Waited".padStart(10)}${"CPU".padStart(10)}${"Orbit".padStart(10)}${"Score".padStart(13)}`,
		);
		for (const s of level.stations) {
			const sc = stationScore(s);
			const orbit = s.moving[0];
			const name = `${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`;
			lines.push(
				`  ${name.padEnd(28)}${msText(s.still.gpuMs ?? Number.NaN).padStart(10)}${msText(s.still.median).padStart(10)}${msText(s.still.cpuMs ?? Number.NaN).padStart(10)}${msText(orbit ? (orbit.gpu.length > 0 ? orbit.gpuTotal.median : orbit.median) : Number.NaN).padStart(10)}${`${score(sc.gpu)} / ${score(sc.waited)}`.padStart(13)}${cpuBound(s) ? "  CPU-bound" : ""}`,
			);
		}
		lines.push("");
		lines.push("  Each station's GPU stages, and its CPU's steps (medians):");
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
