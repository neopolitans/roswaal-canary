/**
 * Profiling a frame, stage by stage, where the browser has no GPU timers.
 *
 * Safari, the iPad's included, has no timer queries for WebGL2, and its
 * WebGPU may not offer timestamps either. So a profile measures what it can
 * on any device:
 *
 * - **Stages.** While profiling, the renderer waits for the GPU at the end of
 *   each stage of the frame and the time each wait ends is noted: WebGL2's
 *   `finish`, or WebGPU's queue, each stage submitted on its own. Waiting
 *   stops the CPU and GPU overlapping, so the frame is slower than usual;
 *   what it buys is each stage's share.
 * - **Steps.** The free-running frame with the Rendering panel's steps added
 *   one at a time: each step's cost is how much slower the frame got.
 * - **Resolution.** The same at a half and a quarter of the pixels. A frame
 *   that gets much faster is bound by filling pixels; one that does not, by
 *   the work per part or the page.
 *
 * Pure, apart from the clocks reading `performance.now`, so the sums and the
 * report are tested without a GPU.
 */

/** A frame's stages, in the order they are drawn. Not every renderer has every one. */
export const STAGES = [
	"skyMaps",
	"skyOpen",
	"shadows",
	"skyCells",
	"glowSources",
	"occlusion",
	"sky",
	"place",
	"effects",
	"composite",
	"marks",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
	skyMaps: "Sky maps",
	skyOpen: "Thin parts opened",
	shadows: "Sun shadows",
	skyCells: "Lighting cells",
	glowSources: "Glow sources",
	occlusion: "Occlusion depth",
	sky: "Sky",
	place: "Parts and images",
	effects: "Beams and particles",
	composite: "Glow, bloom and post",
	marks: "Selection and handles",
};

/** A stage's name as a column of the per-level table: short. */
export const STAGE_SHORT: Record<Stage, string> = {
	skyMaps: "Sky maps",
	skyOpen: "Thin parts",
	shadows: "Shadows",
	skyCells: "Cells",
	glowSources: "Glow src",
	occlusion: "Occlusion",
	sky: "Sky",
	place: "Parts",
	effects: "Effects",
	composite: "Post",
	marks: "Marks",
};

/** What each stage draws, for the row's hover. */
export const STAGE_HINTS: Record<Stage, string> = {
	skyMaps:
		"The sun's and the sky's maps: drawn when the place, the sun or the camera's area changes.",
	shadows: "The sun's shadow cascades.",
	skyCells: "The lighting cells around the camera, found again from the near sky maps.",
	skyOpen:
		"The near sky maps with what is thinner than a window strut taken out: four passes over each map.",
	glowSources: "Neon and CrackedLava drawn for their glow.",
	occlusion: "The solid parts' depth, for occlusion culling.",
	sky: "The sky behind the place.",
	place:
		"Solid parts, Decals and Textures, and see-through parts. On WebGPU, with the sky, beams and particles: one pass.",
	effects: "Beams and ParticleEmitters.",
	composite: "Neon's glow and bloom, post effects, and the finished frame onto the screen.",
	marks: "The selection, handles and lines drawn over the place.",
};

/** A profile's base measurements: the frame cleared and nothing drawn, or the parts' depth alone. */
export type Probe = "empty" | "depth";

/** One profiled frame: milliseconds by stage, for the stages it drew. */
export type StageFrame = Partial<Record<Stage, number>>;

/** Where a renderer hands each profiled frame, once its stages are timed. */
export type StageSink = (frame: StageFrame) => void;

/**
 * For a renderer that can wait for its GPU: `wait` returns once everything
 * asked of the GPU so far is done. Each mark waits, then charges the time
 * since the last mark to its stage.
 */
export class WaitingClock {
	private last = 0;
	private frame: StageFrame = {};

	constructor(
		private readonly wait: () => void,
		private readonly sink: StageSink,
	) {}

	start(): void {
		this.wait();
		this.last = performance.now();
		this.frame = {};
	}

	mark(stage: Stage): void {
		this.wait();
		const now = performance.now();
		this.frame[stage] = (this.frame[stage] ?? 0) + (now - this.last);
		this.last = now;
	}

	end(): void {
		this.sink(this.frame);
	}
}

/**
 * For a renderer whose GPU work is submitted and finishes later: each stage is
 * submitted on its own, and the queue says when it is done. A stage's time
 * runs from when it could start -- submitted, and the stage before it done --
 * to when it is done, so the queue's own order does the sums.
 */
