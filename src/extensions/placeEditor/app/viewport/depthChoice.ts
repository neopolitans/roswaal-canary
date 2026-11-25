/**
 * Two ways to draw the same picture, measured in use and the faster kept,
 * where which is faster depends on the GPU and the place:
 *
 * - The depth path (DepthChoice): full, the parts' depth first and each
 *   pixel shaded once; or lean, shaded and depth-tested in one draw. On an
 *   iPad Mini (A15) lean measured slower in one place (22 Nov 2026) and
 *   2.7 ms faster in another (24 Nov).
 * - Light objects' resolution (LampChoice): full, worked out at every
 *   pixel; or half, in a pass of its own at half the pixels. On the same
 *   iPad at Native, half saved 4.6 ms with 100 lights in one area and cost
 *   0.3 to 0.6 ms with 20 or fewer (25 Nov): its pass draws every part
 *   again, which pays only where the lights are many.
 *
 * Moving frames alternate the two, one frame each, so the camera's motion
 * falls on both alike; once each has CHOICE_SAMPLES frames, the second is
 * kept only where its median is clearly under the first's.
 */

/** Frames of each way timed before one is kept. */
export const CHOICE_SAMPLES = 20;
/** The second way is kept only when its median is under this share of the first's. */
const SECOND_WINS = 0.95;

const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
};

/** Two ways measured against each other; the first kept unless the second is clearly faster. */
export class PassChoice<P extends string> {
	/** The way kept, once measured; null while measuring. */
	chosen: P | null = null;
	private times = new Map<P, number[]>();
	private turn = 0;

	constructor(readonly ways: readonly [P, P]) {
		this.reset();
	}

	/** The way the next moving frame draws with while measuring. */
	next(): P {
		return this.ways[this.turn++ % 2];
	}

	/** A frame's time, from its start to the GPU being done with it, drawn `way`. */
	record(way: P, ms: number): void {
		if (this.chosen) return;
		const list = this.times.get(way);
		if (!list) return;
		list.push(ms);
		const [first, second] = this.ways.map((w) => this.times.get(w) ?? []);
		if (first.length < CHOICE_SAMPLES || second.length < CHOICE_SAMPLES) return;
		this.chosen = median(second) < median(first) * SECOND_WINS ? this.ways[1] : this.ways[0];
	}

	/** What was measured, for a report: each way's median, ms. */
	medians(): Record<P, number> | null {
		const lists = this.ways.map((w) => this.times.get(w) ?? []);
		if (lists.some((l) => l.length === 0)) return null;
		return Object.fromEntries(this.ways.map((w, i) => [w, median(lists[i])])) as Record<P, number>;
	}

	/** Measured again: another place, size, view or setting. */
	reset(): void {
		this.chosen = null;
		this.times = new Map(this.ways.map((w) => [w, []]));
		this.turn = 0;
	}
}

export type DepthPath = "full" | "lean";

/** Automatic's depth path. */
export class DepthChoice extends PassChoice<DepthPath> {
	constructor() {
		super(["full", "lean"]);
	}
}

/** Light objects' resolution, as Automatic measures it: every pixel, or half. */
export class LampChoice extends PassChoice<"full" | "half"> {
	constructor() {
		super(["full", "half"]);
	}
}

/** Light objects' resolution as the view draws it. */
export type LampMode = "full" | "half" | "quarter";

/** The Light objects resolution setting: measured, or one of the three. */
export type LampResolution = "auto" | LampMode;

/**
 * The way the view draws light objects: half where the Rendering panel's
 * Full-resolution light is off or Dynamic optimization took it, otherwise
 * the setting, and for Automatic what was measured (full until then).
 */
export function lampMode(
	setting: LampResolution,
	fullResSwitch: boolean,
	measured: "full" | "half" | null,
): LampMode {
	if (!fullResSwitch) return setting === "quarter" ? "quarter" : "half";
	if (setting !== "auto") return setting;
	return measured ?? "full";
}
