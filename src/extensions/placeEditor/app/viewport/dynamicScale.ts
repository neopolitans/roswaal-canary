/**
 * Render scale Dynamic: the place drawn at fewer pixels while frames do not
 * fit the display, and at more once they fit with room, in a few steps.
 *
 * Steps, not a smooth scale: each change makes the frame's targets again,
 * itself a small hitch, so it moves at most twice a second, and only while
 * the view moves. A still view keeps its step; the upscaler's still frames
 * gather it up to the screen's own pixels, so stopping costs no detail.
 */

/** Each step's share of the screen's own pixels across, largest first. */
export const DYNAMIC_STEPS = [1, 0.875, 0.75, 0.625, 0.5] as const;

/** Moving frames looked at before a change is decided. */
const SAMPLES = 20;
/** The least time between two changes, in ms. */
const SETTLE_MS = 500;
/** The frame taken as typical: the one three quarters of the way up, slow ones counted. */
const TYPICAL = 0.75;
/** Over budget when the typical frame takes more than this share of it, by the GPU's own times. */
const OVER = 0.92;
/** Without the GPU's times, the time between frames: missed when over this share of the budget. */
const MISSED = 1.5;
/** Up a step when the typical frame at the bigger step would take less than this share. */
const UNDER = 0.8;
/** Without the GPU's times: how long without a missed frame before a step up is tried, in ms. */
const TRY_UP_MS = 3000;

/**
 * What Dynamic's render scale and Dynamic optimization both read of moving
 * frames: a window of them, the typical one once it is full, whether that is
 * over budget, and when a frame was last missed. Each decides for itself what
 * to change.
 */
export class FrameWindow {
	/** When the last change was made, in ms. */
	changed = Number.NEGATIVE_INFINITY;
	/** When a frame was last missed, where the GPU's times are not to be had. */
	lastMiss = Number.NEGATIVE_INFINITY;
	private work: number[] = [];

	/**
	 * A moving frame, as `DynamicScale.frame` takes it. The typical frame once
	 * the window is full and the last change has settled, and the window
	 * started again; null until then.
	 */
	note(now: number, ms: number, budget: number, timed: boolean): number | null {
		if (!timed && ms > budget * MISSED) this.lastMiss = now;
		this.work.push(ms);
		if (this.work.length < SAMPLES || now - this.changed < SETTLE_MS) return null;
		const sorted = [...this.work].sort((a, b) => a - b);
		this.work = [];
		return sorted[Math.floor(sorted.length * TYPICAL)];
	}

	/** Whether a typical frame is over its budget. */
	over(typical: number, budget: number, timed: boolean): boolean {
		return typical > budget * (timed ? OVER : MISSED);
	}

	/** A change was made: the next waits for it to settle. */
	moved(now: number): void {
		this.changed = now;
	}

	/** Started again: the window and the last change. The last missed frame stands. */
	reset(): void {
		this.work = [];
		this.changed = Number.NEGATIVE_INFINITY;
	}
}

export class DynamicScale {
	/** The step drawn now: 0 the screen's own pixels. */
	step = 0;
	private frames = new FrameWindow();

	/** The share of the screen's own pixels across drawn now. */
	share(): number {
		return DYNAMIC_STEPS[this.step];
	}

	/** Whether it is at its last step, or its first: where the quality level may take over. */
	atEnd(): boolean {
		return this.step === 0 || this.step === DYNAMIC_STEPS.length - 1;
	}