export class QueueClock {
	private entries: { stage: Stage; at: number; done: number }[] = [];
	private waiting = 0;
	private ended = false;

	constructor(private readonly sink: StageSink) {}

	start(): void {
		this.entries = [];
		this.waiting = 0;
		this.ended = false;
	}

	submitted(stage: Stage, done: Promise<unknown>): void {
		const entry = { stage, at: performance.now(), done: Number.NaN };
		this.entries.push(entry);
		this.waiting++;
		const settle = () => {
			entry.done = performance.now();
			this.waiting--;
			this.flush();
		};
		done.then(settle, settle);
	}

	end(): void {
		this.ended = true;
		this.flush();
	}

	private flush(): void {
		if (!this.ended || this.waiting > 0) return;
		this.ended = false;
		this.sink(queueStages(this.entries));
	}
}

/** The longest a frame's GPU work is believed to take, in ms: a longer span is a stale stamp. */
export const STAMP_SPAN = 1000;

/**
 * Each pass's GPU time, in ms, from its pair of stamps (begin, end; ns) in
 * the order the passes were encoded: from where the pass before it ended
 * (or its own begin, if later) to its own end. A tile-based GPU (Apple's)
 * overlaps one pass with the next, and Safari leaves some passes' begin
 * unwritten, so each pass's own begin-to-end summed counts time twice or
 * from a stale value; this shares the frame's timeline out once. A pass
 * whose end is before the last end, or far past the first, is stale: NaN.
 */
export function passTimes(stamps: ArrayLike<bigint>): number[] {
	const n = Math.floor(stamps.length / 2);
	const out: number[] = new Array(n).fill(Number.NaN);
	let base: bigint | null = null;
	let last = 0;
	for (let j = 0; j < n; j++) {
		const b = stamps[j * 2];
		const e = stamps[j * 2 + 1];
		if (e === 0n) continue;
		if (base === null) {
			// The first pass sets the frame's start: its own pair has to be sound.
			if (e < b || Number(e - b) / 1e6 > STAMP_SPAN) continue;
			base = b;
		}
		const end = Number(e - base) / 1e6;
		if (!(end >= last) || end > STAMP_SPAN) continue;
		const begin = Number(b - base) / 1e6;
		out[j] = end - Math.max(last, Math.min(begin, end));
		last = end;
	}
	return out;
}

/** Each stage's time from when it was submitted and when it was done, in queue order. */
export function queueStages(
	entries: readonly { stage: Stage; at: number; done: number }[],
): StageFrame {
	const frame: StageFrame = {};
	let before = Number.NEGATIVE_INFINITY;
	for (const { stage, at, done } of entries) {
		if (!Number.isFinite(done)) continue;
		const took = Math.max(0, done - Math.max(at, before));
		frame[stage] = (frame[stage] ?? 0) + took;
		before = done;
	}
	return frame;
}

/** The middle of a list, and the time 95 frames in 100 come in under. */
export function spread(values: readonly number[]): { median: number; p95: number } {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (sorted.length === 0) return { median: Number.NaN, p95: Number.NaN };
	const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
	const mid = sorted.length / 2;
	const median =
		sorted.length % 2 === 1 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
	return { median, p95: at(0.95) };
}

/** A stage's row in the profile: in how many frames it was drawn, and its times. */
export interface StageRow {
	stage: Stage;
	frames: number;
	median: number;
	p95: number;
}

/** Each stage drawn in the frames, in drawing order, with its median and slow-frame times. */
export function stageRows(frames: readonly StageFrame[]): StageRow[] {
	const rows: StageRow[] = [];
	for (const stage of STAGES) {
		const times = frames.map((f) => f[stage]).filter((t): t is number => t !== undefined);
		if (times.length === 0) continue;
		rows.push({ stage, frames: times.length, ...spread(times) });
	}
	return rows;
}

/** A frame's stages added up, for the total under the rows. */
export function stagesTotal(frames: readonly StageFrame[]): { median: number; p95: number } {
	return spread(frames.map((f) => Object.values(f).reduce((a, b) => a + (b ?? 0), 0)));
}

/** One measurement of the free-running frame: the setting, and its frame times. */
export interface Timed {
	label: string;
	median: number;
	p95: number;
	/**
	 * The GPU's own time for the frame, by its timers, where it has them: the
	 * waited time can run to the next screen refresh (Safari's often does).
	 */
	gpuMs?: number;
}

