/**
 * Quality levels: Automatic and Level 1–21, as Studio's Enum.QualityLevel.
 * A level sets the Rendering panel's switches, the render scale, the
 * antialiasing, how far parts are drawn, how far the sun's shadows reach and
 * the size of their maps.
 *
 * The render distances and the bands where glow and sharp shadows begin were
 * fitted to Studio's screen captures at each EditQualityLevel (22 Nov 2026):
 * rows of Neon cubes out to 9,750 studs, and one spot for light. Render scale
 * and antialiasing are this viewer's own: they are a tablet's biggest costs.
 */

import type { AntialiasMode } from "./antialias.js";
import { featuresAtLevel, type RenderFeatures } from "./renderFeatures.js";
import type { ViewQuality } from "./view.js";

export interface QualityLevel {
	level: number;
	/** How far from the camera parts are drawn, in studs; null, all of them. */
	distance: number | null;
	/**
	 * The share of the page's own pixels across and down (CSS pixels, before
	 * a Retina screen doubles them); "native", every pixel the screen has.
	 */
	scale: number | "native";
	/**
	 * Antialiasing: none, then a pass over the frame, which costs a tablet
	 * least, then four samples a pixel.
	 */
	antialias: AntialiasMode;
	/** How far from the camera the sun's sharp shadows reach, in studs. */
	reach: number;
	/** Each sun shadow map's side, in texels. */
	shadowMap: number;
	/**
	 * Below Level 10 Studio has no shadow map and casts soft blobs from its
	 * voxel lighting: here a small map blurred this wide, in studs, stands in.
	 */
	blobWidth: number | null;
	features: RenderFeatures;
}

/** The highest level: everything, As Studio. */
export const TOP_LEVEL = 21;

/** Studio's render distance at each level, by its lowest level; null from 17, none. */
const DISTANCE: [number, number | null][] = [
	[1, 500],
	[2, 800],
	[3, 1100],
	[4, 1550],
	[13, 2200],
	[14, 3000],
	[15, 4000],
	[16, 6000],
	[17, null],
];

/**
 * How far from the camera the sun's sharp shadows reach, fitted to Studio's
 * captures at each level (22 Nov 2026): a floor of shadows from 40 to 1,200
 * studs, cast from just above it and from 1,000 studs up, which reached as
 * far. Below Level 10 the blurred stand-in reaches as far as Studio's voxel
 * shadows did beyond Level 10's map.
 */
const REACH: [number, number][] = [
	[1, 384],
	[10, 90],
	[11, 124],
	[12, 164],
	[13, 209],
	[14, 269],
	[15, 318],
	[16, 385],
	[17, 430],
	[18, 528],
	[19, 578],
];

function stepped<T>(table: [number, T][], level: number): T {
	let value = table[0][1];
	for (const [from, v] of table) if (level >= from) value = v;
	return value;
}

function makeLevel(level: number): QualityLevel {
	return {
		level,
		distance: stepped(DISTANCE, level),
		scale: level <= 2 ? 0.5 : level <= 9 ? 0.75 : level <= 17 ? 1 : "native",
		// No level multisamples: at the screen's own pixels MSAA 4× took an iPad
		// Mini from 15 ms of GPU a frame to 62, one draw or two (canary.16), for
		// little to see over SMAA. It is the Antialiasing setting's to choose.
		antialias: level >= 13 ? "smaa" : level >= 10 ? "fxaa" : "off",
		reach: stepped(REACH, level),
		shadowMap: level <= 9 ? 512 : level <= 12 ? 1024 : 2048,
		blobWidth: level <= 9 ? 3 : null,
		features: featuresAtLevel(level),
	};
}

export const QUALITY_LEVELS: readonly QualityLevel[] = Array.from({ length: TOP_LEVEL }, (_, i) =>
	makeLevel(i + 1),
);

/** The level by number, held within 1–21. */
export function qualityLevel(level: number): QualityLevel {
	const n = Number.isFinite(level)
		? Math.max(1, Math.min(TOP_LEVEL, Math.round(level)))
		: TOP_LEVEL;
	return QUALITY_LEVELS[n - 1];
}

/** What the view itself is told of a level: see ViewRenderer.setQuality. */
export function viewQuality(q: QualityLevel): ViewQuality {
	return {
		distance: q.distance,
		reach: q.reach,
		blobWidth: q.blobWidth,
		glowHalf: q.level <= 12,
	};
}

/** The Rendering panel's preset id for a level, and back. */
export function levelPreset(level: number): string {
	return `level-${level}`;
}
export function presetLevel(id: string): number | null {
	const m = /^level-(\d+)$/.exec(id);
	return m ? qualityLevel(Number(m[1])).level : null;
}

/** What Automatic knows of the device before a frame is drawn. */
export interface DeviceClass {
	/** A touch screen with no fine pointer. */
	touch: boolean;
	/** The screen's shorter side, in CSS pixels. */
	shortSide: number;
	/** The GPU's name, where the browser gives it. */
	gpu: string;
}

/**
 * Automatic's first level: a phone 5, a tablet 10, a laptop's built-in GPU
 * 15 and any other computer 21. Frame times then move it (see AutoQuality).
 */
export function startLevel(device: DeviceClass): number {
	if (device.touch) return device.shortSide < 600 ? 5 : 10;
	if (/intel|uhd|iris|swiftshader|llvmpipe|basic render/i.test(device.gpu)) return 15;
	return TOP_LEVEL;
}

/** Frame times past this, for DOWN_AFTER, take Automatic a level down; under UP_UNDER for UP_AFTER, one up. */
export const DOWN_OVER = 20;
export const DOWN_AFTER = 2000;
export const UP_UNDER = 11;
export const UP_AFTER = 5000;

/**
 * Automatic's steps: frames drawn one after another (the camera moving) are
 * timed; a slow run takes a level down, a long fast run one up, never back
 * up to a level it has come down from. A pause between frames starts a new
 * run, as an idle view's frame times say nothing.
 */
export class AutoQuality {
	level: number;
	/** The lowest level it has come down from: it climbs no higher than one under. */
	private ceiling = TOP_LEVEL;
	private slowFor = 0;
	private fastFor = 0;

	constructor(start: number) {
		this.level = qualityLevel(start).level;
	}

	/**
	 * One frame, `ms` after the last one ended; a gap past 100 ms is a pause.
	 * Returns the new level when it changes, otherwise null.
	 */
	frame(ms: number): number | null {
		if (!(ms > 0) || ms > 100) {
			this.slowFor = 0;
			this.fastFor = 0;
			return null;
		}
		if (ms > DOWN_OVER) {
			this.slowFor += ms;
			this.fastFor = 0;
		} else if (ms < UP_UNDER) {
			this.fastFor += ms;
			this.slowFor = 0;
		} else {
			this.slowFor = 0;
			this.fastFor = 0;
		}
		if (this.slowFor >= DOWN_AFTER && this.level > 1) {
			this.ceiling = this.level - 1;
			return this.move(this.level - 1);
		}
		if (this.fastFor >= UP_AFTER && this.level < this.ceiling) return this.move(this.level + 1);
		return null;
	}

	private move(level: number): number {
		this.level = level;
		this.slowFor = 0;
		this.fastFor = 0;
		return level;
	}
}
