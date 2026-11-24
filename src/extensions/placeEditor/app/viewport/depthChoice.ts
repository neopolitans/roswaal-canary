/**
 * The depth path Automatic draws with, measured rather than assumed: full
 * (the parts' depth first, then each pixel shaded once) or lean (shaded and
 * depth-tested in one draw). Which is faster depends on the GPU and the
 * place: on an iPad Mini (A15) lean measured slower in one place (22 Nov
 * 2026) and 2.7 ms faster in another (24 Nov), so it is timed in use.
 *
 * Moving frames alternate the two, one frame each, so the camera's motion
 * falls on both alike; once each has DEPTH_SAMPLES frames, the faster by its
 * median is kept. Full unless lean is clearly faster: it is the path every
 * other GPU wants, and the one the stages are profiled against.
 */

export type DepthPath = "full" | "lean";

/** Frames of each path timed before one is kept. */
export const DEPTH_SAMPLES = 20;
/** Lean is kept only when its median is under this share of full's. */
const LEAN_WINS = 0.95;

const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
};

export class DepthChoice {
	/** The path kept, once measured; null while measuring. */
	chosen: DepthPath | null = null;
	private times: Record<DepthPath, number[]> = { full: [], lean: [] };
	private turn = 0;

	/** The path the next moving frame draws with while measuring. */
	next(): DepthPath {
		return this.turn++ % 2 === 0 ? "full" : "lean";
	}

	/** A frame's time, from its start to the GPU being done with it, drawn with `path`. */
	record(path: DepthPath, ms: number): void {
		if (this.chosen) return;
		this.times[path].push(ms);
		if (this.times.full.length < DEPTH_SAMPLES || this.times.lean.length < DEPTH_SAMPLES) return;
		this.chosen = median(this.times.lean) < median(this.times.full) * LEAN_WINS ? "lean" : "full";
	}

	/** What was measured, for a report: each path's median, ms. */
	medians(): { full: number; lean: number } | null {
		if (this.times.full.length === 0 || this.times.lean.length === 0) return null;
		return { full: median(this.times.full), lean: median(this.times.lean) };
	}

	/** Measured again: another place, scale or level. */
	reset(): void {
		this.chosen = null;
		this.times = { full: [], lean: [] };
		this.turn = 0;
	}
}