	/**
	 * A moving frame: the GPU's time for it where the browser says (WebGPU),
	 * otherwise the time since the frame before, and the budget a frame has.
	 * True when the step changed, for the view to be sized again.
	 */
	frame(now: number, ms: number, budget: number, timed: boolean): boolean {
		const frames = this.frames;
		const typical = frames.note(now, ms, budget, timed);
		if (typical === null) return false;
		if (frames.over(typical, budget, timed) && this.step < DYNAMIC_STEPS.length - 1) {
			this.step++;
			frames.moved(now);
			return true;
		}
		if (this.step === 0) return false;
		// A step up costs as many more pixels as it adds: its share, squared.
		const ratio = (DYNAMIC_STEPS[this.step - 1] / DYNAMIC_STEPS[this.step]) ** 2;
		const fits = timed
			? typical * ratio < budget * UNDER
			: now - frames.lastMiss > TRY_UP_MS && now - frames.changed > TRY_UP_MS;
		if (!fits) return false;
		this.step--;
		frames.moved(now);
		return true;
	}

	/** Back to the screen's own pixels: Dynamic turned off, or the view made again. */
	reset(): void {
		this.step = 0;
		this.frames.reset();
	}
}

/**
 * Dynamic optimization's savings, in the order they are taken while frames do
 * not fit, whatever the level, the least visible first: light objects at half
 * the pixels (the Full-resolution light switch off), bloom at half, bloom at a
 * quarter, light objects at a quarter. Each only lowers a resolution, never
 * raises one Settings has set lower. On an iPad Mini at 150% and Native (25
 * Nov 2026), the lights and bloom at fewer pixels did most to hold 60 Hz.
 */
export const DYNAMIC_SAVINGS = [
	"fullResLamps",
	"bloomHalf",
	"bloomQuarter",
	"lampsQuarter",
] as const;
export type DynamicSaving = (typeof DYNAMIC_SAVINGS)[number];

/** Each saving in words, for Inspect and a benchmark's report. */
export const SAVING_LABELS: Record<DynamicSaving, string> = {
	fullResLamps: "Light objects at half",
	bloomHalf: "Bloom at half",
	bloomQuarter: "Bloom at a quarter",
	lampsQuarter: "Light objects at a quarter",
};

/** What the savings taken come to: the least light objects' and bloom's resolutions they leave. */
export function savingsCome(off: readonly string[]): {
	lamps: "half" | "quarter" | null;
	bloom: "half" | "quarter" | null;
} {
	return {
		lamps: off.includes("lampsQuarter") ? "quarter" : off.includes("fullResLamps") ? "half" : null,
		bloom: off.includes("bloomQuarter") ? "quarter" : off.includes("bloomHalf") ? "half" : null,
	};
}

/** Back on only when the typical frame takes less than this share of its budget. */
const SAVINGS_ROOM = 0.6;
/** And no sooner than this after the last change, in ms: a saving's effect is seen first. */
const SAVINGS_SETTLE_MS = 3000;

/** Dynamic optimization: how many of DYNAMIC_SAVINGS are taken now. */
export class DynamicSavings {
	taken = 0;
	private frames = new FrameWindow();

	/** The switches turned off now. */
	off(): readonly DynamicSaving[] {
		return DYNAMIC_SAVINGS.slice(0, this.taken);
	}

	/** Whether every saving is taken: Dynamic's render scale may go down from here. */
	full(): boolean {
		return this.taken === DYNAMIC_SAVINGS.length;
	}

	/**
	 * A moving frame, as DynamicScale.frame; `mayGiveBack`: whether a saving
	 * may be given back now (not while the render scale is still lowered).
	 * True when what is taken changed.
	 */
	frame(now: number, ms: number, budget: number, timed: boolean, mayGiveBack = true): boolean {
		const frames = this.frames;
		const typical = frames.note(now, ms, budget, timed);
		if (typical === null) return false;
		if (frames.over(typical, budget, timed) && !this.full()) {
			this.taken++;
			frames.moved(now);
			return true;
		}
		if (this.taken === 0 || !mayGiveBack || now - frames.changed < SAVINGS_SETTLE_MS) return false;
		const room = timed
			? typical < budget * SAVINGS_ROOM
			: now - frames.lastMiss > SAVINGS_SETTLE_MS * 2;
		if (!room) return false;
		this.taken--;
		frames.moved(now);
		return true;
	}

	reset(): void {
		this.taken = 0;
		this.frames.reset();
	}
}