/** A row's GPU time as a column, or nothing where the GPU has no timers. */
export function gpuColumn(r: { gpuMs?: number }): string {
	return r.gpuMs !== undefined && Number.isFinite(r.gpuMs)
		? `   GPU ${msText(r.gpuMs).padStart(9)}`
		: "";
}

/** Whether every row has the GPU's own time, so sums and verdicts can use it. */
function allTimed(rows: readonly Timed[]): boolean {
	return rows.length > 0 && rows.every((r) => r.gpuMs !== undefined && Number.isFinite(r.gpuMs));
}

/** What is known of the device and the view, for the report's head. */
export interface ProfileFacts {
	renderer: string;
	gpu: string;
	gpuTimers: boolean;
	canvas: { width: number; height: number };
	css: { width: number; height: number };
	pixelRatio: number;
	samples: number;
	frameRate: string;
	/** Settings' render scale, and the share of the screen's pixels across it comes to here. */
	renderScale: string;
	/** The depth path drawn: "full" or "lean", or "" where the renderer has one. */
	depthPath: string;
	/** The level the view was at when the profile began: "Automatic, Level 12", say. */
	quality: string;
	/** The antialiasing drawn then, by name. */
	antialias: string;
	/** Where the camera was, so two profiles can be taken from the same spot. */
	camera: string;
	draws: number;
	instances: number;
	triangles: number;
	beams: number;
	particles: number;
	userAgent: string;
	version: string;
}

/** A finished profile. */
export interface ProfileResult {
	facts: ProfileFacts;
	/** The frame on screen, at the display's pace, before anything changed. */
	baseline: Timed;
	/** One frame drawn and waited for: what it costs, the GPU's part included. */
	frame: Timed;
	stages: StageRow[];
	stageTotal: { median: number; p95: number };
	/** The same frames' stages by the GPU's own timers, where it has them: no waits in them. */
	gpuStages: StageRow[];
	gpuStageTotal: { median: number; p95: number };
	/** Frames profiled stage by stage: slower than free running, since each stage is waited for. */
	stageFrames: number;
	steps: Timed[];
	/** The frame with nothing drawn, the parts' depth alone, and the parts shaded with nothing on. */
	base: Timed[];
	/** Each switch of a group turned off alone: the frame without it, and what that saves. */
	without: { title: string; rows: (Timed & { saves: number })[] }[];
	/** The frame as set, measured just before the switches are turned off, which they are compared with. */
	asSet: Timed | null;
	resolution: Timed[];
	/** One frame with the view built at one sample a pixel, and at four. */
	antialias: Timed[];
	/** One frame with each depth path, where the renderer has two: full, and lean. */
	depthPath: Timed[];
	/** One frame with WebGPU's shader in half precision, and in full, where the device has half. */
	precision: Timed[];
	/** The camera moved each way the controls move it, from where it was: see MovingRow. */
	moving: MovingRow[];
	/** Each quality level, 1 to 21, with its own scale and antialiasing: its frame, its stages, what it set. */
	quality: LevelRow[];
	/** The smallest step the page's clock takes, measured: Safari's is coarse. */
	clock: number;
}

/** The camera moved as a drag, a pinch or a stick moves it: its frames, and what was drawn again. */
export interface MovingRow extends Timed {
	frames: number;
	stages: StageRow[];
	/** Its stages by the GPU's own timers, where it has them. */
	gpu: StageRow[];
	gpuTotal: { median: number; p95: number };
	/** What was drawn again over the frames, where the renderer counts it. */
	redrawn: { probeFaces: number; nearMaps: number; sunMaps: number } | null;
}

/** One quality level as the sweep drew it: its frame and stages, and what it set. */
export interface LevelRow extends Timed {
	level: number;
	canvas: { width: number; height: number };
	/** The antialiasing drawn, by name. */
	antialias: string;
	/** Each sun shadow map's side, in texels. */
	shadowMap: number;
	/** How far the sun's sharp shadows reach, in studs. */
	reach: number;
	/** The soft stand-in below Level 10 rather than sharp shadows. */
	blobs: boolean;
	/** How far parts are drawn, in studs; null, all of them. */
	distance: number | null;
	/** Neon's glow: not drawn, found at half the view's size, or at its size. */
	glow: "off" | "half" | "full";
	/** The switches this level turns on that the level below has off, by name. */
	adds: string[];
	stages: StageRow[];
	stageTotal: { median: number; p95: number };
	/** Its stages by the GPU's own timers, where it has them. */
	gpu: StageRow[];
	gpuTotal: { median: number; p95: number };
	draws: number;
	instances: number;
	triangles: number;
}

