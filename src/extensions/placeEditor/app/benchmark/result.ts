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
import { type AssetGaps, notLoadedText } from "../viewport/assetProgress.js";
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
	/** A Pixel cost run's measurements: one a render scale, fewest pixels first. */
	pixels?: PixelPoint[];
	/** The GPU's own time by stage, sun maps drawn every frame as when moving. */
	gpu: StageRow[];
	gpuTotal: { median: number; p95: number };
	/** An orbit; for the Moving station, each control's motion. */
	moving: MovingRow[];
	counts: {
		draws: number;
		instances: number;
		triangles: number;
		particles: number;
		beams: number;
		/** Assets the station needed that were not in the view: see notLoadedText. */
		assets?: AssetGaps;
	};
}

/** The render scales a Pixel cost run times each station at, as shares of the page's pixels; a 1x screen stops at 100%. */
export const PIXEL_SCALES = [0.5, 0.75, 1, 1.5, 2] as const;

/** One station drawn at one render scale. */
export interface PixelPoint {
	/** The share of the page's pixels across and down. */
	scale: number;
	width: number;
	height: number;
	/** The frame shaded, as the station is drawn. */
	still: Timed;
	/** The parts' depth alone, no colour worked out for any pixel: where the renderer has the probe. */
	depthOnly?: Timed;
	gpu: StageRow[];
	gpuTotal: { median: number; p95: number };
}

/**
 * A straight line through times against pixels: what a frame costs however
 * few it has (`fixed`, ms), and what each million adds (`perMp`, ms, which
 * is also nanoseconds a pixel). `r2`, how nearly the times lie on it.
 */
export interface PixelFit {
	fixed: number;
	perMp: number;
	r2: number;
}

