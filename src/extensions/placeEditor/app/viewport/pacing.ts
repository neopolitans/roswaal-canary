/**
 * When the view may draw its next frame: a frame-rate cap that keeps its
 * average, and Steady, VSync that drops to half the display's rate while
 * frames cannot keep up with it.
 *
 * A display shows a new frame only at its refresh, so a frame that takes a
 * little longer than one refresh waits for the next: some frames show after
 * one refresh, some after two, and the motion stutters though the average is
 * good. Half the rate, every frame after two, is smooth, as consoles lock to
 * 30 when they cannot hold 60.
 */

/** How early in its slot a frame may still be drawn, in ms: the display's timestamps jitter. */
const EARLY = 1;

/**
 * A cap of `rate` frames a second that keeps the average: each frame's turn
 * comes one `1000 / rate` after the last one's turn, not after it was drawn,
 * so on a 60 Hz display 24 alternates two and three refreshes (24 a second)
 * where waiting a whole step after each frame drew every third (20).
 */
export class FrameCap {
	private due = Number.NEGATIVE_INFINITY;

	/** Whether a frame may be drawn at `now`, counted as drawn if so. */
	allows(now: number, rate: number): boolean {
		const step = 1000 / rate;
		// Nothing drawn for a while: the schedule starts again from now.
		if (now - this.due > step) this.due = now;
		if (now < this.due - EARLY) return false;
		this.due += step;
		return true;
	}
}

/** Frames looked at, in a row, to decide that frames do not keep up. */
const WINDOW = 30;
/** Of WINDOW, how many missing a refresh halve the rate. */
const MISSES_TO_HALVE = 8;
/** Frame work, as a share of a refresh, under which full rate is tried again. */
const ROOM = 0.7;
/** Frames of work timed while halved before full rate is tried again on them. */
const WORK_SAMPLES = 60;
/** Without the GPU's times: the first wait before full rate is tried again, in ms, doubling each time it fails. */
const RETRY_MS = 5000;
const RETRY_MOST_MS = 60_000;

/** Steady: whether it is halved now, and why it would change. */
export class SteadyVsync {
	/** Recent gaps between frames drawn one after the other, for the display's refresh. */
	private gaps: number[] = [];
	/** The last frames' gaps since the rate last changed: missed a refresh or not. */
	private recent: boolean[] = [];
	private work: number[] = [];
	private last = 0;
	private halvedAt = Number.NEGATIVE_INFINITY;
	private retry = RETRY_MS;
	private readonly cap = new FrameCap();
	halved = false;

	/** The display's refresh, in ms: the shortest gaps frames are drawn at. 60 Hz until seen. */
	refresh(): number {
		if (this.gaps.length < 10) return 1000 / 60;
		const sorted = [...this.gaps].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length * 0.1)];
	}

	/**
	 * Whether a frame may be drawn at `now` (a refresh): every one at full
	 * rate, every other one while halved. Counted as drawn if so.
	 */
	allows(now: number): boolean {
		if (!this.halved) return true;
		// Half the refresh, less a little, so every second refresh is the turn.
		return this.cap.allows(now, 1000 / (this.refresh() * 2) + 0.5);
	}

	/**
	 * A frame was drawn at `now`. Gaps longer than four refreshes are the view
	 * going still and moving again, and say nothing about keeping up.
	 * `workTimed`: whether the GPU's time for frames will be told (WebGPU).
	 */
	drawn(now: number, workTimed: boolean): void {
		const gap = now - this.last;
		this.last = now;
		const refresh = this.refresh();
		if (gap <= 0 || gap > refresh * 4) return;
		if (!this.halved) {
			this.gaps.push(gap);
			if (this.gaps.length > 120) this.gaps.shift();
			this.recent.push(gap > refresh * 1.5);
			if (this.recent.length > WINDOW) this.recent.shift();
			if (this.recent.filter(Boolean).length >= MISSES_TO_HALVE) {
				this.halve(now);
				return;
			}
			// A full window kept up: a later halving starts its retries short again.
			if (this.recent.length === WINDOW && !this.recent.some(Boolean)) this.retry = RETRY_MS;
			return;
		}
		// Halved, without the GPU's times: full rate again after a wait, which
		// doubles each time it is halved again soon after.
		if (!workTimed && now - this.halvedAt > this.retry) this.full();
	}

	/** The GPU's time for a frame, from its start to the queue saying it is done (WebGPU). */
	worked(ms: number): void {
		if (!this.halved) return;
		this.work.push(ms);
		if (this.work.length < WORK_SAMPLES) return;
		const sorted = [...this.work].sort((a, b) => a - b);
		const typical = sorted[Math.floor(sorted.length * 0.75)];
		this.work = [];
		if (typical < this.refresh() * ROOM) this.full();
	}

	private halve(now: number): void {
		// Halved again soon after a retry: wait longer before the next.
		if (now - this.halvedAt < this.retry + 3000)
			this.retry = Math.min(RETRY_MOST_MS, this.retry * 2);
		this.halved = true;
		this.halvedAt = now;
		this.recent = [];
		this.work = [];
	}

	private full(): void {
		this.halved = false;
		this.recent = [];
		this.work = [];
	}
}