/** What a level draws, in a line: for the panel and the report. */
export function levelSettings(r: LevelRow): string {
	return [
		`${r.canvas.width}×${r.canvas.height}`,
		r.antialias,
		r.blobs ? `soft shadows, map ${r.shadowMap}` : `sun map ${r.shadowMap}, reach ${r.reach}`,
		`glow ${r.glow}`,
		r.distance === null ? "every distance" : `to ${r.distance.toLocaleString("en")} studs`,
		`${r.draws.toLocaleString("en")} draws`,
		`${Math.round(r.triangles).toLocaleString("en")} triangles`,
	].join(" · ");
}

/** "12.3 ms", or a dash for what was not measured. */
export const msText = (ms: number): string =>
	Number.isFinite(ms) ? `${ms < 10 ? ms.toFixed(2) : ms.toFixed(1)} ms` : "–";

/** "60 fps" from a frame's milliseconds. */
export const fpsText = (ms: number): string =>
	Number.isFinite(ms) && ms > 0 ? `${Math.round(1000 / ms)} fps` : "–";

/**
 * What the sweeps say, in a sentence or two: whether filling pixels is what
 * costs, and which step costs most.
 */
export function profileVerdict(result: ProfileResult): string[] {
	const out: string[] = [];
	const byGpu = allTimed(result.resolution);
	const time = (r: Timed | undefined) =>
		r ? (byGpu ? (r.gpuMs ?? Number.NaN) : r.median) : Number.NaN;
	const full = time(result.resolution[0]);
	const quarter = time(result.resolution.at(-1));
	if (Number.isFinite(full) && Number.isFinite(quarter) && quarter > 0) {
		const gain = full / quarter;
		out.push(
			gain >= 1.6
				? `Bound by filling pixels: at a quarter of the pixels the frame is ${gain.toFixed(1)}× as fast.`
				: `Not bound by filling pixels: a quarter of the pixels is only ${gain.toFixed(1)}× as fast, so the cost is per frame or per part.`,
		);
	}
	const costs = stepCosts(result.steps)
		.map((c) => (c.gpuCost !== undefined ? { ...c, cost: c.gpuCost } : c))
		.filter((c) => Number.isFinite(c.cost));
	const worst = costs.reduce<(typeof costs)[number] | null>(
		(a, b) => (a === null || b.cost > a.cost ? b : a),
		null,
	);
	if (worst && worst.cost > 1)
		out.push(`The costliest step is ${worst.label}: ${msText(worst.cost)} a frame.`);
	const rows = result.without.flatMap((g) => g.rows).filter((r) => Number.isFinite(r.saves));
	const most = rows.reduce<(typeof rows)[number] | null>(
		(a, b) => (a === null || b.saves > a.saves ? b : a),
		null,
	);
	if (most && most.saves > 1)
		out.push(
			`Of the switches tried alone, ${most.label} off saves the most: ${msText(most.saves)} a frame.`,
		);
	return out;
}

/** Each step's cost: how much slower the frame got when it was added. */
export function stepCosts(
	steps: readonly Timed[],
): { label: string; frame: number; cost: number; gpu?: number; gpuCost?: number }[] {
	const timed = allTimed(steps);
	return steps.map((s, i) => ({
		label: s.label,
		frame: s.median,
		cost: i === 0 ? Number.NaN : s.median - steps[i - 1].median,
		...(timed
			? {
					gpu: s.gpuMs,
					gpuCost: i === 0 ? Number.NaN : (s.gpuMs ?? 0) - (steps[i - 1].gpuMs ?? 0),
				}
			: {}),
	}));
}