/** The least-squares line through `[megapixels, ms]`; null with fewer than two sizes or a time missing. */
export function pixelFit(points: readonly (readonly [number, number])[]): PixelFit | null {
	if (points.length < 2 || !points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)))
		return null;
	const n = points.length;
	const mx = points.reduce((s, [x]) => s + x, 0) / n;
	const my = points.reduce((s, [, y]) => s + y, 0) / n;
	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	for (const [x, y] of points) {
		sxx += (x - mx) ** 2;
		sxy += (x - mx) * (y - my);
		syy += (y - my) ** 2;
	}
	if (sxx === 0) return null;
	const perMp = sxy / sxx;
	return { fixed: my - perMp * mx, perMp, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

const megapixels = (p: PixelPoint) => (p.width * p.height) / 1e6;

/** A station's fits: the shaded frame, the parts' depth alone, and each GPU stage. */
export function stationPixelFits(
	s: BenchmarkStationResult,
	gpu: boolean,
): {
	shaded: PixelFit | null;
	depth: PixelFit | null;
	stages: [StageRow["stage"], PixelFit][];
} | null {
	const points = s.pixels;
	if (!points || points.length < 2) return null;
	const time = (t: Timed) => (gpu ? (t.gpuMs ?? Number.NaN) : t.median);
	const shaded = pixelFit(points.map((p) => [megapixels(p), time(p.still)] as const));
	const depth = points.every((p) => p.depthOnly)
		? pixelFit(points.map((p) => [megapixels(p), time(p.depthOnly as Timed)] as const))
		: null;
	const stages: [StageRow["stage"], PixelFit][] = [];
	for (const row of points[0].gpu) {
		const fit = pixelFit(
			points.map(
				(p) =>
					[megapixels(p), p.gpu.find((r) => r.stage === row.stage)?.median ?? Number.NaN] as const,
			),
		);
		if (fit) stages.push([row.stage, fit]);
	}
	return { shaded, depth, stages };
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
	/** Why WebGPU did not start, where the run fell back to WebGL2. */
	fellBack?: string;
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
		`Roswaal Benchmark ${result.benchmark} · Roswaal ${result.release} · ${result.ab ? `A/B: ${result.ab.label}` : result.kind === "sweep" ? "Full sweep" : result.kind === "pixels" ? "Pixel cost" : "Current settings"}`,
	);
	lines.push(
		`Renderer: ${result.renderer} · GPU: ${result.gpu} · GPU timers: ${result.gpuTimers ? "yes" : "no"} · Pixel ratio ${Number(result.pixelRatio.toFixed(2))}`,
	);
	if (result.fellBack)
		lines.push(
			`WebGPU did not start (${result.fellBack}), so this run was drawn by WebGL2: its times do not compare with WebGPU's.`,
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
	if (result.kind === "pixels") {
		lines.push(...pixelsReport(result));
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
			const fx = steps?.fx && steps.effects > 0 ? steps.fx : null;
			const parts = fx
				? ` (step ${msText(fx.step)} · sort ${msText(fx.sort)} · quads ${msText(fx.quads)} · upload ${msText(fx.upload)})`
				: "";
			const cpu = steps
				? `effects ${msText(steps.effects)}${parts} · culling ${msText(steps.culling)} · the rest ${msText(Math.max(0, (s.still.cpuMs ?? 0) - steps.effects - steps.culling))}`
				: "";
			lines.push(`  ${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`);
			if (stages) lines.push(`      GPU: ${stages}`);
			if (cpu) lines.push(`      CPU: ${cpu}`);
			lines.push(
				`      ${s.counts.draws.toLocaleString("en")} draws · ${s.counts.instances.toLocaleString("en")} instances · ${Math.round(s.counts.triangles).toLocaleString("en")} triangles${s.counts.particles ? ` · ${s.counts.particles.toLocaleString("en")} particles` : ""}`,
			);
			const notLoaded = notLoadedText(s.counts.assets);
			if (notLoaded) lines.push(`      ${notLoaded}`);
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

const middle = (values: number[]) => {
	const v = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (v.length === 0) return Number.NaN;
	const m = Math.floor(v.length / 2);
	return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** "3.71": a cost per million pixels in ms, which is also nanoseconds a pixel. */
const nsText = (v: number | undefined) =>
	v !== undefined && Number.isFinite(v) ? (Math.abs(v) < 0.005 ? 0 : v).toFixed(2) : "–";

function pixelsReport(result: BenchmarkResult): string[] {
	const gpu = result.gpuTimers;
	const lines: string[] = [];
	lines.push(
		`Each station timed at every render scale this screen has, shaded and as the parts' depth alone, by the ${gpu ? "GPU's own time" : "frame interval"}, and fitted as a fixed cost plus a cost per million pixels. 1 ms per million pixels is 1 ns a pixel.`,
	);
	for (const level of result.levels) {
		const fits = level.stations.map((s) => [s, stationPixelFits(s, gpu)] as const);
		const sizes = (level.stations[0]?.pixels ?? []).map(
			(p) => `${Math.round(p.scale * 100)}% ${p.width}×${p.height}`,
		);
		lines.push("");
		lines.push(`${level.label} · ${level.antialias} · ${sizes.join(", ")}`);
		const shaded = fits.map(([, f]) => f?.shaded?.perMp ?? Number.NaN);
		const depth = fits.map(([, f]) => f?.depth?.perMp ?? Number.NaN);
		const finite = shaded.filter(Number.isFinite);
		lines.push(
			`  A shaded pixel: ${nsText(middle(shaded))} ns across the stations (the median), up to ${nsText(finite.length ? Math.max(...finite) : Number.NaN)}; the parts' depth alone ${nsText(middle(depth))} ns.`,
		);
		lines.push(
			`  ${"Station".padEnd(28)}${"Fixed".padStart(9)}${"Per Mpx".padStart(10)}${"Depth".padStart(9)}${"Shading".padStart(10)}${"Fit".padStart(7)}`,
		);
		for (const [s, f] of fits) {
			const name = `${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`;
			const shading = f?.shaded && f.depth ? f.shaded.perMp - f.depth.perMp : Number.NaN;
			lines.push(
				`  ${name.padEnd(28)}${(f?.shaded ? msText(f.shaded.fixed) : "–").padStart(9)}${nsText(f?.shaded?.perMp).padStart(10)}${nsText(f?.depth?.perMp).padStart(9)}${nsText(shading).padStart(10)}${nsText(f?.shaded?.r2).padStart(7)}`,
			);
		}
		lines.push("");
		lines.push("  Each station's GPU stages: per million pixels, and fixed:");
		for (const [s, f] of fits) {
			if (!f || f.stages.length === 0) continue;
			lines.push(`  ${String(s.n).padStart(2)} ${s.name}${s.variant ? ` · ${s.variant}` : ""}`);
			lines.push(
				`      ${f.stages.map(([stage, fit]) => `${STAGE_SHORT[stage]} ${nsText(fit.perMp)} (${msText(fit.fixed)})`).join(" · ")}`,
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
