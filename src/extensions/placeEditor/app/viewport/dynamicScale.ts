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

/** Moving frames looked at before a step is decided. */
const SAMPLES = 20;
/** The least time between two steps, in ms. */
const SETTLE_MS = 500;
/** Down a step when the typical frame takes more than this share of its budget. */
const OVER = 0.92;
/** Up a step when the typical frame at the bigger step would take less than this share. */
const UNDER = 0.8;
/** Without the GPU's times: how long without a missed frame before a step up is tried, in ms. */
const TRY_UP_MS = 3000;

export class DynamicScale {
	/** The step drawn now: 0 the screen's own pixels. */
	step = 0;
	private work: number[] = [];
	private changed = Number.NEGATIVE_INFINITY;
	private lastMiss = Number.NEGATIVE_INFINITY;

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
		if (!timed && ms > budget * 1.5) this.lastMiss = now;
		this.work.push(ms);
		if (this.work.length < SAMPLES || now - this.changed < SETTLE_MS) return false;
		const sorted = [...this.work].sort((a, b) => a - b);
		const typical = sorted[Math.floor(sorted.length * 0.75)];
		this.work = [];
		const last = DYNAMIC_STEPS.length - 1;
		if (typical > budget * (timed ? OVER : 1.5) && this.step < last) {
			this.step++;
			this.changed = now;
			return true;
		}
		if (this.step === 0) return false;
		// A step up costs as many more pixels as it adds: its share, squared.
		const ratio = (DYNAMIC_STEPS[this.step - 1] / DYNAMIC_STEPS[this.step]) ** 2;
		const fits = timed
			? typical * ratio < budget * UNDER
			: now - this.lastMiss > TRY_UP_MS && now - this.changed > TRY_UP_MS;
		if (!fits) return false;
		this.step--;
		this.changed = now;
		return true;
	}

	/** Back to the screen's own pixels: Dynamic turned off, or the view made again. */
	reset(): void {
		this.step = 0;
		this.work = [];
		this.changed = Number.NEGATIVE_INFINITY;
	}
}