/** The whole profile as text, to paste into an issue or a message. */
export function profileReport(result: ProfileResult): string {
	const { facts } = result;
	const lines: string[] = [];
	lines.push(`Roswaal ${facts.version}, Place Editor profile`);
	lines.push(
		`Renderer: ${facts.renderer} · GPU: ${facts.gpu} · GPU timers: ${facts.gpuTimers ? "yes" : "no"}`,
	);
	lines.push(
		`Canvas: ${facts.canvas.width}×${facts.canvas.height} px (${facts.css.width}×${facts.css.height} at ${Number(facts.pixelRatio.toFixed(2))}×) · Antialiasing: ${facts.antialias || `${facts.samples}×`} · Frame rate: ${facts.frameRate} · Render scale: ${facts.renderScale}${facts.depthPath ? ` · Depth: ${facts.depthPath}` : ""}`,
	);
	lines.push(
		`Last frame: ${facts.draws.toLocaleString("en")} draw calls, ${facts.instances.toLocaleString("en")} instances, ${Math.round(facts.triangles).toLocaleString("en")} triangles, ${facts.beams} beams, ${facts.particles.toLocaleString("en")} particles`,
	);
	if (facts.quality) lines.push(`Quality: ${facts.quality}`);
	if (facts.camera) lines.push(`Camera: ${facts.camera}`);
	lines.push(`Clock step: ${msText(result.clock)}`);
	lines.push(`Browser: ${facts.userAgent}`);
	lines.push("");
	lines.push(
		`On screen: ${msText(result.baseline.median)} (${fpsText(result.baseline.median)}), slow frames ${msText(result.baseline.p95)}`,
	);
	lines.push(
		`One frame, waited for: ${msText(result.frame.median)}, slow frames ${msText(result.frame.p95)}`,
	);
	for (const line of profileVerdict(result)) lines.push(line);
	if (result.frame.gpuMs !== undefined)
		lines.push(
			"Rows give the frame waited for, then the GPU's own time: a wait can run to the next screen refresh.",
		);
	lines.push("");
	lines.push(
		`Stages, waited for one at a time (${result.stageFrames} frames; median, slow frames):`,
	);
	for (const row of result.stages)
		lines.push(
			`  ${STAGE_LABELS[row.stage].padEnd(24)} ${msText(row.median).padStart(9)} ${msText(row.p95).padStart(9)}${row.frames < result.stageFrames ? `  (${row.frames} frames)` : ""}`,
		);
	lines.push(
		`  ${"All stages".padEnd(24)} ${msText(result.stageTotal.median).padStart(9)} ${msText(result.stageTotal.p95).padStart(9)}`,
	);
	if (result.gpuStages.length > 0) {
		lines.push("");
		lines.push(
			"The same stages by the GPU's own timers, sun maps drawn every frame (median, slow frames):",
		);
		for (const row of result.gpuStages)
			lines.push(
				`  ${STAGE_LABELS[row.stage].padEnd(24)} ${msText(row.median).padStart(9)} ${msText(row.p95).padStart(9)}`,
			);
		lines.push(
			`  ${"All stages".padEnd(24)} ${msText(result.gpuStageTotal.median).padStart(9)} ${msText(result.gpuStageTotal.p95).padStart(9)}`,
		);
	}
	lines.push("");
	lines.push("Base, every feature off (frame):");
	for (const b of result.base)
		lines.push(
			`  ${b.label.padEnd(24)} ${Number.isFinite(b.median) ? `${msText(b.median).padStart(9)}${gpuColumn(b)}` : "  not here"}`,
		);
	lines.push("");
	if (result.asSet)
		lines.push(
			`As set, just before the switches below: ${msText(result.asSet.median)}${gpuColumn(result.asSet)}`,
		);
	for (const group of result.without) {
		lines.push(`${group.title}, each switch off alone (frame, saved):`);
		for (const r of group.rows)
			lines.push(
				`  ${`Without ${r.label}`.padEnd(30)} ${msText(r.median).padStart(9)} ${msText(r.saves).padStart(9)}${gpuColumn(r)}`,
			);
		lines.push("");
	}
	lines.push("Steps added one at a time (frame, cost of the step):");
	for (const s of stepCosts(result.steps))
		lines.push(
			`  ${s.label.padEnd(24)} ${msText(s.frame).padStart(9)} ${(Number.isFinite(s.cost) ? `${s.cost >= 0 ? "+" : ""}${msText(s.cost)}` : "").padEnd(9)}${s.gpu !== undefined ? `${gpuColumn({ gpuMs: s.gpu })} ${s.gpuCost !== undefined && Number.isFinite(s.gpuCost) ? `${s.gpuCost >= 0 ? "+" : ""}${msText(s.gpuCost)}` : ""}` : ""}`,
		);
	lines.push("");
	lines.push("Resolution:");
	for (const r of result.resolution)
		lines.push(
			`  ${r.label.padEnd(24)} ${msText(r.median).padStart(9)} ${fpsText(r.median).padStart(8)}${gpuColumn(r)}`,
		);
	if (result.antialias.length > 0) {
		lines.push("");
		lines.push("Antialiasing, the view built again for each:");
		for (const r of result.antialias)
			lines.push(
				`  ${r.label.padEnd(24)} ${msText(r.median).padStart(9)} ${fpsText(r.median).padStart(8)}${gpuColumn(r)}`,
			);
	}
	if (result.precision.length > 0) {
		lines.push("");
		lines.push("Shader precision, the view built again for each:");
		for (const r of result.precision)
			lines.push(
				`  ${r.label.padEnd(24)} ${msText(r.median).padStart(9)} ${fpsText(r.median).padStart(8)}${gpuColumn(r)}`,
			);
	}
	if (result.depthPath.length > 0) {
		lines.push("");
		lines.push("Depth path:");
		for (const r of result.depthPath)
			lines.push(
				`  ${r.label.padEnd(24)} ${msText(r.median).padStart(9)} ${fpsText(r.median).padStart(8)}${gpuColumn(r)}`,
			);
	}
	if (result.moving.length > 0) {
		lines.push("");
		lines.push(
			"Camera moving, each from where it began, sun maps drawn every frame (frame; then the GPU's stages):",
		);
		for (const r of result.moving) {
			const total = r.gpu.length > 0 ? `   GPU ${msText(r.gpuTotal.median).padStart(9)}` : "";
			lines.push(
				`  ${r.label.padEnd(24)} ${msText(r.median).padStart(9)} ${fpsText(r.median).padStart(8)}${total}`,
			);
			const rows = r.gpu.length > 0 ? r.gpu : r.stages;
			if (rows.length > 0)
				lines.push(
					`      ${rows.map((s) => `${STAGE_SHORT[s.stage]} ${msText(s.median)}`).join(" · ")}`,
				);
			if (r.redrawn)
				lines.push(
					`      over ${r.frames} frames, drawn again: ${r.redrawn.probeFaces} reflection faces, ${r.redrawn.nearMaps} near sky maps`,
				);
		}
	}
	if (result.quality.length > 0) {
		lines.push("");
		lines.push("Quality levels, each with its own scale and antialiasing:");
		for (const r of result.quality)
			lines.push(
				`  ${r.label.padEnd(24)} ${msText(r.median).padStart(9)} ${fpsText(r.median).padStart(8)}${gpuColumn(r)}`,
			);
		// The GPU's own times where it has them: the waited times charge a
		// stage for waiting on the screen.
		const timers = result.quality.some((r) => r.gpu.length > 0);
		const rowsOf = (r: LevelRow) => (timers ? r.gpu : r.stages);
		const totalOf = (r: LevelRow) => (timers ? r.gpuTotal : r.stageTotal);
		const shown = STAGES.filter((s) =>
			result.quality.some((r) => rowsOf(r).some((x) => x.stage === s)),
		);
		if (shown.length > 0) {
			lines.push("");
			lines.push(
				timers
					? "Each level's stages by the GPU's own timers, sun maps drawn every frame as when the camera moves (medians):"
					: "Each level's stages, waited for one at a time (medians):",
			);
			lines.push(
				`  ${"Level".padEnd(7)}${"Frame".padStart(9)}${shown.map((s) => STAGE_SHORT[s].padStart(10)).join("")}${"Total".padStart(9)}`,
			);
			for (const r of result.quality) {
				const cells = shown.map((s) => {
					const x = rowsOf(r).find((y) => y.stage === s);
					return (x ? msText(x.median) : "–").padStart(10);
				});
				lines.push(
					`  ${String(r.level).padEnd(7)}${msText(r.median).padStart(9)}${cells.join("")}${msText(totalOf(r).median).padStart(9)}`,
				);
			}
		}
		lines.push("");
		lines.push("What each level draws:");
		for (const r of result.quality) {
			lines.push(`  Level ${String(r.level).padEnd(3)} ${levelSettings(r)}`);
			if (r.adds.length > 0) lines.push(`            adds ${r.adds.join(", ")}`);
		}
	}
	return lines.join("\n");
}
