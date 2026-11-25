/**
 * The viewport's working parts, outside React: the renderer, the camera, the
 * tool and its handles, picking, and the corner's text and axes. App keeps one
 * for the session, so the camera is where it was when the tab comes back; the
 * `Viewport` component lends it a canvas while the tab is in front.
 */

import { addTo, sameItems } from "../../../../app/placeSelection.js";
import { RELEASES } from "../../../../core/docs/releases.js";
import type { PlaceOutline } from "../../../../core/rbx/browse.js";
import type { RbxInstance } from "../../../../core/rbx/dom.js";
import { isSubclassOf } from "../../../../core/roblox.js";
import { effectTextures } from "../../core/effects.js";
import { type LightingParams, SKY_FACES } from "../../core/lighting.js";
import type { FileMesh } from "../../core/mesh.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/scene.js";
import { addUnions, unionOutline, unionsWaiting } from "../../core/unions.js";
import {
	autoBuildWanted,
	markShadersBuilt,
	noteShaders,
	readShaderRecord,
	reportShaders,
	shadersNew,
} from "../../shaderEvent.js";
import {
	type BenchmarkKind,
	type BenchmarkResult,
	type BenchmarkStationResult,
	benchmarkSettings,
	PIXEL_SCALES,
	type PixelPoint,
} from "../benchmark/result.js";
import type { Station } from "../benchmark/stations.js";
import { type AntialiasMode, antialiasInfo } from "./antialias.js";
import { type AssetGaps, type AssetProgress, AssetTally, assetsPending } from "./assetProgress.js";
import type { AutomaticChoices } from "./automaticLines.js";
import { boxAround } from "./box.js";
import {
	DepthChoice,
	LampChoice,
	type LampMode,
	type LampResolution,
	lampMode,
} from "./depthChoice.js";
import {
	type DragStart,
	dragMove,
	IDENTITY,
	type Mat3,
	moveRow,
	type Rigid,
	STILL,
	type Surface,
	sceneMoved,
	still,
	turnedBy,
} from "./drag.js";
import { DynamicSavings, DynamicScale, savingsCome } from "./dynamicScale.js";
import { FRAME_RUN, FrameHistory, frameInterval } from "./frameGraph.js";
import { rayHit, rayPick } from "./geometry.js";
import { gizmoCell, Lines, lightGizmoLines } from "./gizmos.js";
import { HandleBuilder } from "./handles.js";
import { type Heaviest, heaviest, meshCosts } from "./heaviest.js";
import { loadImages } from "./images.js";
import {
	boxTargets,
	outermostModel,
	partsInRect,
	rectBetween,
	screenPoint,
	stepDown,
	type ViewShot,
} from "./marquee.js";
import { loadMeshes } from "./meshes.js";
import { FrameCap, RefreshMeter, SteadyVsync } from "./pacing.js";
import { type ProbeResult, probeAt } from "./probe.js";
import {
	type LevelRow,
	type MovingRow,
	type ProfileResult,
	type StageFrame,
	spread,
	stageRows,
	stagesTotal,
	steady,
	type Timed,
} from "./profile.js";
import {
	AutoQuality,
	levelPreset,
	presetLevel,
	type QualityLevel,
	qualityLevel,
	startLevel,
	TOP_LEVEL,
	viewQuality,
} from "./quality.js";
import { startingText } from "./readout.js";
import {
	changedFrom,
	FEATURE_GROUPS,
	FEATURES,
	type FeatureKey,
	featureOn,
	isFeatureKey,
	litFor,
	offForGpu,
	onThisDevice,
	RENDER_STEPS,
	type RenderFeatures,
	setOffOnThisDevice,
	upToStep,
} from "./renderFeatures.js";
import { clampSpeed, SPEED_NOTCH } from "./speed.js";
import { beginStart, endStart, logStep, startOpen } from "./startLog.js";
import { layersUsed, loadLayer } from "./textures.js";
import {
	type DragMode,
	dragMode,
	picks,
	showsHandles,
	type Tool,
	toolAfter,
	toolForKey,
} from "./tools.js";
import { trickle } from "./trickle.js";
import { loadUnionModels } from "./unions.js";
import type { UpscaleMode } from "./upscale.js";
import {
	type Camera,
	DEFAULT_RENDER,
	type EffectSteps,
	lightGridCell,
	type MeshGeometry,
	madeGeometry,
	meshGeometry,
	type RenderSettings,
	type RenderStats,
	reflectionGrid,
	splitByMesh,
	stillSkip,
	TEXTURE_STEPS,
	tintedOutline,
	type ViewQuality,
	type ViewRenderer,
	viewFovY,
} from "./view.js";
import { DEFAULT_GIZMOS, type GizmoSettings, gizmosOn, visualGizmoLines } from "./visualGizmos.js";

/** Of `rows`, those that draw a MeshPart's or FileMesh's mesh, or its box: not a mesh made here. */
function meshPartRows(rows: { data: Float32Array; count: number }, place: PlaceScene): number {
	return splitByMesh(rows, (slot) => !!place.meshes?.[slot]?.made).rest.count;
}

/** How the view is drawn, from Settings: which renderer, and the outline's width and depth. */
export interface ViewportOptions {
	/** Automatic, WebGPU where the browser has it; or either by name. */
	renderer: "auto" | "webgpu" | "webgl2";
	/** In CSS pixels. */
	outlineWidth: number;
	/** What is in front of an outline hides it, rather than the outline showing through. */
	hideBehind: boolean;
	/** See-through Glass hides the see-through parts behind it, as it does in Studio. */
	glassHides: boolean;
	/** The place's post effects (ColorCorrection, Blur and the rest) are drawn. */
	postEffects: boolean;
	/** Modify DataModel Instances: the editing tools are offered only with it on. */
	editable: boolean;
	/** The most frames a second while it moves; `vsync` the display's, `unlimited` as fast as it goes. */
	frameRate: number | "vsync" | "unlimited" | "steady";
	/** Alt and a click, or a long press, picks one Model further in each time, rather than the part. */
	altClickSteps: boolean;
	/**
	 * The share of the page's own pixels across and down the place is drawn
	 * at (CSS pixels: a Retina screen has twice as many each way); "native",
	 * every pixel the screen has; Automatic, the quality level's.
	 */
	renderScale?: number | "native" | "dynamic";
	/** Savings taken at any level while frames do not fit: see DynamicSavings. */
	dynamicOptimization?: boolean;
	/** Light objects' resolution: measured in use, or as set. See depthChoice.ts's lampMode. */
	lampResolution?: LampResolution;
	/** Light objects from a grid round the camera, its finest cell: see view.ts's lightGridCell. */
	lightGrid?: "auto" | "off" | "4" | "8" | "16" | "32";
	/** Neon's glow and BloomEffect: the quality level's, or as set. See viewQualityFor. */
	bloomResolution?: "auto" | "full" | "half" | "quarter";
	/** The sun's shadow maps, texels a side, or the quality level's. */
	shadowMapSize?: "auto" | number;
	/** The material textures, one or two mip levels smaller. See setTextureDetail. */
	textureResolution?: "full" | "half" | "quarter";
	/** The sky's share at fewer pixels, in the lights' half-size pass: see skyModeNow. */
	skyResolution?: "full" | "half" | "quarter";
	/** Scene reflections following the camera, or kept on a grid: see view.ts's reflectionGrid. */
	reflectionUpdates?: "auto" | "follow" | "32" | "64" | "128";
	/** Effects' frames with the camera still, every display frame or fewer: see view.ts's stillSkip. */
	stillFrames?: "auto" | "full" | "half" | "third" | "quarter";
	/** Beams and particles at half size: see WebGpuView.drawHalfEffects. */
	particleResolution?: "full" | "half";
	/**
	 * Upscaling: the place drawn at the render scale and brought up to the
	 * screen's own pixels by the renderer, still frames gathered to its
	 * detail (see upscale.ts); off or unset, the browser stretches it.
	 */
	upscale?: UpscaleMode;
	/**
	 * Builds the shaders for every quality level after an update changed
	 * them, as Settings' "Build after an update" says: false for a view of
	 * its own, as the benchmark's, which must not build while it measures.
	 */
	buildShaders?: boolean;
	/** Antialiasing: see antialias.ts; unset, the quality level's. Changing it builds the view again. */
	antialias?: AntialiasMode;
	/** WebGPU's shader in half precision where the device can: see webgpu.ts's HALF. Unset, yes. */
	half?: boolean;
	/** Settings' Quality: a level, 1 to 21, or Automatic. Unset, Level 21. */
	quality?: number | "auto";
}

/**
 * What a click on a part reaches: the highest Model in Workspace that holds
 * it, one step further in than what is picked, or the part itself.
 */
type Reach = "top" | "down" | "part";

/** How far a press moves, in CSS pixels, before it is a drag rather than a click. */
const DRAG = 6;

/** The selection's blue, which the pivot's mark is ringed in where a press would drag by it. */
const PIVOT_BLUE = "#0d99ff";
/** How near the pivot's mark a press takes hold of the pivot rather than the part, in CSS pixels. */
const PIVOT_GRIP = 10;

/** The outline round what is picked, and the fainter one round what the pointer is over. */
const PICKED_ALPHA = 255;
const HOVER_ALPHA = 105;

import { WebGl2View } from "./webgl2.js";
import { shaderFingerprint, WebGpuView } from "./webgpu.js";

export { TOOLS, type Tool } from "./tools.js";

/** What the bar and Properties show, for React. */
export interface ViewportState {
	/** Null with Select put down: the camera alone. */
	tool: Tool | null;
	speed: number;
	backend: "WebGPU" | "WebGL2" | null;
	/** WebGPU was asked for and was not there. */
	fellBack: boolean;
	/** Why nothing is drawn, when nothing can be. */
	error: string | null;
	/** The place as drawn: parts by shape, and what lights it. */
	summary: {
		parts: number;
		meshes: number;
		/** Of `meshes`, those drawn as their mesh rather than their box. */
		meshesDrawn: number;
		/** Seen through: Transparency above 0, or ForceField. */
		translucent: number;
		transparent: number;
		notes: [string, string][];
	} | null;
	/** The steps a drag of the handles keeps to, in studs and degrees, each on or off. */
	snap: Snap;
	/** Something is picked, for the bar's Clear. */
	picked: boolean;
	/** Edit Pivot: the handles stand at the pivot of what is picked, square to it. */
	pivotEdit: boolean;
	/** The handles' axes: what is picked's own, or the world's. Ctrl+L, as in Studio. */
	space: "object" | "world";
	/** Modify DataModel Instances is on: the editing tools are offered. */
	editable: boolean;
	/** The Rendering panel's mode and switches: the view's alone, for this session. */
	render: RenderSettings;
	/** The quality level drawn at, and whether Automatic chose it. */
	quality: { level: number; auto: boolean };
	/** The antialiasing modes the view can draw: see antialias.ts. */
	antialiasModes: AntialiasMode[];
	/** A profile running: what it is measuring, and how far along. See `runProfile`. */
	profiling: { phase: string; done: number; of: number } | null;
	/** The last profile finished, for the Performance panel. */
	profile: ProfileResult | null;
	/** Which gizmos are drawn over the view: see `visualGizmos.ts`. The view's alone, for this session. */
	gizmos: GizmoSettings;
	/** The meshes costing the most triangles, and drawn most often: null until meshes are drawn. */
	heaviest: Heaviest | null;
	/** The place's assets: needed, arrived, on the GPU, and not coming. Null while it needs none. */
	assets: AssetProgress | null;
	/**
	 * The pixel probe: while armed, a tap on the view probes the spot rather
	 * than picking, and what it found stays until the next tap or it is put away.
	 */
	probe: { armed: boolean; result: ProbeReport | null };
}

/** What the probe found, with the part's name and class as the tree shows them. */
export type ProbeReport = ProbeResult & { name: string; className: string };

export interface Snap {
	move: number;
	moveOn: boolean;
	rotate: number;
	rotateOn: boolean;
}

export type Stick = "move" | "look";

/** Where a benchmark run is, for its overlay. */
export interface BenchmarkProgress {
	level: string;
	/** "6 Lights · 50 lights". */
	station: string;
	phase: string;
	done: number;
	of: number;
	/** The last station's still frame, waited for. */
	frameMs: number;
}

/** `stamp` is the version of the place it was read from, which a drag's change names. */
export type ViewportPlace = PlaceScene & {
	lighting: LightingParams;
	outline: PlaceOutline;
	stamp?: string;
	/**
	 * Meshes and images the place carries itself, by asset id: a benchmark's
	 * own (see `benchmarkAsset`), never downloaded. Into the caches as the
	 * place is set, so they are drawn as though they had already arrived.
	 */
	provided?: {
		meshes?: ReadonlyMap<string, FileMesh>;
		images?: ReadonlyMap<string, ImageBitmap>;
	};
};

/** A drag let go: what moved, by what rigid move of the world, for App to write into the place. */
export interface PlaceMove {
	stamp: string;
	items: number[];
	by: { position: number[]; rotation: number[] };
	/** For the undo notice: Drag Crate, Drag 3 items. */
	label: string;
}

/** What a press on a part or on the pivot would drag, once it moves far enough. */
interface Grip {
	items: number[];
	grab: number[];
	byPivot: boolean;
}

/** A drag under way: what it started from, and the move it makes now. */
interface Dragging {
	items: number[];
	/** Every row that moves: the items and what is in them. */
	ids: Set<number>;
	start: DragStart;
	turn: Mat3;
	move: Rigid;
	/** The pointer's last place, in client pixels, for R and T to set it down again. */
	at: { x: number; y: number };
	/** As it all was, to draw again from and to put back. */
	base: {
		place: ViewportPlace;
		words: Map<number, Float32Array>;
		pivots: Map<number, number[]>;
	};
}

/** Studs a second at 1×: a walk across M103's tank in about half a second. */
const BASE_SPEED = 24;
/** How long a touch holds still before it picks as Alt and a click do. */
const LONG_PRESS = 500;
/** How fast the look stick turns the camera at its rim, in the right-drag's pixels a second. */
const LOOK_RATE = 320;
const MOVES: Record<string, number[]> = {
	KeyW: [0, 0, 1],
	KeyS: [0, 0, -1],
	KeyA: [-1, 0, 0],
	KeyD: [1, 0, 0],
	KeyE: [0, 1, 0],
	KeyQ: [0, -1, 0],
};
const AXES: [number[], number[]][] = [
	[
		[1, 0, 0],
		[1, 0.32, 0.32],
	],
	[
		[0, 1, 0],
		[0.35, 0.9, 0.35],
	],
	[
		[0, 0, 1],
		[0.3, 0.55, 1],
	],
];
const GIZMO = 104;
const GIZMO_AXES = [
	{ name: "X", dir: [1, 0, 0], col: "#ff5c5c", dark: "#8a3434" },
	{ name: "Y", dir: [0, 1, 0], col: "#6fdc5a", dark: "#3f7a35" },
	{ name: "Z", dir: [0, 0, 1], col: "#5a8dff", dark: "#34508f" },
];
/** What waits on `asap`, and the one channel it is told by. */
const waiting: ((now: number) => void)[] = [];
let channel: MessageChannel | null = null;

/**
 * Runs `run` as soon as the browser has a moment, not at the next frame: what
 * an Unlimited frame rate draws by. A message rather than a timeout, which the
 * browser holds to 4ms apart.
 */
function asap(run: (now: number) => void): void {
	if (!channel) {
		channel = new MessageChannel();
		channel.port1.onmessage = () => {
			const now = performance.now();
			for (const each of waiting.splice(0)) each(now);
		};
	}
	waiting.push(run);
	if (waiting.length === 1) channel.port2.postMessage(null);
}

/** The world's axes. */
const WORLD = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];

/** `v` at length 1, or the world's axis `j` where `v` has no length: a part flat on that side. */
function unit(v: number[], j: number): number[] {
	const n = Math.hypot(v[0], v[1], v[2]);
	return n > 1e-9 ? v.map((x) => x / n) : WORLD[j];
}

/** Where the camera stands to look along an axis: on that axis's side, looking back to the centre. */
const ALONG: Record<string, [number, number]> = {
	"+X": [Math.PI / 2, 0],
	"-X": [-Math.PI / 2, 0],
	"+Y": [0, Math.PI / 2 - 0.001],
	"-Y": [0, -Math.PI / 2 + 0.001],
	"+Z": [0, 0],
	"-Z": [Math.PI, 0],
};
const PITCH = Math.PI / 2 - 0.001;
const clampPitch = (p: number) => Math.max(-PITCH, Math.min(PITCH, p));

/** Turns `v` round the unit axis `k` by `angle`, Rodrigues' way. */
function turn(v: number[], k: number[], angle: number): number[] {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
	const x = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
	return [0, 1, 2].map((a) => v[a] * c + x[a] * s + k[a] * d * (1 - c));
}

export interface ViewportElements {
	holder: HTMLElement;
}

/** The axes and the readout over them, which stand on the bar rather than in the view. */
export interface CornerElements {
	gizmo: HTMLElement;
	rotation: HTMLElement;
	/** Where the camera is, under its rotation. */
	position?: HTMLElement;
	rate: HTMLElement;
}

/**
 * An image as a renderer takes it: loadImages already decodes its colours as
 * they are, not multiplied by their alpha, which WebGL2 takes as it is. (It
 * once needed a copy made here, a long task on the page's thread for a large
 * sky face.) WebGPU gets a copy in the browser's own form: Chromium's
 * copyExternalImageToTexture multiplies a grey-and-alpha PNG decoded that way
 * by its alpha though told not to, so a Beam's scan lines (white, alpha 0.1 to
 * 0.4) came out at a third of their light. From the browser's own form the
 * copy is right for every PNG.
 */
function forView(view: ViewRenderer, image: ImageBitmap): Promise<ImageBitmap> {
	if (view.backend !== "WebGPU") return Promise.resolve(image);
	return createImageBitmap(image, { premultiplyAlpha: "default" }).catch(() => image);
}

export class ViewportController {
	private state: ViewportState = {
		tool: "select",
		speed: 1,
		backend: null,
		fellBack: false,
		error: null,
		summary: null,
		snap: { move: 0.5, moveOn: true, rotate: 5, rotateOn: true },
		picked: false,
		pivotEdit: false,
		space: "object",
		editable: false,
		render: DEFAULT_RENDER,
		quality: { level: TOP_LEVEL, auto: false },
		antialiasModes: ["off", "fxaa", "smaa", "msaa4", "taa"],
		profiling: null,
		profile: null,
		gizmos: DEFAULT_GIZMOS,
		heaviest: null,
		assets: null,
		probe: { armed: false, result: null },
	};
	private listeners = new Set<() => void>();
	private place: ViewportPlace | null = null;
	/** The place as the host last gave it, before unions or a drag changed the copy drawn. */
	private host: ViewportPlace | null = null;
	/** Each drawn part's 14 words, by its row in the DataModel browser. */
	private words = new Map<number, Float32Array>();
	private kids: number[][] = [];
	/** Pivots from the scene: see `PlaceScene.pivots`. */
	private pivots: Record<number, number[]> = {};
	private workspace = -1;
	/** What is picked, by row, the last picked last: the browser's selection too. */
	private selection: readonly number[] = [];
	private cam = { target: [0, 0, 0], yaw: 0.8, pitch: 0.42, dist: 60 };
	private framed = false;
	private view: ViewRenderer | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private els: ViewportElements | null = null;
	private corner: CornerElements | null = null;
	private mounted = 0;
	private pending = false;
	private holding = 0;
	private looping = false;
	private frames: number[] = [];
	private held = new Set<string>();
	/** The touch sticks, each -1 to 1 across and down, and the up and down buttons. */
	private sticks: Record<Stick, [number, number]> = { move: [0, 0], look: [0, 0] };
	private rise = 0;
	private flying = false;
	private turning = 0;

	/** `onPick` hears each pick made in the view: everything picked, the last picked last. */
	constructor(private readonly onPick: (indices: readonly number[]) => void) {
		// Effects stop drawing while the tab is hidden: see `redraw`.
		if (typeof document !== "undefined")
			document.addEventListener("visibilitychange", () => {
				if (!document.hidden) this.redraw();
			});
	}

	// -- for React ---------------------------------------------------------------

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getState = (): ViewportState => this.state;

	private set(patch: Partial<ViewportState>): void {
		this.state = { ...this.state, ...patch };
		for (const l of this.listeners) l();
	}

	// -- the place ---------------------------------------------------------------

	/** The place to draw, from the host: again after the file changes. */
	setPlace(place: ViewportPlace): void {
		for (const [asset, mesh] of place.provided?.meshes ?? [])
			this.meshCache.set(asset, Promise.resolve(mesh));
		for (const [asset, image] of place.provided?.images ?? [])
			this.images.set(asset, Promise.resolve(image));
		// A drag under way was of the place as it was: what is read now stands.
		this.drag = null;
		// Another place: Automatic's depth path and light resolution are measured for it afresh.
		this.depth.reset();
		this.lamps.reset();
		// The start log: another place into the view there is, or the view's own start.
		beginStart(this.view ? "Place opened" : "View starting", `${partCount(place)} parts`);
		if (this.state.probe.result) this.set({ probe: { ...this.state.probe, result: null } });
		this.pipelinesLogged = 0;
		this.place = place;
		this.host = place;
		this.adopt(place);
		if (this.view) {
			this.tally.begin();
			this.view.setScene(place);
			this.loadLooks(this.view, place);
			this.loadImages(this.view, place);
			this.view.setLighting(litFor(place.lighting, this.state.render.features));
			this.loadSky(this.view, place.lighting);
			this.loadSunImage(this.view, place.lighting);
			this.loadMeshes(this.view, place);
			this.loadUnions(this.view, place);
			this.view.setOverlay(this.overlayLines());
			this.refreshSelection();
			logStep("Scene given to the view");
			this.firstFrameLog = true;
		} else void this.start();
		if (!this.framed) {
			this.framed = true;
			this.fitAll();
		}
	}

	/**
	 * The place again after an edit, drawn where it stands: the camera, the
	 * pick and what has been downloaded stay, the view's rows are replaced
	 * once, and the meshes are given again only when the place names others.
	 * A drag under way carries on from it.
	 */
	updatePlace(place: ViewportPlace): void {
		const was = this.host;
		const view = this.view;
		if (!view || !was) {
			this.setPlace(place);
			return;
		}
		const drag = this.drag;
		this.place = place;
		this.host = place;
		this.adopt(place);
		view.setScene(place);
		this.loadLooks(view, place);
		this.loadImages(view, place);
		view.setLighting(litFor(place.lighting, this.state.render.features));
		this.loadSky(view, place.lighting);
		this.loadSunImage(view, place.lighting);
		if (JSON.stringify(place.meshes ?? []) !== JSON.stringify(was.meshes ?? []))
			this.loadMeshes(view, place);
		this.loadUnions(view, place);
		view.setOverlay(this.overlayLines());
		if (drag) {
			// From the place as it now is: what the drag holds, where it now stands.
			const words = new Map<number, Float32Array>();
			const pivots = new Map<number, number[]>();
			for (const id of drag.ids) {
				const w = this.words.get(id);
				if (w) words.set(id, w);
				const p = this.pivots[id];
				if (p) pivots.set(id, p);
			}
			drag.base = { place: this.place, words, pivots };
			this.showDrag();
		}
		this.refreshSelection();
	}

	/** What the controller keeps of a place for picking, boxes and the summary. */
	private adopt(place: ViewportPlace): void {
		this.words.clear();
		for (const set of [place.kinds, place.translucent])
			for (const k of SCENE_KINDS) {
				const { data, count } = set[k];
				const u = new Uint32Array(data.buffer, data.byteOffset, data.length);
				for (let i = 0; i < count; i++)
					this.words.set(
						u[i * SCENE_STRIDE + 13],
						data.slice(i * SCENE_STRIDE, (i + 1) * SCENE_STRIDE),
					);
			}
		this.pivots = place.pivots ?? {};
		const { nodes, classes } = place.outline;
		this.kids = nodes.map(() => []);
		this.workspace = -1;
		nodes.forEach(([cls, , parent], i) => {
			if (parent >= 0) this.kids[parent].push(i);
			else if (classes[cls] === "Workspace") this.workspace = i;
		});
		this.selection = this.selection.filter((i) => i < nodes.length);
		this.set({
			picked: this.selection.length > 0,
			summary: {
				parts: this.words.size,
				meshes: meshPartRows(place.kinds.mesh, place) + meshPartRows(place.translucent.mesh, place),
				meshesDrawn: 0,
				translucent: SCENE_KINDS.reduce((n, k) => n + place.translucent[k].count, 0),
				transparent: place.transparent,
				notes: place.lighting.notes,
			},
		});
	}

	/** What is picked elsewhere -- the tree, or Properties -- to outline, each on its own. Leaves the camera be. */
	select(indices: readonly number[]): void {
		if (sameItems(indices, this.selection)) return;
		this.selection = [...indices];
		if (this.state.picked !== indices.length > 0) this.set({ picked: indices.length > 0 });
		if (this.state.gizmos.picked) this.view?.setOverlay(this.overlayLines());
		this.refreshSelection();
	}

	/** Picks nothing: the bar's Clear, and Esc. */
	clear(): void {
		if (this.selection.length === 0) return;
		this.select([]);
		this.onPick([]);
	}

	/** What a pick in the view picks, told to the browser. */
	private pickHere(indices: readonly number[]): void {
		this.select(indices);
		this.onPick(this.selection);
	}

	private refreshSelection(): void {
		this.view?.setSelection(this.outlines());
		this.drawHandles();
		this.redraw();
	}

	/** Each thing picked, solid, and what the pointer is over, faint, each in the selection's blue. */
	private outlines(): Float32Array {
		const boxes: Float32Array[] = [];
		const add = (index: number | null, alpha: number) => {
			if (index === null) return;
			const box = this.boxFor(index);
			if (box.length < SCENE_STRIDE) return;
			boxes.push(tintedOutline(box, alpha));
		};
		for (const index of this.selection) add(index, PICKED_ALPHA);
		if (this.hover !== null && !this.selection.includes(this.hover)) add(this.hover, HOVER_ALPHA);
		const out = new Float32Array(boxes.length * SCENE_STRIDE);
		boxes.forEach((b, i) => {
			out.set(b, i * SCENE_STRIDE);
		});
		return out;
	}

	/** The instance the pointer is over, outlined faintly; null for none. */
	private hover: number | null = null;
	private setHover(index: number | null): void {
		if (index === this.hover) return;
		this.hover = index;
		this.refreshSelection();
	}

	private options: ViewportOptions = {
		renderer: "auto",
		outlineWidth: 3.5,
		hideBehind: false,
		glassHides: true,
		postEffects: true,
		editable: false,
		frameRate: "vsync",
		altClickSteps: false,
	};

	/** Settings' say in how the view is drawn: a new renderer starts the view again. */
	renderSettings(): RenderSettings {
		return this.state.render;
	}

	setRender(render: RenderSettings): void {
		const was = this.state.render;
		this.set({ render });
		if (render.features !== was.features && this.place)
			this.view?.setLighting(litFor(this.place.lighting, render.features));
		this.view?.setRender(this.withSavings(render));
		this.applyLampMode();
		if (render.lightRanges !== was.lightRanges) this.view?.setOverlay(this.overlayLines());
		this.redraw();
	}

	/** Which gizmos are drawn over the view: see `visualGizmos.ts`. */
	gizmoSettings(): GizmoSettings {
		return this.state.gizmos;
	}

	setGizmos(gizmos: GizmoSettings): void {
		this.set({ gizmos });
		this.view?.setOverlay(this.overlayLines());
		this.redraw();
	}

	/** What the last frame cost, for the Performance panel; null with no view. */
	renderStats(): RenderStats | null {
		return this.view?.stats() ?? null;
	}

	setOptions(options: ViewportOptions): void {
		const was = this.options;
		this.options = options;
		if (options.editable !== this.state.editable) {
			// Editing off takes the editing tools away: back to Select, the handles
			// off the pivot, as they would be in a place opened read-only. No tool
			// stays no tool.
			this.set(
				options.editable
					? { editable: true }
					: {
							editable: false,
							tool: this.state.tool === null ? null : "select",
							pivotEdit: false,
						},
			);
			this.drawHandles();
			this.redraw();
		}
		if ((options.quality ?? TOP_LEVEL) !== this.qualitySetting) {
			this.chooseQuality(options.quality ?? TOP_LEVEL);
			return;
		}
		if (!this.view) return;
		// Antialiasing switches in place where the samples a pixel stay; only
		// another renderer, or another sample count, builds the view again.
		const aa = this.antialiasMode();
		if (
			was.renderer !== options.renderer ||
			(this.view.antialias !== aa && !this.view.setAntialias(aa))
		) {
			void this.restartView();
			return;
		}
		this.view.setOutline(options.outlineWidth, options.hideBehind);
		this.view.setGlassHides(options.glassHides);
		this.view.setPostEffects(options.postEffects);
		if (was.renderScale !== options.renderScale) this.dynamic.reset();
		if (was.dynamicOptimization !== options.dynamicOptimization) {
			this.savings.reset();
			this.applySavings();
		}
		if (was.lampResolution !== options.lampResolution) this.lamps.reset();
		this.applyLampMode();
		// Bloom, the shadow maps and the textures, each changed in place.
		this.view.setQuality(this.viewQualityFor(this.level(), this.pixelRatio()));
		this.view.setShadowMap(this.shadowMapFor(this.level()));
		this.view.setTextureDetail(TEXTURE_STEPS[options.textureResolution ?? "full"]);
		if (was.renderScale !== options.renderScale || was.upscale !== options.upscale) this.fit();
		this.redraw();
	}

	/** The material textures, fetched once each and kept for the session, by layer. */
	private looks = new Map<number, Promise<HTMLCanvasElement[]>>();

	/**
	 * The textures the place's materials use, into the view as each arrives;
	 * until then a material is drawn in its own pattern.
	 */
	private loadLooks(view: ViewRenderer, place: PlaceScene): void {
		const used = layersUsed(place);
		// The view's array holds the place's materials alone; made again, it is empty.
		if (view.setLookLayers?.(used)) {
			const had = this.given.get(view);
			if (had) for (const key of [...had.keys()]) if (key.startsWith("look:")) had.delete(key);
		}
		for (const layer of used) {
			const key = `look:${layer}`;
			let levels = this.looks.get(layer);
			this.tally.want(key, !levels);
			if (!levels) {
				levels = loadLayer(layer);
				this.looks.set(layer, levels);
				// A failed fetch is tried again by the next place or tab.
				levels.catch(() => this.looks.delete(layer));
			}
			levels.then(
				(ready) => {
					this.tally.arrive(key);
					this.upload(
						view,
						key,
						ready,
						async () => {
							// WebGL2 reads a canvas back from the GPU as it uploads it, waiting on
							// whatever the GPU is doing; a bitmap made first is only copied.
							if (view.backend !== "WebGL2") {
								if (this.view === view) view.setLook(layer, ready);
								return;
							}
							const bitmaps = await Promise.all(
								ready.map((level) => createImageBitmap(level, { premultiplyAlpha: "none" })),
							);
							if (this.view === view) view.setLook(layer, bitmaps);
							for (const bitmap of bitmaps) bitmap.close();
						},
						[key],
					);
				},
				() => this.tally.fail(key),
			);
		}
	}

	/** Textures go to the GPU a few a frame: see `trickle`. */
	private uploads = trickle();
	/** What each view has been given, by what it is, so a place sent again is not uploaded again. */
	private given = new WeakMap<ViewRenderer, Map<string, unknown>>();

	/** Whether `view` has been given `value` as `what`, and nothing since. */
	private gave(view: ViewRenderer, what: string, value: unknown): boolean {
		const had = this.given.get(view);
		return had !== undefined && had.has(what) && had.get(what) === value;
	}

	/**
	 * Gives `view` `value` as `what` through `set`, in its turn among the
	 * uploads, unless the view is gone or already has that value. `keys` are
	 * the assets it carries, counted in once it is in.
	 */
	private upload(
		view: ViewRenderer,
		what: string,
		value: unknown,
		set: () => unknown,
		keys: readonly string[] = [],
	): void {
		const done = () => {
			for (const key of keys) this.tally.give(key);
		};
		if (this.gave(view, what, value)) return done();
		this.uploads.add(async () => {
			if (this.view !== view) return;
			if (this.gave(view, what, value)) return done();
			try {
				await set();
			} catch (err) {
				for (const key of keys) this.tally.fail(key);
				throw err;
			}
			if (this.view !== view) return;
			let had = this.given.get(view);
			if (!had) this.given.set(view, (had = new Map()));
			had.set(what, value);
			done();
			this.redraw();
		});
	}

	/** The place's assets, counted for the progress card: see `assetProgress.ts`. */
	private tally = new AssetTally(() => this.tallied());
	private tallying = false;

	/** The count into the state a tenth of a second after it changes, however often it did. */
	private tallied(): void {
		if (this.tallying) return;
		this.tallying = true;
		setTimeout(() => {
			this.tallying = false;
			const assets = this.tally.progress;
			this.set({ assets: assets.needed > 0 ? assets : null });
		}, 100);
	}

	private images = new Map<string, Promise<ImageBitmap | null>>();

	/**
	 * The images the place's Decals and Textures show, into the view as each
	 * arrives, where Sign in with Roblox has them. Kept for the session, so a
	 * tab or renderer change does not ask again.
	 */
	private loadImages(view: ViewRenderer, place: PlaceScene): void {
		const wanted = [
			...new Set([
				...(place.images ?? []).map((image) => image.asset),
				...effectTextures(place.effects),
			]),
		];
		const fresh = wanted.filter((asset) => !this.images.has(asset));
		const settled = new Map<string, (image: ImageBitmap | null) => void>();
		for (const asset of wanted) this.tally.want(`image:${asset}`, !this.images.has(asset));
		for (const asset of fresh) {
			this.images.set(asset, new Promise((resolve) => settled.set(asset, resolve)));
		}
		if (fresh.length > 0) {
			void loadImages(fresh, (asset, image) => settled.get(asset)?.(image))
				.then((why) => {
					if (why) for (const asset of fresh) this.tally.notAsked(`image:${asset}`, why);
				})
				.catch(() => {})
				.finally(() => {
					// What did not arrive is asked for again next time.
					for (const [asset, resolve] of settled) {
						resolve(null);
						void this.images.get(asset)?.then((image) => {
							if (!image) this.images.delete(asset);
						});
					}
				});
		}
		for (const asset of wanted) {
			const key = `image:${asset}`;
			void this.images.get(asset)?.then((image) => {
				if (image) this.tally.arrive(key);
				else this.tally.fail(key);
				if (!image || this.view !== view) return;
				this.upload(
					view,
					key,
					image,
					async () => {
						const ready = await forView(view, image);
						if (this.view === view) view.setImage(asset, ready);
					},
					[key],
				);
			});
		}
	}

	/** A Sky's six images, kept for the session by the ids they were asked for under. */
	private sky: { key: string; faces: Promise<ImageBitmap[] | null> } | null = null;

	/**
	 * A Sky's six images into the view once Sign in with Roblox has them all,
	 * at one size; until then, and without a Sky, the sky made here.
	 */
	private loadSky(view: ViewRenderer, lighting: LightingParams): void {
		const box = lighting.skybox;
		if (!box) {
			this.sky = null;
			this.upload(view, "sky", null, () => view.setSky(null));
			return;
		}
		const ids = SKY_FACES.map((face) => box[face]);
		const key = ids.join(",");
		const keys = [...new Set(ids)].map((id) => `sky:${id}`);
		for (const k of keys) this.tally.want(k, this.sky?.key !== key);
		if (this.sky?.key !== key) {
			const got = new Map<string, ImageBitmap>();
			const faces = loadImages(ids, (asset, image) => got.set(asset, image))
				.then(async (why) => {
					if (why) for (const k of keys) this.tally.notAsked(k, why);
					const each = ids.map((id) => got.get(id));
					if (each.some((face) => !face)) return null;
					const first = each[0] as ImageBitmap;
					const size = Math.min(2048, Math.max(first.width, first.height));
					return Promise.all(
						(each as ImageBitmap[]).map((face) =>
							face.width === size && face.height === size
								? face
								: createImageBitmap(face, {
										resizeWidth: size,
										resizeHeight: size,
										premultiplyAlpha: "none",
									}),
						),
					);
				})
				.catch(() => null);
			this.sky = { key, faces };
			// What did not arrive is asked for again next time.
			void faces.then((held) => {
				if (!held && this.sky?.key === key) this.sky = null;
			});
		}
		void this.sky.faces.then((faces) => {
			// A Sky is drawn whole or not at all: one face missing, and none are in.
			for (const k of keys) {
				if (faces) this.tally.arrive(k);
				else this.tally.fail(k);
			}
			if (!faces || this.view !== view) return;
			if (this.gave(view, "sky", faces)) {
				for (const k of keys) this.tally.give(k);
				return;
			}
			// Each face readied in a turn of its own, then all six into the view at once.
			const ready: ImageBitmap[] = [];
			faces.forEach((face, i) => {
				this.uploads.add(async () => {
					if (this.view === view) ready[i] = await forView(view, face);
				});
			});
			this.upload(
				view,
				"sky",
				faces,
				() => {
					if (ready.filter(Boolean).length === faces.length) view.setSky(ready);
				},
				keys,
			);
		});
	}

	/** Each call of `loadMeshes`, counted: only the last one's meshes go into the view. */
	private meshLoads = 0;

	/** Meshes read, kept for the session by asset id; null for one that did not arrive or read. */
	private meshCache = new Map<string, Promise<FileMesh | null>>();

	/** The meshes read so far, by asset id, for handing the view what is here before the rest download. */
	private meshesRead = new Map<string, FileMesh>();

	/**
	 * The meshes a place's MeshParts and FileMeshes name, into the view once
	 * Sign in with Roblox has them, each made for the rows that draw it. The
	 * view is given them all at once: each time rebuilds its buffers.
	 */
	private loadMeshes(view: ViewRenderer, place: PlaceScene): void {
		const load = ++this.meshLoads;
		const uses = place.meshes ?? [];
		if (uses.length === 0) {
			view.setMeshes(new Map());
			this.rankMeshes(place, new Map());
			return;
		}
		const asked = [...new Set(uses.filter((use) => !use.made).map((use) => use.asset))];
		const fresh = asked.filter((a) => !this.meshCache.has(a));
		for (const asset of asked) this.tally.want(`mesh:${asset}`, !this.meshCache.has(asset));
		const settled = new Map<string, (mesh: FileMesh | null) => void>();
		for (const asset of fresh)
			this.meshCache.set(asset, new Promise((resolve) => settled.set(asset, resolve)));
		for (const asset of asked)
			void this.meshCache.get(asset)?.then((mesh) => {
				if (mesh) this.tally.arrive(`mesh:${asset}`);
				else this.tally.fail(`mesh:${asset}`);
			});
		if (fresh.length > 0) {
			void loadMeshes(
				fresh,
				(asset, mesh) => {
					this.meshesRead.set(asset, mesh);
					settled.get(asset)?.(mesh);
				},
				// The kept meshes into the view now, not once every download is done.
				() => give(uses.map((use) => (use.made ? null : (this.meshesRead.get(use.asset) ?? null)))),
			)
				.then((why) => {
					if (why) for (const asset of fresh) this.tally.notAsked(`mesh:${asset}`, why);
				})
				.catch(() => {})
				.finally(() => {
					// What did not arrive is asked for again next time.
					for (const [asset, resolve] of settled) {
						resolve(null);
						void this.meshCache.get(asset)?.then((mesh) => {
							if (!mesh) this.meshCache.delete(asset);
						});
					}
				});
		}
		// A mesh made here (a union's parts as one surface) is here already: into
		// the view now, so it is not drawn as its box while the rest download.
		const here = new Map<number, MeshGeometry>();
		uses.forEach((use, slot) => {
			if (use.made) here.set(slot, madeGeometry(use.made));
		});
		const give = (meshes: readonly (FileMesh | null | false | undefined)[]) =>
			this.giveMeshes(view, place, load, here, meshes);
		if (here.size > 0) view.setMeshes(here);
		this.rankMeshes(place, here);
		const reading = uses.map((use) => !use.made && this.meshCache.get(use.asset));
		void Promise.all(reading).then(give);
	}

	/** Hands the view every mesh in `meshes` (by slot) and the made ones: once kept ones are read, and when all have settled. */
	private giveMeshes(
		view: ViewRenderer,
		place: PlaceScene,
		load: number,
		here: Map<number, MeshGeometry>,
		meshes: readonly (FileMesh | null | false | undefined)[],
	): void {
		const uses = place.meshes ?? [];
		// A later load stands: a drag or an edit since leaves this one's meshes to draw.
		if (this.view !== view || this.meshLoads !== load) return;
		const made = new Map(here);
		meshes.forEach((mesh, slot) => {
			if (mesh) made.set(slot, meshGeometry(mesh, uses[slot]));
		});
		// Nothing downloaded: the view has all there is.
		if (made.size === here.size) return;
		view.setMeshes(made);
		for (const slot of made.keys())
			if (!uses[slot].made) this.tally.give(`mesh:${uses[slot].asset}`);
		this.rankMeshes(place, made);
		const read = (slot: number) => made.has(slot) && !uses[slot].made;
		const drawn = (rows: { data: Float32Array; count: number }) =>
			[...splitByMesh(rows, read).meshes.values()].reduce((n, r) => n + r.count, 0);
		const summary = this.state.summary;
		if (summary)
			this.set({
				summary: {
					...summary,
					meshesDrawn: drawn(place.kinds.mesh) + drawn(place.translucent.mesh),
				},
			});
		this.redraw();
	}

	/** The Mesh Debug panel's lists, from the meshes the view has been given: see `heaviest.ts`. */
	private rankMeshes(place: PlaceScene, meshes: ReadonlyMap<number, MeshGeometry>): void {
		const uses = place.meshes ?? [];
		const costs = meshCosts(
			[place.kinds.mesh, place.translucent.mesh],
			(slot) => {
				const mesh = meshes.get(slot);
				return mesh && mesh.indices.length / 3;
			},
			(slot) => (uses[slot]?.made ? `made:${slot}` : (uses[slot]?.asset ?? `slot:${slot}`)),
		);
		this.set({ heaviest: costs.length > 0 ? heaviest(costs) : null });
	}

	/** Rows from the Mesh Debug panel: picked, as a click in the view picks, and framed. */
	pickRows(rows: readonly number[]): void {
		this.pickHere(rows);
		this.frameSelection();
	}

	/** A DataModel row's name and class, as the tree shows them; empty for none. */
	rowName(row: number): { name: string; className: string } {
		const outline = this.place?.outline;
		const node = outline?.nodes[row];
		return node
			? { name: node[1], className: outline.classes[node[0]] ?? "" }
			: { name: "", className: "" };
	}

	/** Unions' ChildData, kept for the session by the SolidModel asset that held it. */
	private unionModels = new Map<string, readonly RbxInstance[]>();

	/**
	 * The place's unions: each outlined by its own box, and drawn as the parts
	 * it was made from once Sign in with Roblox has its SolidModel asset. The
	 * scene with them added stands in for the host's, so picking and the
	 * meshes their parts draw follow it.
	 */
	private loadUnions(view: ViewRenderer, place: ViewportPlace): void {
		const uses = place.unions ?? [];
		if (uses.length === 0) return;
		for (const use of uses) this.words.set(use.id, unionOutline(use));
		const waiting = unionsWaiting(place);
		const fresh = waiting.filter((asset) => !this.unionModels.has(asset));
		for (const asset of waiting) this.tally.want(`union:${asset}`, !this.unionModels.has(asset));
		const arrived =
			fresh.length > 0
				? loadUnionModels(fresh, (asset, roots) => this.unionModels.set(asset, roots))
						.then((why) => {
							if (why) for (const asset of fresh) this.tally.notAsked(`union:${asset}`, why);
						})
						.catch(() => {})
				: Promise.resolve();
		void arrived.then(() => {
			for (const asset of waiting) {
				if (this.unionModels.has(asset)) this.tally.arrive(`union:${asset}`);
				else this.tally.fail(`union:${asset}`);
			}
			// A newer place, or a drag under way, which a union drawn now would undo.
			if (this.view !== view || this.host !== place || this.drag) return;
			const drawn = addUnions(place, this.unionModels);
			for (const asset of waiting)
				if (this.unionModels.has(asset)) this.tally.give(`union:${asset}`);
			if (drawn === place) return;
			this.place = drawn;
			view.setScene(drawn);
			this.loadLooks(view, drawn);
			this.loadMeshes(view, drawn);
			this.redraw();
		});
	}

	/** A Sky's own sun image, kept for the session by its asset id. */
	private sunImage: { asset: string; image: Promise<ImageBitmap | null> } | null = null;

	/** A Sky's own sun image into the view once Sign in with Roblox has it; until then, none. */
	private loadSunImage(view: ViewRenderer, lighting: LightingParams): void {
		const asset = lighting.sunImage?.asset;
		if (!asset) {
			this.sunImage = null;
			this.upload(view, "sun", null, () => view.setSunImage(null));
			return;
		}
		const key = `sun:${asset}`;
		this.tally.want(key, this.sunImage?.asset !== asset);
		if (this.sunImage?.asset !== asset) {
			let got: ImageBitmap | null = null;
			const image = loadImages([asset], (_, bitmap) => {
				got = bitmap;
			})
				.then((why) => {
					if (why) this.tally.notAsked(key, why);
					return got;
				})
				.catch(() => null);
			this.sunImage = { asset, image };
			// What did not arrive is asked for again next time.
			void image.then((held) => {
				if (!held && this.sunImage?.asset === asset) this.sunImage = null;
			});
		}
		void this.sunImage.image.then((image) => {
			if (image) this.tally.arrive(key);
			else this.tally.fail(key);
			if (!image || this.view !== view) return;
			this.upload(
				view,
				"sun",
				image,
				async () => {
					const ready = await forView(view, image);
					if (this.view === view) view.setSunImage(ready);
				},
				[key],
			);
		});
	}

	/** One pick at a time: WebGPU reads a pick back through one buffer. */
	private picking: Promise<unknown> = Promise.resolve();
	private pickId(x: number, y: number): Promise<number> {
		const run = this.picking.then(() => (this.view ? this.view.pick(this.camera(), x, y) : -1));
		this.picking = run.catch(() => -1);
		return run;
	}

	/** A part's own box, or one round every part inside an instance, square to the world. */
	private boxFor(index: number): Float32Array {
		return this.boxRound([index]);
	}

	/**
	 * One part's own box, or one round every part in all of these: square to a
	 * single model's pivot, as Studio's selection box is, else to the world.
	 */
	private boxRound(indices: readonly number[]): Float32Array {
		const own = indices.length === 1 ? this.words.get(indices[0]) : undefined;
		if (own) return own;
		const pivot = indices.length === 1 ? this.pivots[indices[0]] : undefined;
		return boxAround(this.rowsOf(indices), pivot);
	}

	/** The box round these, square to the world: the handles' in global space. */
	private worldBox(indices: readonly number[]): Float32Array {
		return boxAround(this.rowsOf(indices));
	}

	/** Every drawn part in these and in what they hold. */
	private rowsOf(indices: readonly number[]): ArrayLike<number>[] {
		const rows: ArrayLike<number>[] = [];
		const visit = (i: number) => {
			const w = this.words.get(i);
			if (w) rows.push(w);
			for (const k of this.kids[i] ?? []) visit(k);
		};
		for (const index of indices) visit(index);
		return rows;
	}

	/**
	 * Where one picked thing's pivot is, and its axes: the scene's, else a part's
	 * drawn box's centre and axes, else the middle of its box, square to the world.
	 */
	private pivotOf(index: number): { at: number[]; axes: number[][] } | null {
		const p = this.pivots[index];
		if (p)
			return { at: [p[9], p[10], p[11]], axes: [0, 1, 2].map((j) => [p[j], p[3 + j], p[6 + j]]) };
		const b = this.boxRound([index]);
		if (b.length < SCENE_STRIDE) return null;
		const own = this.words.has(index);
		return {
			at: [b[9], b[10], b[11]],
			axes: own ? [0, 1, 2].map((j) => unit([b[j * 3], b[j * 3 + 1], b[j * 3 + 2]], j)) : WORLD,
		};
	}

	/** What a click on a part picks, by how far it reaches: see Reach. */
	private clickTarget(part: number, reach: Reach): number {
		if (reach === "part" || !this.place) return part;
		const { outline } = this.place;
		return reach === "down"
			? stepDown(outline, this.workspace, part, this.selection)
			: outermostModel(outline, this.workspace, part);
	}

	/** How far a click reaches with these keys: Alt steps in when Settings says so, Shift the part. */
	private reachFor(alt: boolean, shift: boolean): Reach {
		if (alt) return this.options.altClickSteps ? "down" : "part";
		return shift ? "part" : "top";
	}

	// -- dragging parts --------------------------------------------------------------

	/**
	 * Makes a drag's move in the place, answering with the place's new stamp,
	 * or null when it did not: App's, which keeps its undo.
	 */
	private mover: ((move: PlaceMove) => Promise<string | null>) | null = null;
	private drag: Dragging | null = null;

	setMover(mover: ((move: PlaceMove) => Promise<string | null>) | null): void {
		this.mover = mover;
	}

	/** Whether a drag can move this row: a part, or a Model (not Workspace). */
	private movable(index: number): boolean {
		if (this.words.has(index)) return true;
		const outline = this.place?.outline;
		const cls = outline?.classes[outline.nodes[index]?.[0] ?? -1];
		return isSubclassOf(cls, "Model") && !isSubclassOf(cls, "WorldRoot");
	}

	/**
	 * What a press at `x`, `y` (CSS pixels from the canvas's corner) would
	 * drag: the pivot of the one thing picked when the press is on its mark,
	 * else the part under it -- everything picked when that is picked, else
	 * what a click there picks. Null with editing off, or nothing to drag.
	 * `onlyPicked` leaves alone what is not picked: a finger orbits over it.
	 */
	private gripAt(
		x: number,
		y: number,
		box: DOMRect,
		reach: Reach,
		onlyPicked: boolean,
	): Grip | null {
		if (!this.state.editable || !this.mover || !this.place?.stamp || !picks(this.state.tool))
			return null;
		const eye = this.eye();
		const d = this.rayAt(x, y, box);
		const pivot = this.pivotGrip(x, y, box);
		if (pivot) return { items: [pivot.index], grab: pivot.at, byPivot: true };
		const hit = rayHit(this.place, eye, d);
		// A Locked part stays put, as in Studio: the press draws a box over it instead.
		if (!hit || this.place.locked?.includes(hit.id)) return null;
		const target = this.clickTarget(hit.id, reach);
		const picked = this.selection.includes(target);
		if (onlyPicked && !picked) return null;
		const items = (picked ? this.selection : [target]).filter((i) => this.movable(i));
		if (items.length === 0) return null;
		return { items, grab: eye.map((v, a) => v + d[a] * hit.t), byPivot: false };
	}

	/**
	 * The one thing picked, and where its pivot is, when a press at `x`, `y`
	 * (CSS pixels from the canvas's corner) would take hold of its pivot
	 * rather than of the part there; null otherwise, or with editing off.
	 */
	private pivotGrip(x: number, y: number, box: DOMRect): { index: number; at: number[] } | null {
		if (!this.state.editable || !this.mover || !this.place?.stamp || !picks(this.state.tool))
			return null;
		const one = this.selection.length === 1 ? this.selection[0] : null;
		const pivot = one !== null && this.movable(one) ? this.pivotOf(one) : null;
		if (one === null || !pivot) return null;
		const mark = screenPoint(this.shot(box), pivot.at);
		return mark && Math.hypot(mark[0] - x, mark[1] - y) <= PIVOT_GRIP
			? { index: one, at: pivot.at }
			: null;
	}

	/** The pointer is over the pivot's mark, where a press drags by the pivot. */
	private pivotHover = false;

	/** The pivot's mark grown and ringed, and the move cursor, while a press there would take it. */
	private setPivotHover(on: boolean): void {
		if (on === this.pivotHover) return;
		this.pivotHover = on;
		this.dragLook();
		this.drawPivot();
	}

	/** The canvas's cursor for what a press or the drag under way holds: the pivot, or the part. */
	private dragLook(): void {
		const canvas = this.canvas;
		if (!canvas) return;
		const byPivot = this.drag ? this.drag.start.byPivot : this.pivotHover;
		canvas.classList.toggle("vp-canvas-pivot", byPivot);
		canvas.classList.toggle("vp-canvas-dragging", this.drag !== null && !this.drag.start.byPivot);
	}

	/** Every row in these, and in what they hold. */
	private rowsUnder(indices: readonly number[]): Set<number> {
		const out = new Set<number>();
		const take = (i: number) => {
			if (out.has(i)) return;
			out.add(i);
			for (const k of this.kids[i] ?? []) take(k);
		};
		for (const i of indices) take(i);
		return out;
	}

	/** A press moved far enough with a grip: the drag begins, what it holds picked. */
	private beginDrag(grip: Grip, at: { x: number; y: number }): void {
		const place = this.place;
		if (!place) return;
		if (!grip.items.every((i) => this.selection.includes(i))) this.pickHere(grip.items);
		const { items } = grip;
		const ids = this.rowsUnder(items);
		const one = items.length === 1;
		const b = one ? this.boxRound(items) : this.worldBox(items);
		if (b.length < SCENE_STRIDE) return;
		const box = {
			cols: [0, 1, 2].map((j) => [b[j * 3], b[j * 3 + 1], b[j * 3 + 2]]),
			centre: [b[9], b[10], b[11]],
		};
		const pivot = one ? (this.pivotOf(items[0])?.at ?? box.centre) : box.centre;
		const words = new Map<number, Float32Array>();
		const pivots = new Map<number, number[]>();
		for (const id of ids) {
			const w = this.words.get(id);
			if (w) words.set(id, w);
			const p = this.pivots[id];
			if (p) pivots.set(id, p);
		}
		this.drag = {
			items,
			ids,
			start: { box, pivot, grab: grip.grab, byPivot: grip.byPivot },
			turn: IDENTITY,
			move: STILL,
			at,
			base: { place, words, pivots },
		};
		this.setHover(null);
		this.dragLook();
	}

	/** The drag follows the pointer, at `x`, `y` in client pixels. */
	private dragTo(x: number, y: number): void {
		const drag = this.drag;
		const canvas = this.canvas;
		if (!drag || !canvas) return;
		drag.at = { x, y };
		const box = canvas.getBoundingClientRect();
		const eye = this.eye();
		const d = this.rayAt(x - box.left, y - box.top, box);
		const hit = rayHit(drag.base.place, eye, d, (id) => drag.ids.has(id));
		let surface: Surface;
		if (hit) {
			const row = this.words.get(hit.id);
			surface = {
				point: eye.map((v, a) => v + d[a] * hit.t),
				normal: hit.normal,
				axes: row
					? [0, 1, 2].map((j) => unit([row[j * 3], row[j * 3 + 1], row[j * 3 + 2]], j))
					: WORLD,
				origin: row ? [row[9], row[10], row[11]] : [0, 0, 0],
				rest: true,
			};
		} else {
			// Nothing under the pointer: across the level it was taken hold of.
			const level = drag.start.grab[1];
			const s = (level - eye[1]) / d[1];
			if (!(s > 0) || !Number.isFinite(s)) return;
			surface = {
				point: eye.map((v, a) => v + d[a] * s),
				normal: [0, 1, 0],
				axes: WORLD,
				origin: [0, 0, 0],
				rest: false,
			};
		}
		const { move, moveOn } = this.state.snap;
		drag.move = dragMove(drag.start, drag.turn, surface, moveOn ? move : 0);
		this.showDrag();
	}

	/** R or T while dragging: a quarter turn more, on the spot. */
	private turnDrag(key: "R" | "T"): void {
		const drag = this.drag;
		if (!drag) return;
		const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
		drag.turn = turnedBy(drag.turn, key, right);
		this.dragTo(drag.at.x, drag.at.y);
	}

	/** The view's copy of the place with the drag's move: drawn, outlined and picked from until it is written. */
	private showDrag(): void {
		const drag = this.drag;
		if (!drag) return;
		const m = drag.move;
		this.place = { ...drag.base.place, ...sceneMoved(drag.base.place, drag.ids, m) };
		for (const [id, w] of drag.base.words) {
			const copy = w.slice();
			moveRow(copy, m);
			this.words.set(id, copy);
		}
		for (const [id, p] of drag.base.pivots) {
			const copy = [...p];
			moveRow(copy, m, true);
			this.pivots[id] = copy;
		}
		if (this.sceneQueued) return;
		this.sceneQueued = true;
		requestAnimationFrame(() => {
			this.sceneQueued = false;
			// Rows only: the sky's maps and the shadows wait for the drag to be let go.
			if (this.view && this.place && this.drag) this.view.setScene(this.place, true);
			this.refreshSelection();
		});
	}

	/** A new scene for the view waits for the next frame: a drag moves faster than it draws. */
	private sceneQueued = false;

	/** The drag put back as it was, nothing written. */
	private undoDrag(drag: Dragging): void {
		this.place = drag.base.place;
		for (const [id, w] of drag.base.words) this.words.set(id, w);
		for (const [id, p] of drag.base.pivots) this.pivots[id] = p;
		this.view?.setScene(drag.base.place);
		this.refreshSelection();
	}

	/** Esc while dragging: back where it was. */
	private cancelDrag(): boolean {
		const drag = this.drag;
		if (!drag) return false;
		this.drag = null;
		this.pivotHover = false;
		this.dragLook();
		this.undoDrag(drag);
		return true;
	}

	/** The drag let go: its move made in the place, or everything back where it was. */
	private async endDrag(): Promise<void> {
		const drag = this.drag;
		if (!drag) return;
		this.drag = null;
		this.pivotHover = false;
		this.dragLook();
		const stamp = drag.base.place.stamp;
		if (still(drag.move) || !stamp || !this.mover) {
			this.undoDrag(drag);
			return;
		}
		// Where it was let go, with the sky's maps and the shadows drawn again once.
		this.sceneQueued = false;
		if (this.view && this.place) this.view.setScene(this.place);
		this.refreshSelection();
		const { r, t } = drag.move;
		const nodes = drag.base.place.outline.nodes;
		const label =
			drag.items.length === 1
				? `Drag ${nodes[drag.items[0]]?.[1] ?? ""}`
				: `Drag ${drag.items.length} items`;
		let made: string | null = null;
		try {
			made = await this.mover({
				stamp,
				items: drag.items,
				by: { position: [...t], rotation: [...r] },
				label,
			});
		} catch {
			made = null;
		}
		const now = this.place;
		if (!now || now.stamp !== stamp) return;
		// Made: this copy is that version until the host's arrives, so a drag at
		// once names it. Refused: back where it was, unless a drag is under way.
		if (made) this.place = { ...now, stamp: made };
		else if (this.drag === null) this.undoDrag(drag);
	}

	// -- the camera ----------------------------------------------------------------

	/** From what the camera looks at back to the camera. */
	private back(): number[] {
		const c = Math.cos(this.cam.pitch);
		return [c * Math.sin(this.cam.yaw), Math.sin(this.cam.pitch), c * Math.cos(this.cam.yaw)];
	}

	private eye(): number[] {
		const b = this.back();
		return this.cam.target.map((v, a) => v + this.cam.dist * b[a]);
	}

	/** The way into the view through a point on it, in CSS pixels from its corner. */
	private rayAt(x: number, y: number, box: { width: number; height: number }): number[] {
		const b = this.back();
		const forward = b.map((v) => -v);
		const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
		const up = [
			right[1] * forward[2] - right[2] * forward[1],
			right[2] * forward[0] - right[0] * forward[2],
			right[0] * forward[1] - right[1] * forward[0],
		];
		const tan = Math.tan(this.fovY() / 2);
		const sx = ((x / box.width) * 2 - 1) * tan * (box.width / box.height);
		const sy = (1 - (y / box.height) * 2) * tan;
		return [0, 1, 2].map((a) => forward[a] + right[a] * sx + up[a] * sy);
	}

	private camera(): Camera {
		return {
			eye: this.eye(),
			at: this.cam.target,
			near: Math.min(2, Math.max(0.1, this.cam.dist * 0.01)),
			far: Math.max(40000, this.cam.dist * 200),
			fovY: this.fovY(),
		};
	}

	/** The vertical field of view the place's Camera gives the view as it is now: see viewFovY. */
	private fovY(): number {
		const c = this.canvas;
		const aspect = c && c.clientHeight > 0 ? c.clientWidth / c.clientHeight : 16 / 9;
		return viewFovY(this.place?.camera, aspect);
	}

	/** How the camera sees the view now, for what a box drawn on it holds. */
	private shot(box: { width: number; height: number }): ViewShot {
		const forward = this.back().map((v) => -v);
		const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
		const up = [
			right[1] * forward[2] - right[2] * forward[1],
			right[2] * forward[0] - right[0] * forward[2],
			right[0] * forward[1] - right[1] * forward[0],
		];
		return {
			eye: this.eye(),
			forward,
			right,
			up,
			tan: Math.tan(this.fovY() / 2),
			width: box.width,
			height: box.height,
		};
	}

	/** Frames the selection (F); Studio's camera by what its frustum covers. */
	frameSelection(): void {
		if (this.selection.length === 0) return;
		const studio = this.place?.camera;
		if (studio && this.selection.length === 1 && this.selection[0] === studio.id) {
			const r = studio.rotation;
			this.cam.target = [0, 1, 2].map((a) => studio.position[a] - r[a * 3 + 2] * 5);
			this.cam.dist = 34;
			this.redraw();
			return;
		}
		const b = this.boxRound(this.selection);
		if (b.length < SCENE_STRIDE) return;
		this.cam.target = [b[9], b[10], b[11]];
		const r =
			Math.hypot(
				Math.hypot(b[0], b[1], b[2]),
				Math.hypot(b[3], b[4], b[5]),
				Math.hypot(b[6], b[7], b[8]),
			) / 2;
		this.cam.dist = Math.max(8, r * 2.4);
		this.redraw();
	}

	/** Frames the whole place (Home). */
	fitAll(): void {
		if (!this.place) return;
		this.cam.target = [...this.place.centre];
		this.cam.dist = this.place.radius * 1.6;
		this.redraw();
	}

	/**
	 * A tool's key or its button: that tool, or with Select chosen again, no
	 * tool at all. The editing tools wait on Modify DataModel Instances.
	 */
	chooseTool(chosen: Tool): void {
		this.setTool(toolAfter(this.state.tool, chosen, this.state.editable));
	}

	/** Null puts the tool down: the camera alone, and Edit Pivot off with it. */
	setTool(tool: Tool | null): void {
		if (tool !== null && tool !== "select" && !this.state.editable) return;
		this.set(tool === null ? { tool, pivotEdit: false } : { tool });
		if (!picks(tool)) this.setHover(null);
		this.drawHandles();
		this.redraw();
	}

	setSpeed(speed: number): void {
		this.set({ speed: clampSpeed(speed) });
	}

	setSnap(patch: Partial<Snap>): void {
		this.set({ snap: { ...this.state.snap, ...patch } });
	}

	/** A touch stick, pushed `x` across and `y` down, each -1 to 1: moving, or looking round. */
	setStick(stick: Stick, x: number, y: number): void {
		this.sticks[stick] = [x, y];
		if (x !== 0 || y !== 0) this.fly();
	}

	/** The up and down buttons beside the sticks: 1 up, -1 down, 0 neither. */
	setRise(rise: number): void {
		this.rise = rise;
		if (rise !== 0) this.fly();
	}

	private moving(): boolean {
		const { move, look } = this.sticks;
		return (
			this.held.size > 0 ||
			this.rise !== 0 ||
			move.some((v) => v !== 0) ||
			look.some((v) => v !== 0)
		);
	}

	/** Turns the camera where it stands: the right-drag look. */
	private look(dx: number, dy: number): void {
		const eye = this.eye();
		this.cam.yaw -= dx * 0.005;
		this.cam.pitch = clampPitch(this.cam.pitch + dy * 0.005);
		const b = this.back();
		this.cam.target = eye.map((v, a) => v - this.cam.dist * b[a]);
	}

	/** Round the selection where it is on screen, or round the point looked at when nothing is picked. */
	private orbit(dx: number, dy: number): void {
		const b = this.selection.length === 0 ? null : this.boxRound(this.selection);
		const dyaw = -dx * 0.008;
		const pitch = clampPitch(this.cam.pitch + dy * 0.008);
		if (!b || b.length < SCENE_STRIDE) {
			this.cam.yaw += dyaw;
			this.cam.pitch = pitch;
			return;
		}
		const pivot = [b[9], b[10], b[11]];
		const eye = this.eye();
		let v = eye.map((e, a) => e - pivot[a]);
		v = turn(v, [0, 1, 0], dyaw);
		this.cam.yaw += dyaw;
		// Tilting by d turns the camera round its own right by -d.
		v = turn(v, [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)], -(pitch - this.cam.pitch));
		this.cam.pitch = pitch;
		const at = this.back();
		this.cam.target = [0, 1, 2].map((a) => pivot[a] + v[a] - this.cam.dist * at[a]);
	}

	private pan(dx: number, dy: number): void {
		const { yaw, pitch, dist } = this.cam;
		const s = (dist * 0.0016 * 1.6) / Math.min(2, devicePixelRatio || 1);
		const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
		const up = [
			-Math.sin(pitch) * Math.sin(yaw),
			Math.cos(pitch),
			-Math.sin(pitch) * Math.cos(yaw),
		];
		for (let a = 0; a < 3; a++) this.cam.target[a] += (-right[a] * dx + up[a] * dy) * s;
	}

	private turnTo(yaw: number, pitch: number): void {
		const from = [this.cam.yaw, this.cam.pitch];
		// The short way round.
		let dy = yaw - from[0];
		dy = ((((dy + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
		const start = performance.now();
		const run = ++this.turning;
		const step = (now: number) => {
			if (run !== this.turning) return;
			const t = Math.min(1, (now - start) / 260);
			const e = 1 - (1 - t) ** 3;
			this.cam.yaw = from[0] + dy * e;
			this.cam.pitch = from[1] + (pitch - from[1]) * e;
			this.redraw();
			if (t < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	/**
	 * WASD along the look, Q and E down and up, for as long as they are held;
	 * and the touch sticks and buttons, the same way, as far as they are pushed.
	 */
	private fly(): void {
		if (this.flying) return;
		this.flying = true;
		let last = performance.now();
		const step = (now: number) => {
			if (!this.moving() || !this.mounted) {
				this.flying = false;
				return;
			}
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			const [lx, ly] = this.sticks.look;
			if (lx !== 0 || ly !== 0) this.look(lx * LOOK_RATE * dt, ly * LOOK_RATE * dt);
			const b = this.back();
			const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
			const move = [0, 0, 0];
			const push = (x: number, y: number, z: number) => {
				for (let a = 0; a < 3; a++) move[a] += right[a] * x - b[a] * z + (a === 1 ? y : 0);
			};
			for (const code of this.held) push(...(MOVES[code] as [number, number, number]));
			// Pushed up is forward.
			const [mx, my] = this.sticks.move;
			push(mx, this.rise, -my);
			const d = BASE_SPEED * this.state.speed * dt;
			for (let a = 0; a < 3; a++) this.cam.target[a] += move[a] * d;
			this.redraw();
			requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	// -- drawing -------------------------------------------------------------------

	/**
	 * Lends the controller a holder for its canvas while the tab is in front.
	 * Answers with the function that takes it back.
	 */
	mount(els: ViewportElements): () => void {
		const run = ++this.mounted;
		this.els = els;
		const keys = this.keys();
		addEventListener("keydown", keys.down);
		addEventListener("keyup", keys.up);
		addEventListener("blur", keys.blur);
		const resize = new ResizeObserver(() => this.fit());
		resize.observe(els.holder);
		void this.start();
		return () => {
			if (this.mounted !== run) return;
			this.mounted = 0;
			removeEventListener("keydown", keys.down);
			removeEventListener("keyup", keys.up);
			removeEventListener("blur", keys.blur);
			resize.disconnect();
			this.held.clear();
			this.sticks = { move: [0, 0], look: [0, 0] };
			this.rise = 0;
			this.hideMarquee();
			this.view?.destroy();
			this.view = null;
			this.canvas?.remove();
			this.pivotMark?.remove();
			this.pivotMark = null;
			this.canvas = null;
			this.els = null;
		};
	}

	/** Lends the axes and the readout, from the bar. Answers with the function that takes them back. */
	mountCorner(corner: CornerElements): () => void {
		this.corner = corner;
		this.attachGizmo(corner.gizmo);
		const rate = setInterval(() => this.showRate(), 250);
		this.showRotation();
		return () => {
			clearInterval(rate);
			if (this.corner === corner) this.corner = null;
		};
	}

	private starting = false;
	/** Why WebGPU did not start, where the view fell back to WebGL2. */
	private fellBackWhy: string | null = null;
	/** The renderer starting, and the share of its shaders compiled, for the readout. */
	private startup: {
		backend: ViewRenderer["backend"];
		shaders: number | null;
		updated: boolean;
	} | null = null;

	/** Starts `view`, the readout following its shaders as they compile. */
	private async initView(view: ViewRenderer, canvas: HTMLCanvasElement, place: PlaceScene) {
		const startup = {
			backend: view.backend,
			shaders: null as number | null,
			updated: view.backend === "WebGPU" && shadersNew(shaderFingerprint()),
		};
		this.startup = startup;
		try {
			await view.init(canvas, place, (shaders) => {
				if (shaders === startup.shaders) return;
				startup.shaders = shaders;
				logStep("Shaders compiled", String(shaders), true);
				this.showRate();
			});
		} finally {
			if (this.startup === startup) this.startup = null;
		}
	}

	private async start(): Promise<void> {
		const els = this.els;
		const place = this.place;
		if (!els || !place || this.view || this.starting) return;
		this.starting = true;
		const run = this.mounted;
		const make = () => {
			this.canvas?.remove();
			this.pivotMark?.remove();
			this.pivotMark = null;
			const canvas = document.createElement("canvas");
			canvas.className = "vp-canvas";
			els.holder.append(canvas);
			const dpr = this.pixelRatio();
			canvas.width = Math.max(1, Math.round(els.holder.clientWidth * dpr));
			canvas.height = Math.max(1, Math.round(els.holder.clientHeight * dpr));
			this.canvas = canvas;
			return canvas;
		};
		const gl2 = this.options.renderer === "webgl2";
		if (this.gpuSeen === null) {
			this.gpuSeen = await gpuName(gl2);
			logStep("GPU found", String(this.gpuSeen));
			setOffOnThisDevice(offForGpu(this.gpuSeen));
			// The level's own switches, as this device has them.
			const q = this.level();
			if (changedFrom(this.state.render.features, q.features).length === 0)
				this.setRender({ ...this.state.render, features: this.levelFeatures(q) });
		}
		// Automatic's first level, from the device, before the view is made at it.
		if (this.auto && !this.classed) {
			this.classed = true;
			const level = startLevel({
				touch: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
				shortSide: Math.min(screen.width, screen.height),
				gpu: this.gpuSeen,
			});
			this.auto = new AutoQuality(level);
			void this.toLevel(level, true);
			logStep("Level chosen", `Level ${level}`);
		}
		const samples = this.antialiasMode();
		const map = this.shadowMapFor(this.level());
		let view: ViewRenderer;
		if (gl2) view = new WebGl2View(samples, map);
		else {
			const gpu = new WebGpuView(samples, map);
			gpu.half = this.options.half ?? true;
			view = gpu;
		}
		logStep("Renderer starting", gl2 ? "WebGL2" : "WebGPU");
		let fellBack = false;
		try {
			try {
				await this.initView(view, make(), place);
			} catch (err) {
				if (gl2) throw err;
				fellBack = true;
				// Kept for a benchmark's report: a run drawn by WebGL2 is not one by WebGPU.
				this.fellBackWhy = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
				logStep("WebGPU did not start; WebGL2 starting", this.fellBackWhy);
				view = new WebGl2View(samples, map);
				await this.initView(view, make(), place);
			}
		} catch (err) {
			this.starting = false;
			endStart("No renderer started", String(err));
			this.set({ error: `Neither WebGPU nor WebGL2 is available here: ${String(err)}` });
			return;
		}
		this.starting = false;
		logStep("Renderer started", view.backend);
		// Taken back while it started.
		if (run !== this.mounted || this.els !== els) {
			view.destroy();
			return;
		}
		view.setLighting(litFor((this.place ?? place).lighting, this.state.render.features));
		view.setOverlay(this.overlayLines());
		view.setOutline(this.options.outlineWidth, this.options.hideBehind);
		view.setGlassHides(this.options.glassHides);
		view.setPostEffects(this.options.postEffects);
		view.setQuality(this.viewQualityFor(this.level(), this.pixelRatio()));
		view.setTextureDetail(TEXTURE_STEPS[this.options.textureResolution ?? "full"]);
		view.setRender(this.withSavings(this.state.render));
		// A new view starts on the full path: Automatic's is measured for it afresh.
		this.depth.reset();
		this.lamps.reset();
		this.view = view;
		this.applyLampMode();
		// A pipeline built for the Rendering panel's switches is ready: draw with it.
		view.onRedraw = () => {
			if (startOpen()) logStep("Pipelines ready", String(++this.pipelinesLogged), true);
			this.redraw();
		};
		this.set({
			backend: view.backend,
			fellBack,
			error: null,
			antialiasModes: view.antialiasModes(),
		});
		if (this.place !== place) view.setScene(this.place ?? place);
		this.tally.begin();
		this.loadLooks(view, this.place ?? place);
		this.loadImages(view, this.place ?? place);
		this.loadSky(view, (this.place ?? place).lighting);
		this.loadSunImage(view, (this.place ?? place).lighting);
		this.loadMeshes(view, this.place ?? place);
		this.loadUnions(view, this.place ?? place);
		logStep("Scene given to the view");
		this.firstFrameLog = true;
		this.attach(this.canvas as HTMLCanvasElement);
		this.refreshSelection();
		this.fit();
		this.shadersAfterStart(view);
	}

	/**
	 * After a start: the shaders noted against what the browser last saw, and,
	 * where they are not yet built for every level, built in the background a
	 * few seconds on, as Settings' "Build after an update" asks.
	 */
	private shadersAfterStart(view: ViewRenderer): void {
		if (view.backend !== "WebGPU" || !view.warmShaders) return;
		const fingerprint = shaderFingerprint();
		noteShaders(fingerprint);
		if (this.options.buildShaders === false || !autoBuildWanted()) return;
		if (readShaderRecord()?.built === fingerprint) return;
		this.warmAhead = true;
		logStep("Shader build waiting", "starts 4 s after the view");
		setTimeout(() => {
			if (this.view === view && !this.state.profiling) void this.buildShaders();
			else {
				this.warmAhead = false;
				endStart("Shader build not run", "the view changed or a profile ran");
			}
		}, 4000);
	}

	private warming = false;
	/** The start log: the first frame after a start is still to be noted. */
	private firstFrameLog = false;
	/** The start log: the shaders' background build is still to come, and the start waits for it. */
	private warmAhead = false;
	/** The start log: pipelines the view has said are ready, this start. */
	private pipelinesLogged = 0;

	/**
	 * The shaders for every quality level built ahead, for this place: so
	 * Automatic, a level chosen or a sweep waits for none. Progress goes to
	 * Settings (reportShaders).
	 */
	async buildShaders(): Promise<void> {
		const view = this.view;
		if (!view) {
			reportShaders({ state: "no-view" });
			return;
		}
		if (!view.warmShaders) {
			reportShaders({ state: "webgl2" });
			return;
		}
		if (this.warming) return;
		this.warming = true;
		logStep("Shader build started");
		const from = performance.now();
		const sets = [
			...Array.from({ length: TOP_LEVEL }, (_, i) => this.levelFeatures(qualityLevel(i + 1))),
			this.state.render.features,
		];
		try {
			const pipelines = await view.warmShaders(sets, (done, of) => {
				logStep("Shader build", `${done} of ${of}`, true);
				reportShaders({ state: "building", done, of });
			});
			const ms = performance.now() - from;
			markShadersBuilt(shaderFingerprint(), ms, pipelines);
			reportShaders({ state: "built", ms, of: pipelines });
			endStart("Shader build finished", `${pipelines} pipelines in ${Math.round(ms)} ms`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			reportShaders({ state: "failed", message });
			endStart("Shader build failed", message);
		} finally {
			this.warming = false;
			this.warmAhead = false;
		}
	}

	/** The view made again: another renderer, or another number of samples a pixel. */
	private async restartView(): Promise<void> {
		this.view?.destroy();
		this.view = null;
		this.canvas?.remove();
		this.pivotMark?.remove();
		this.pivotMark = null;
		this.canvas = null;
		await this.start();
	}

	/**
	 * Once a view built again has the place's assets on the GPU, as far as they
	 * come in ten seconds, and the pipelines for its switches.
	 */
	private async viewSettled(): Promise<void> {
		const from = performance.now();
		while (performance.now() - from < 10000) {
			const a = this.state.assets;
			if (this.view && (a === null || assetsPending(a) <= 0)) break;
			await new Promise((r) => setTimeout(r, 200));
		}
		await this.view?.pipelinesReady();
	}

	/** A share of the canvas's pixels, below 1 only while a profile measures resolution. */
	private resolutionScale = 1;

	/**
	 * Canvas pixels to a CSS pixel: the screen's, two at most, by Settings'
	 * render scale -- Automatic is less on a touch screen -- and by a profile's
	 * resolution while it measures.
	 */
	// -- quality levels: see quality.ts -------------------------------------------------

	/** Settings' Quality as last applied. */
	private qualitySetting: number | "auto" = TOP_LEVEL;
	/** Automatic's steps; null at a level chosen by hand. */
	private auto: AutoQuality | null = null;
	/** Automatic has had its first level from the device. */
	private classed = false;

	private level(): QualityLevel {
		return qualityLevel(this.state.quality.level);
	}

	/** The GPU's name, asked for once. */
	private gpuSeen: string | null = null;

	/**
	 * A quality level's switches on this device. Occlusion culling is off at
	 * every level (renderFeatures' optIn): the depth pass it needs cost an iPad
	 * Mini 0.7 to 2.6 ms at every Benchmark 3 station and saved nothing at any
	 * (22 Nov 2026), and was slower at 37 of 40 stations on an RTX 40 (a
	 * developer's A/B, 25 Nov). It can still be turned on by hand.
	 */
	private levelFeatures(q: QualityLevel): RenderFeatures {
		return onThisDevice(q.features);
	}

	/**
	 * A quality level's view settings, with Settings' Bloom resolution over
	 * the level's own: Full finds and blurs the glow at the view's size and
	 * half; Half finds it at half; Quarter blurs it at a quarter as well.
	 */
	private viewQualityFor(q: QualityLevel, ratio: number): ViewQuality {
		const level = viewQuality(q, ratio);
		const set = (() => {
			switch (this.options.bloomResolution) {
				case "full":
					return { ...level, glowHalf: false, glowCoarse: false };
				case "half":
					return { ...level, glowHalf: true, glowCoarse: false };
				case "quarter":
					return { ...level, glowHalf: true, glowCoarse: true };
				default:
					return level;
			}
		})();
		// Dynamic optimization's bloom savings: fewer pixels than set, never more.
		const saving = this.savingsNow().bloom;
		if (saving === "quarter") return { ...set, glowHalf: true, glowCoarse: true };
		if (saving === "half") return { ...set, glowHalf: true };
		return set;
	}

	/** The sun's shadow maps' side: Settings', or the quality level's. */
	private shadowMapFor(q: QualityLevel): number {
		const size = this.options.shadowMapSize;
		return size === undefined || size === "auto" ? q.shadowMap : size;
	}

	/** Antialiasing: Settings', or the quality level's. */
	private antialiasMode(): AntialiasMode {
		return this.options.antialias ?? this.level().antialias;
	}

	/**
	 * A quality level chosen, or Automatic: its switches replace the Rendering
	 * panel's, even where they were changed by hand, as choosing a preset does.
	 */
	chooseQuality(quality: number | "auto"): void {
		this.qualitySetting = quality;
		if (quality === "auto") {
			// The device is read once, as the view is first made; after that Automatic starts where it is.
			const started = this.classed || this.view !== null;
			this.classed = started;
			this.auto = new AutoQuality(started ? this.state.quality.level : TOP_LEVEL);
			void this.toLevel(this.auto.level, true);
		} else {
			this.auto = null;
			void this.toLevel(qualityLevel(quality).level, true);
		}
	}

	/**
	 * Draws at `level`; `reset`, with its switches in the Rendering panel.
	 * Done once the view is drawing at it, made again where it had to be.
	 */
	/**
	 * One level of the profile's quality sweep, as toLevel left the view: its
	 * frame, its stages waited for one at a time, and what it set.
	 */
	private async timeLevel(n: number): Promise<LevelRow> {
		const timed = await this.timeWaited(`Level ${n}`, 20);
		const view = this.view!;
		const frames: StageFrame[] = [];
		const gpuFrames: StageFrame[] = [];
		view.setProfiling(
			(each) => frames.push(each),
			(each) => gpuFrames.push(each),
		);
		await this.waitedFrames(20, PROFILE_BUDGET);
		view.setProfiling(null);
		await view.settled();
		await new Promise((r) => setTimeout(r, 50));
		const q = qualityLevel(n);
		const features = this.state.render.features;
		const below = n > 1 ? this.levelFeatures(qualityLevel(n - 1)) : null;
		const facts = view.deviceFacts();
		const stats = view.stats();
		return {
			...timed,
			level: n,
			canvas: { ...this.drawn },
			antialias: antialiasInfo(view.antialias).label,
			shadowMap: view.shadowMap,
			reach: q.reach,
			blobs: q.blobWidth !== null,
			distance: q.distance,
			glow: !features.neonGlow && !features.lavaGlow ? "off" : facts.glowHalf ? "half" : "full",
			adds: FEATURES.filter((i) => this.levelFeatures(q)[i.key] && below && !below[i.key]).map(
				(i) => i.label,
			),
			stages: stageRows(frames),
			stageTotal: stagesTotal(frames),
			gpu: stageRows(gpuFrames),
			gpuTotal: stagesTotal(gpuFrames),
			draws: stats.draws,
			instances: stats.instances,
			triangles: stats.triangles,
		};
	}

	/**
	 * The camera moved as each control moves it, a frame at a time at 60 a
	 * second, from where it is, and put back after each: its frames, stages,
	 * and what was drawn again.
	 */
	/**
	 * `n` frames drawn with the GPU kept busy: the next always queued behind
	 * the one it is drawing, two in flight. A GPU that sets its own clock by
	 * how hard it is worked (Apple's) then works at full speed, and its timers
	 * time the work rather than the clock: drawn one at a time and waited for,
	 * an iPad Mini's scenes of 1 and of 100 lights both took about 18.8 ms,
	 * and an empty one 7.7 ms in one pass and 13.8 in the next (Benchmark 1,
	 * 22 Nov 2026). Answers the time between frames finishing.
	 */
	private async busyFrames(
		n: number,
		before?: (frame: number) => void,
		after?: () => void,
		budget = Number.POSITIVE_INFINITY,
		/** Each frame's time to Dynamic and Dynamic optimization, as the frame loop gives them. */
		adapt = false,
	): Promise<number[]> {
		const view = this.view;
		if (!view) return [];
		const done: number[] = [];
		const inFlight: Promise<void>[] = [];
		const from = performance.now();
		for (let i = 0; i < n; i++) {
			if (this.view !== view) break;
			if (i >= PROFILE_FEWEST && performance.now() - from > budget) break;
			before?.(i);
			this.drawOnce(performance.now());
			after?.();
			inFlight.push(
				view.finished().then(() => {
					const at = performance.now();
					const last = done.at(-1);
					done.push(at);
					if (adapt && last !== undefined) this.dynamicFrame(at, at - last, true);
				}),
			);
			if (inFlight.length >= 2) await inFlight.shift();
		}
		await Promise.all(inFlight);
		return done.slice(1).map((t, i) => t - done[i]);
	}

	/** The GPU kept busy for `ms` first, so it is at the clock full work gives it. */
	private async warmBusy(ms: number): Promise<void> {
		const until = performance.now() + ms;
		while (performance.now() < until && this.view) await this.busyFrames(10);
	}

	/**
	 * What a frame costs with the GPU kept busy: the time between frames, the
	 * GPU's own time for one (its timers, where it has them) and the page's.
	 */
	private async timeBusy(label: string, n: number): Promise<Timed> {
		await this.view?.pipelinesReady();
		await this.warmBusy(500);
		const view = this.view;
		const gpu: number[] = [];
		const cpu: number[] = [];
		const effects: number[] = [];
		const culling: number[] = [];
		const fx: Record<keyof EffectSteps, number[]> = { step: [], sort: [], quads: [], upload: [] };
		view?.setProfiling(null, (f) => gpu.push(Object.values(f).reduce((a, b) => a + (b ?? 0), 0)));
		const intervals = await this.busyFrames(n, undefined, () => {
			const s = this.view?.stats();
			if (!s) return;
			cpu.push(s.cpu);
			if (s.cpuSteps) {
				effects.push(s.cpuSteps.effects);
				culling.push(s.cpuSteps.culling);
				const parts = s.cpuSteps.fx;
				if (parts) for (const k of Object.keys(fx) as (keyof EffectSteps)[]) fx[k].push(parts[k]);
			}
		});
		// The last frames' stamps are read back after they finish.
		await view?.settled();
		await new Promise((r) => setTimeout(r, 50));
		view?.setProfiling(null);
		// Each the middle of many rounded times (see steady): `median` here is that, not a median.
		return {
			label,
			...spread(intervals),
			median: steady(intervals),
			...(gpu.length >= Math.min(5, n) ? { gpuMs: steady(gpu) } : {}),
			...(cpu.length > 0 ? { cpuMs: steady(cpu) } : {}),
			...(effects.length > 0
				? {
						cpuSteps: {
							effects: steady(effects),
							culling: steady(culling),
							...(fx.step.length > 0
								? {
										fx: {
											step: steady(fx.step),
											sort: steady(fx.sort),
											quads: steady(fx.quads),
											upload: steady(fx.upload),
										},
									}
								: {}),
						},
					}
				: {}),
		};
	}

	private async timeMoving(
		phase: (name: string) => void,
		only?: readonly string[],
		busy = false,
	): Promise<MovingRow[]> {
		// Each motion by the clock, not by the frame: a drag of 720 px a second
		// (12 a frame at 60), for MOVING_MS, so every device takes the same
		// path at the same speed. By the frame, a GPU drawing 280 a second spun
		// the camera four times as fast as an iPad's 60 and was done in 0.2 s.
		const forward = (dt: number) => {
			const b = this.back();
			const d = BASE_SPEED * this.state.speed * 0.9 * dt;
			for (let a = 0; a < 3; a++) this.cam.target[a] -= b[a] * d;
		};
		const motions: [string, (dt: number) => void][] = [
			["Orbit drag", (dt) => this.orbit(720 * dt, 0)],
			["Pan drag", (dt) => this.pan(720 * dt, 0)],
			["Pinch zoom", (dt) => (this.cam.dist = Math.max(2, this.cam.dist * 0.985 ** (60 * dt)))],
			["Look stick", (dt) => this.look(0.7 * LOOK_RATE * dt, 0)],
			["Move stick", forward],
		];
		const from = { ...this.cam, target: [...this.cam.target] };
		const rows: MovingRow[] = [];
		for (const [label, step] of motions) {
			if (only && !only.includes(label)) continue;
			phase(label);
			const view = this.view;
			if (!view) break;
			const frames: StageFrame[] = [];
			const gpuFrames: StageFrame[] = [];
			const was = view.redraws?.() ?? null;
			view.setProfiling(
				(each) => frames.push(each),
				(each) => gpuFrames.push(each),
			);
			if (busy) {
				await this.warmBusy(300);
				// Two frames in flight cross the waited stages' sums: kept to the GPU's own.
				view.setProfiling(
					() => {},
					(each) => gpuFrames.push(each),
				);
			}
			let last = performance.now();
			const byClock = () => {
				const now = performance.now();
				// A stall (a tab hidden) is not a leap along the path.
				step(Math.min(0.1, (now - last) / 1000));
				last = now;
			};
			// Dynamic or Dynamic optimization: they settle along the path first,
			// as they would in use, and go on adapting while it is timed.
			const adapting =
				busy &&
				(this.options.renderScale === "dynamic" || this.options.dynamicOptimization === true);
			if (adapting) await this.busyFrames(MOVING_MOST, byClock, undefined, DYNAMIC_SETTLE_MS, true);
			const times = busy
				? await this.busyFrames(MOVING_MOST, byClock, undefined, MOVING_MS, adapting)
				: await this.waitedFrames(MOVING_MOST, MOVING_MS, byClock);
			await view.settled();
			await new Promise((r) => setTimeout(r, 50));
			view.setProfiling(null);
			const now = view.redraws?.() ?? null;
			rows.push({
				label,
				...spread(times),
				...(busy ? { median: steady(times) } : {}),
				frames: times.length,
				stages: stageRows(frames),
				gpu: stageRows(gpuFrames, busy ? steady : undefined),
				gpuTotal: stagesTotal(gpuFrames, busy ? steady : undefined),
				redrawn:
					was && now
						? {
								probeFaces: now.probeFaces - was.probeFaces,
								nearMaps: now.nearMaps - was.nearMaps,
								sunMaps: now.sunMaps - was.sunMaps,
							}
						: null,
			});
			Object.assign(this.cam, { ...from, target: [...from.target] });
			this.redraw();
		}
		return rows;
	}

	// -- the benchmark: see benchmark/stations.ts ------------------------------------

	/** Drawing stopped while another view is measured: the editor's own, during a benchmark. */
	private suspended = false;

	setSuspended(on: boolean, release = false): void {
		this.suspended = on;
		if (on && release && this.view) {
			// The GPU's memory back for what runs meanwhile: a benchmark's own view
			// beside a large place's ran an iPad short, WebGPU did not start for
			// it, and the tab crashed (24 Nov 2026). The place, its selection and
			// its downloaded assets stay here; the view is built again after.
			this.released = true;
			this.view.destroy();
			this.view = null;
			this.canvas?.remove();
			this.pivotMark?.remove();
			this.pivotMark = null;
			this.canvas = null;
		}
		if (!on) {
			if (this.released) {
				this.released = false;
				void this.start();
				return;
			}
			this.redraw();
		}
	}

	/** Whether the view was let go while suspended, to be built again after. */
	private released = false;

	/** Once the view is made, its assets are in and its pipelines built. False if it never is. */
	async whenReady(): Promise<boolean> {
		const from = performance.now();
		while (!this.view || this.starting) {
			if (this.state.error) return false;
			// Waited for as long as it is under way: after an update a tablet's
			// browser compiles every shader afresh, which took an iPad past the
			// 20 seconds this once allowed (23 Nov 2026). Twenty seconds only
			// for a start that has not begun, and three minutes at most.
			const waited = performance.now() - from;
			if ((!this.starting && waited > 20000) || waited > 180000) return false;
			await new Promise((r) => setTimeout(r, 100));
		}
		await this.viewSettled();
		return true;
	}

	/** The camera where a station's pose puts it: at `eye`, looking at `at`. */
	private pose(eye: readonly number[], at: readonly number[]): void {
		const d = eye.map((v, a) => v - at[a]);
		const dist = Math.max(1e-3, Math.hypot(d[0], d[1], d[2]));
		this.cam.target = [...at];
		this.cam.dist = dist;
		this.cam.pitch = Math.asin(d[1] / dist);
		this.cam.yaw = Math.atan2(d[0], d[2]);
	}

	/**
	 * Roswaal Benchmark: each station's place drawn and measured, at the view's
	 * level as set, or at every level from 1 to 21. Still frames waited for,
	 * the GPU's stages, and an orbit (each control's motion, for the Moving
	 * station). Automatic's steps are held while it runs. Partial when
	 * `cancelled` says stop.
	 */
	async runBenchmark(run: {
		stations: readonly Station[];
		kind: BenchmarkKind;
		/** 2: a second pass over each level's stations, still frames again: the device warm. */
		passes?: 1 | 2;
		/** "busy": frames timed with the GPU kept busy (Benchmark 2); "waited", one at a time (Benchmark 1). */
		measure?: "waited" | "busy";
		/** The render switches to draw with: the editor's, where it has a view. */
		features?: RenderFeatures;
		/**
		 * An A/B run's switch: each station's still frame measured with it on,
		 * off, on and off again, back to back, so warming falls on both alike.
		 */
		ab?: FeatureKey;
		benchmark: number;
		seed: number;
		onProgress: (progress: BenchmarkProgress) => void;
		cancelled: () => boolean;
	}): Promise<BenchmarkResult | null> {
		if (!this.view || this.state.profiling) return null;
		const options = this.options;
		const auto = this.auto;
		this.auto = null;
		const startLevel = this.state.quality.level;
		// A Full sweep: each level at Native, as the level leaves the render
		// scale alone, then each render scale at the level the view was at.
		const sweep = run.kind === "sweep" && !run.ab;
		const levels: { want: number | null; pixels: boolean }[] = sweep
			? [
					...Array.from({ length: TOP_LEVEL }, (_, i) => ({ want: i + 1, pixels: false })),
					{ want: startLevel, pixels: true },
				]
			: [{ want: null, pixels: run.kind === "pixels" && !run.ab }];
		const passes = run.ab || run.kind === "pixels" ? 1 : (run.passes ?? 1);
		const busy = run.measure === "busy";
		const renderWas = this.state.render;
		const base = run.features ?? renderWas.features;
		if (run.features) this.setRender({ ...renderWas, features: run.features });
		const switchedOff = FEATURES.filter((f) => !featureOn(base, f.key)).map((f) => f.label);
		const timeStill = (label: string) =>
			busy ? this.timeBusy(label, 60) : this.timeWaited(label, 60);
		const variants = run.stations.reduce((n, s) => n + s.variants.length, 0) * passes;
		const facts = this.view.deviceFacts();
		const result: BenchmarkResult = {
			benchmark: run.benchmark,
			seed: run.seed,
			kind: run.kind,
			...(passes > 1 ? { passes } : {}),
			...(busy ? { measure: "busy" as const } : {}),
			...(switchedOff.length > 0 ? { switchedOff } : {}),
			settings: {
				...benchmarkSettings(options),
				// What Automatic measured and chose, which a run draws with too.
				...(this.view.setDepthPath
					? { "Depth path, measured": this.depth.chosen ?? "full (not yet measured)" }
					: {}),
				"Light objects, measured": this.lamps.chosen ?? "not yet measured",
			},
			...(run.ab
				? {
						ab: { feature: run.ab, label: FEATURES.find((f) => f.key === run.ab)?.label ?? run.ab },
					}
				: {}),
			release: RELEASES[0]?.version ?? "",
			date: new Date().toISOString(),
			renderer: this.view.backend,
			...(this.state.fellBack ? { fellBack: this.fellBackWhy ?? "no reason given" } : {}),
			gpu: facts.gpu,
			gpuTimers: facts.timers,
			pixelRatio: devicePixelRatio || 1,
			userAgent: navigator.userAgent,
			levels: [],
		};
		let done = 0;
		let lastFrame = Number.NaN;
		const report = (level: string, station: Station | null, variant: string, phase: string) => {
			this.set({ profiling: { phase, done, of: levels.length * variants } });
			run.onProgress({
				level,
				station: station ? `${station.n} ${station.name}${variant ? ` · ${variant}` : ""}` : "",
				phase,
				done,
				of: levels.length * variants,
				frameMs: lastFrame,
			});
		};
		beginStart("Benchmark", `${run.stations.length} stations`);
		try {
			for (const { want, pixels } of levels) {
				if (run.cancelled()) break;
				if (want !== null) {
					this.options = { ...options, antialias: undefined, renderScale: "native" };
					const made: ViewRenderer | null = this.view;
					await this.toLevel(want, true);
					if (this.view !== made) await this.viewSettled();
				}
				const level = this.state.quality.level;
				const label =
					want === null
						? `Level ${level}${auto ? " (Automatic's)" : ""}`
						: `Level ${level}${pixels ? ", each render scale" : ""}`;
				const rows: BenchmarkStationResult[] = [];
				for (const station of run.stations)
					for (const variant of station.variants) {
						if (run.cancelled()) break;
						report(label, station, variant.label, "Building");
						this.setPlace(await variant.place());
						this.pose(station.pose.eye, station.pose.at);
						await this.viewSettled();
						report(label, station, variant.label, "Settling");
						await this.waitedFrames(10, 2000);
						if (variant.settleMs) {
							const until = performance.now() + variant.settleMs;
							while (performance.now() < until && !run.cancelled())
								await this.waitedFrames(1, 1000);
						}
						if (pixels) {
							rows.push(
								await this.pixelCost(station, variant.label, busy, timeStill, run.cancelled, (p) =>
									report(label, station, variant.label, p),
								),
							);
							lastFrame = rows[rows.length - 1].still.median;
							done++;
							continue;
						}
						if (run.ab) {
							const on: Timed[] = [];
							const off: Timed[] = [];
							for (const turn of [true, false, true, false]) {
								if (run.cancelled()) break;
								this.setRender({
									...this.state.render,
									features: { ...base, [run.ab]: turn },
								});
								await this.viewSettled();
								await this.waitedFrames(10, 2000);
								// No time beside it while it measures: the last was the switch's other way.
								lastFrame = Number.NaN;
								report(
									label,
									station,
									variant.label,
									turn ? "Measuring, switch on" : "Measuring, switch off",
								);
								const timed = await timeStill(station.name);
								(turn ? on : off).push(timed);
								lastFrame = timed.median;
								report(label, station, variant.label, turn ? "Switch on" : "Switch off");
							}
							this.setRender({ ...this.state.render, features: base });
							if (on.length === 2 && off.length === 2)
								rows.push({
									n: station.n,
									id: station.id,
									name: station.name,
									variant: variant.label,
									still: on[0],
									ab: { on, off },
									gpu: [],
									gpuTotal: { median: Number.NaN, p95: Number.NaN },
									moving: [],
									counts: this.benchCounts(),
								});
							done++;
							continue;
						}
						// Dynamic starts each station afresh: Native, no savings taken.
						this.resetDynamic();
						report(label, station, variant.label, "Still");
						const still = await timeStill(station.name);
						lastFrame = still.median;
						report(label, station, variant.label, "Stages");
						if (!this.view) break;
						const gpuFrames = await this.stageFrames(busy);
						report(
							label,
							station,
							variant.label,
							station.allMotions ? "Each control's motion" : "Orbit",
						);
						const moving = await this.timeMoving(
							(name) => report(label, station, variant.label, name),
							station.allMotions ? undefined : ["Orbit drag"],
							busy,
						);
						rows.push({
							n: station.n,
							id: station.id,
							name: station.name,
							variant: variant.label,
							still,
							gpu: stageRows(gpuFrames, busy ? steady : undefined),
							gpuTotal: stagesTotal(gpuFrames, busy ? steady : undefined),
							moving,
							counts: this.benchCounts(),
						});
						done++;
					}
				// Again, still frames only, after the whole first pass: what changed
				// between them is mostly the device warming: said as the warm pass.
				if (passes > 1 && !pixels) {
					let i = 0;
					for (const station of run.stations)
						for (const variant of station.variants) {
							const row = rows[i++];
							if (run.cancelled() || !row) break;
							report(label, station, variant.label, "Again");
							this.setPlace(await variant.place());
							this.pose(station.pose.eye, station.pose.at);
							await this.viewSettled();
							await this.waitedFrames(10, 2000);
							if (variant.settleMs) {
								const until = performance.now() + variant.settleMs;
								while (performance.now() < until && !run.cancelled())
									await this.waitedFrames(1, 1000);
							}
							row.repeat = await timeStill(station.name);
							done++;
						}
				}
				result.levels.push({
					label,
					level,
					canvas: { ...this.drawn },
					antialias: this.view ? antialiasInfo(this.view.antialias).label : "",
					stations: rows,
					...(sweep && pixels ? { pixels: true as const } : {}),
				});
			}
		} finally {
			endStart(run.cancelled() ? "Benchmark stopped" : "Benchmark finished");
			this.set({ profiling: null });
			this.view?.setProbe(null);
			this.options = options;
			this.auto = auto;
			if (levels.some((l) => l.pixels) || sweep) this.fit();
			if (this.state.render.features !== renderWas.features) this.setRender(renderWas);
			if (levels[0].want !== null && this.state.quality.level !== startLevel)
				await this.toLevel(startLevel, false);
		}
		if (run.cancelled()) result.cancelled = true;
		return result;
	}

	/** The place's meshes, unions and images not in the view now. */
	private assetGaps(): AssetGaps {
		return {
			meshes: this.tally.gap("mesh:"),
			unions: this.tally.gap("union:"),
			images: this.tally.gap("image:"),
		};
	}

	/** What the view draws now, for a benchmark station's row. */
	private benchCounts(): BenchmarkStationResult["counts"] {
		const stats = this.view?.stats();
		const gaps = this.assetGaps();
		const missing = gaps.meshes.missing + gaps.unions.missing + gaps.images.missing;
		return {
			draws: stats?.draws ?? 0,
			instances: stats?.instances ?? 0,
			triangles: stats?.triangles ?? 0,
			particles: stats?.particles ?? 0,
			beams: stats?.beams ?? 0,
			...(missing > 0 ? { assets: gaps } : {}),
			...(stats?.memory ? { memory: stats.memory } : {}),
			...(this.dynamicState() ? { dynamic: this.dynamicState()! } : {}),
		};
	}

	/** The GPU's stages for 30 frames, as the benchmark times them. */
	private async stageFrames(busy: boolean): Promise<StageFrame[]> {
		const view = this.view;
		if (!view) return [];
		const gpuFrames: StageFrame[] = [];
		view.setProfiling(
			() => {},
			(each) => gpuFrames.push(each),
		);
		if (busy) await this.busyFrames(30);
		else await this.waitedFrames(30, PROFILE_BUDGET);
		await view.settled();
		await new Promise((r) => setTimeout(r, 50));
		view.setProfiling(null);
		return gpuFrames;
	}

	/**
	 * A Pixel cost run's station: its still frame at each of PIXEL_SCALES the
	 * screen has (a 1x screen stops at 100%), shaded and as the parts' depth
	 * alone, with the GPU's stages, so the time a pixel adds can be fitted
	 * apart from what a frame costs however few it has (see pixelFit).
	 */
	private async pixelCost(
		station: Station,
		variant: string,
		busy: boolean,
		timeStill: (label: string) => Promise<Timed>,
		cancelled: () => boolean,
		phase: (name: string) => void,
	): Promise<BenchmarkStationResult> {
		const native = Math.min(2, devicePixelRatio || 1);
		const asked = this.options;
		const points: PixelPoint[] = [];
		const sizes = new Set<string>();
		try {
			for (const want of PIXEL_SCALES) {
				if (cancelled() || !this.view) break;
				const scale = Math.min(native, want);
				this.options = { ...asked, renderScale: scale };
				this.fit();
				const { width, height } = this.drawn;
				if (sizes.has(`${width}x${height}`)) continue;
				sizes.add(`${width}x${height}`);
				await this.waitedFrames(10, 2000);
				phase(`${Math.round(scale * 100)}%, shaded`);
				const still = await timeStill(station.name);
				const gpuFrames = await this.stageFrames(busy);
				let depthOnly: Timed | undefined;
				if (this.view?.setProbe("depth")) {
					phase(`${Math.round(scale * 100)}%, depth only`);
					await this.waitedFrames(3, 1000);
					depthOnly = await timeStill(station.name);
					this.view?.setProbe(null);
				}
				points.push({
					scale,
					width,
					height,
					still,
					...(depthOnly ? { depthOnly } : {}),
					gpu: stageRows(gpuFrames, busy ? steady : undefined),
					gpuTotal: stagesTotal(gpuFrames, busy ? steady : undefined),
				});
			}
		} finally {
			this.view?.setProbe(null);
			this.options = asked;
			this.fit();
		}
		const top = points[points.length - 1];
		return {
			n: station.n,
			id: station.id,
			name: station.name,
			variant,
			still: top?.still ?? { label: station.name, median: Number.NaN, p95: Number.NaN },
			gpu: top?.gpu ?? [],
			gpuTotal: top?.gpuTotal ?? { median: Number.NaN, p95: Number.NaN },
			moving: [],
			counts: this.benchCounts(),
			pixels: points,
		};
	}

	private async toLevel(level: number, reset: boolean): Promise<void> {
		const q = qualityLevel(level);
		this.set({ quality: { level: q.level, auto: this.auto !== null } });
		if (reset)
			this.setRender({
				...this.state.render,
				preset: levelPreset(q.level),
				features: this.levelFeatures(q),
			});
		const view = this.view;
		if (!view) return;
		// The level's antialiasing and shadow map size, in place where they can
		// be: a view built again sends every asset to the GPU once more.
		const aa = this.antialiasMode();
		if (view.antialias !== aa && !view.setAntialias(aa)) {
			await this.restartView();
			return;
		}
		view.setShadowMap(this.shadowMapFor(q));
		view.setQuality(this.viewQualityFor(q, this.pixelRatio()));
		this.fit();
		this.redraw();
	}

	/**
	 * One frame for Automatic: what it cost the GPU where the browser times
	 * it, otherwise how long it took, in a run of frames. It waits while a
	 * profile runs and while the switches are not the level's own.
	 */
	private autoStep(
		run: boolean,
		interval: number,
		gpu: { shadows: number; scene: number; post: number } | null | undefined,
	): void {
		const auto = this.auto;
		if (!auto || this.state.profiling || this.starting) return;
		// Dynamic moves first: the level only once it is at either end of its steps.
		if (this.options.renderScale === "dynamic" && !this.dynamic.atEnd()) return;
		// And Dynamic optimization's savings before the level.
		if (this.options.dynamicOptimization && this.savings.taken > 0 && !this.savings.full()) return;
		const render = this.state.render;
		if (presetLevel(render.preset) !== auto.level) return;
		if (changedFrom(render.features, this.levelFeatures(this.level())).length > 0) return;
		const gpuMs = gpu ? gpu.shadows + gpu.scene + gpu.post : Number.NaN;
		const ms = !run ? 0 : Number.isFinite(gpuMs) && gpuMs > 0 ? gpuMs : interval;
		const next = auto.frame(ms);
		if (next !== null) void this.toLevel(next, true);
	}

	/**
	 * Canvas pixels to a CSS pixel: the render scale's share of the page's
	 * pixels, never past the screen's own (at most 2, as a phone's 3 costs
	 * more than it shows).
	 */
	private pixelRatio(): number {
		const native = Math.min(2, devicePixelRatio || 1);
		const setting = this.options.renderScale ?? "native";
		if (setting === "dynamic") return native * this.dynamic.share() * this.resolutionScale;
		return Math.min(native, setting === "native" ? native : setting) * this.resolutionScale;
	}

	/** The size the place is drawn at: the canvas's, unless it is upscaled. */
	private drawn = { width: 0, height: 0 };
	private upKey = "";

	private fit(): void {
		const { view, canvas, els } = this;
		if (!view || !canvas || !els) return;
		const dpr = this.pixelRatio();
		const w = Math.max(1, Math.round(els.holder.clientWidth * dpr));
		const h = Math.max(1, Math.round(els.holder.clientHeight * dpr));
		// Upscaled: the canvas the screen's own pixels, the place drawn at w x h into it.
		const native = Math.min(2, devicePixelRatio || 1);
		// Dynamic's steps are gathered back up to the screen's pixels while still.
		const asked = this.options.upscale ?? "off";
		const mode = asked === "off" && this.options.renderScale === "dynamic" ? "still" : asked;
		const out =
			mode !== "off" && view.setUpscale && dpr < native - 1e-3
				? {
						width: Math.max(1, Math.round(els.holder.clientWidth * native)),
						height: Math.max(1, Math.round(els.holder.clientHeight * native)),
					}
				: null;
		const cw = out?.width ?? w;
		const ch = out?.height ?? h;
		const upKey = out ? `${mode} ${cw}x${ch}` : "";
		if (
			canvas.width !== cw ||
			canvas.height !== ch ||
			this.drawn.width !== w ||
			this.drawn.height !== h ||
			this.upKey !== upKey
		) {
			canvas.width = cw;
			canvas.height = ch;
			// The glow sized for the screen at this scale: see ViewQuality.glowCoarse.
			view.setQuality(this.viewQualityFor(this.level(), dpr));
			view.resize(w, h);
			// Another size: the depth paths and light resolutions compare afresh.
			this.depth.reset();
			this.lamps.reset();
			this.applyLampMode();
			view.setUpscale?.(out, out ? mode : "off");
			this.drawn = { width: w, height: h };
			this.upKey = upKey;
		}
		this.redraw();
	}

	/** Draws at the next frame, once however many things asked. */
	/** The frame asked for is only the view's own animation's: see redraw. */
	private stillNext = false;
	/** The display's refresh, seen from the frames drawn: see pacing.ts. */
	private refresh = new RefreshMeter();
	/** Render scale Dynamic's step: see dynamicScale.ts. */
	private dynamic = new DynamicScale();

	/** Dynamic optimization's savings: see dynamicScale.ts. */
	private savings = new DynamicSavings();
	/** Automatic's depth path, measured in use: see depthChoice.ts. */
	private depth = new DepthChoice();
	/** Light objects' resolution, measured in use where Automatic: see depthChoice.ts. */
	private lamps = new LampChoice();

	/** The view's light objects as the setting, the switch, Dynamic optimization and the measurement say. */
	private applyLampMode(): void {
		this.view?.setLampMode?.(this.lampModeNow());
		this.view?.setSkyMode?.(this.skyModeNow());
		this.view?.setLightGrid?.(lightGridCell(this.options.lightGrid));
		this.view?.setParticleHalf?.(this.options.particleResolution === "half");
		this.view?.setReflectionGrid?.(
			reflectionGrid(
				this.options.reflectionUpdates,
				typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
			),
		);
	}

	/** The sky's share as drawn now: Settings', or half where Dynamic optimization has taken that, never more pixels. */
	private skyModeNow(): "full" | "half" | "quarter" {
		const set = this.options.skyResolution ?? "full";
		return set === "full" && this.savingsNow().sky === "half" ? "half" : set;
	}

	/** How light objects are drawn now: Settings', the switch's, Automatic's, less Dynamic optimization's savings. */
	private lampModeNow(): LampMode {
		const features = this.withSavings(this.state.render).features;
		const mode = lampMode(
			this.options.lampResolution ?? "auto",
			features.fullResLamps,
			this.lamps.chosen,
		);
		return this.savingsNow().lamps === "quarter" ? "quarter" : mode;
	}

	/** What Dynamic optimization's savings come to now; none while it is off. */
	private savingsNow(): ReturnType<typeof savingsCome> {
		return savingsCome(this.options.dynamicOptimization ? this.savings.off() : []);
	}

	/** Whether Automatic is still to measure light objects' resolution now. */
	private measuringLamps(): boolean {
		return (
			(this.options.lampResolution ?? "auto") === "auto" &&
			this.lamps.chosen === null &&
			this.withSavings(this.state.render).features.fullResLamps &&
			(this.place?.lights?.length ?? 0) > 0 &&
			// The depth path first: both alternating at once would always pair lean with half.
			(this.depth.chosen !== null || !this.view?.setDepthPath)
		);
	}

	/** Dynamic and Dynamic optimization back to the start: Native, no savings taken. */
	private resetDynamic(): void {
		const was = this.dynamic.step !== 0 || this.savings.taken !== 0;
		this.dynamic.reset();
		this.savings.reset();
		if (!was) return;
		this.applySavings();
		this.fit();
	}

	/** The savings as they stand, given to the view: its switches, light objects' and bloom's resolutions. */
	private applySavings(): void {
		this.view?.setRender(this.withSavings(this.state.render));
		this.view?.setQuality(this.viewQualityFor(this.level(), this.pixelRatio()));
		this.applyLampMode();
	}

	/**
	 * What costs most at this view: each switch that is on, turned off alone,
	 * and what the frame saves without it; the three that save most. Quicker
	 * than a profile: a dozen frames for each, waited for, and nothing else.
	 */
	async costlyHere(): Promise<
		{ key: keyof RenderFeatures; label: string; saves: number }[] | null
	> {
		if (!this.view || this.state.profiling) return null;
		const render = this.state.render;
		const on = FEATURES.filter((f) => featureOn(render.features, f.key));
		this.set({ profiling: { phase: "As set", done: 0, of: on.length + 1 } });
		const rows: { key: keyof RenderFeatures; label: string; saves: number }[] = [];
		let frame = 0;
		try {
			const asSet = await this.timeWaited("As set", 12);
			frame = asSet.median;
			for (const [i, info] of on.entries()) {
				this.set({ profiling: { phase: `Without ${info.label}`, done: i + 1, of: on.length + 1 } });
				this.setRender({ ...render, features: { ...render.features, [info.key]: false } });
				const timed = await this.timeWaited(info.label, 12);
				rows.push({ key: info.key, label: info.label, saves: asSet.median - timed.median });
			}
		} finally {
			this.setRender(render);
			this.set({ profiling: null });
		}
		return (
			rows
				// Above the frames' own spread: 0.2 ms, and a twentieth of the frame.
				.filter((row) => row.saves > Math.max(0.2, frame * 0.05))
				.sort((a, b) => b.saves - a.saves)
				.slice(0, 3)
		);
	}

	/** The pixel probe armed, so a tap on the view probes; or put away, with what it found. */
	armProbe(on: boolean): void {
		this.set({ probe: { armed: on, result: on ? this.state.probe.result : null } });
		this.view?.setOverlay(this.overlayLines());
		this.redraw();
	}

	/** What is at a point on the view, in client pixels: the probe's answer, and its mark there. */
	private probeHere(clientX: number, clientY: number): void {
		const canvas = this.canvas;
		const place = this.place;
		if (!canvas || !place) return;
		const box = canvas.getBoundingClientRect();
		const found = probeAt(
			place,
			this.eye(),
			this.rayAt(clientX - box.left, clientY - box.top, box),
			place.lighting?.sun ?? [0, 1, 0],
		);
		const result = found ? { ...found, ...this.rowName(found.row) } : null;
		this.set({ probe: { armed: true, result } });
		this.view?.setOverlay(this.overlayLines());
		this.redraw();
	}

	/** The probe's mark: a cross on the face it found, and its normal, sized to how far away it is. */
	private probeLines(): number[] {
		const found = this.state.probe.result;
		if (!found) return [];
		const lines = new Lines([1, 0.35, 0.95]);
		const n = found.normal;
		const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
		const u = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
		const ul = Math.hypot(u[0], u[1], u[2]) || 1;
		const t = u.map((x) => x / ul);
		const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
		const s = Math.max(0.15, found.distance * 0.02);
		const at = (v: number[], k: number) => found.point.map((p, i) => p + v[i] * k);
		lines.line(at(t, -s), at(t, s));
		lines.line(at(b, -s), at(b, s));
		lines.line(found.point, at(n, s * 2));
		return lines.out;
	}

	/**
	 * What Automatic measured and chose in this place, for the Rendering
	 * panel's Inspect tab: the renderer, the level, the depth path, light
	 * objects' resolution and Dynamic, with the times behind them.
	 */
	automaticChoices(): AutomaticChoices {
		const setting = this.options.lampResolution ?? "auto";
		return {
			backend: this.view?.backend ?? null,
			fellBackWhy: this.fellBackWhy,
			quality: this.state.quality,
			depth: this.view?.setDepthPath
				? { chosen: this.depth.chosen, medians: this.depth.medians() }
				: null,
			lamps: {
				setting,
				lights: this.place?.lights?.length ?? 0,
				mode: this.lampModeNow(),
				chosen: this.lamps.chosen,
				medians: this.lamps.medians(),
			},
			dynamic: this.dynamicState(),
		};
	}

	/** Where Dynamic and Dynamic optimization stand, for a benchmark station's report; null with both off. */
	private dynamicState(): { share: number; savings: string[] } | null {
		const scale = this.options.renderScale === "dynamic";
		const optimizing = this.options.dynamicOptimization === true;
		if (!scale && !optimizing) return null;
		return {
			share: scale ? this.dynamic.share() : 1,
			savings: optimizing ? [...this.savings.off()] : [],
		};
	}

	/** The render settings as the view draws them: less the savings Dynamic optimization has taken. */
	private withSavings(render: RenderSettings): RenderSettings {
		const off = (this.options.dynamicOptimization ? this.savings.off() : []).filter(isFeatureKey);
		if (off.length === 0) return render;
		return {
			...render,
			features: { ...render.features, ...Object.fromEntries(off.map((k) => [k, false])) },
		};
	}

	/**
	 * A moving frame's time for Dynamic optimization and Dynamic's render
	 * scale, against the time a frame has. The savings go first; the scale
	 * goes down only once they are all taken, and they are given back only
	 * once it is back at the screen's own pixels.
	 */
	private dynamicFrame(now: number, ms: number, timed: boolean): void {
		const rate = this.options.frameRate;
		const refresh = this.refresh.period();
		const budget =
			typeof rate === "number"
				? Math.max(refresh, 1000 / rate)
				: rate === "steady" && this.steady.halved
					? refresh * 2
					: refresh;
		const optimizing = this.options.dynamicOptimization === true;
		if (optimizing && this.savings.frame(now, ms, budget, timed, this.dynamic.step === 0)) {
			this.applySavings();
			this.redraw();
			return;
		}
		if (this.options.renderScale !== "dynamic") return;
		if (optimizing && !this.savings.full()) return;
		if (this.dynamic.frame(now, ms, budget, timed)) this.fit();
	}

	/** A frame rate's cap, keeping its average: see pacing.ts. */
	private cap = new FrameCap();
	/** Display frames let go by since the last still frame, while halved. */
	private stillSkipped = 0;
	/** Steady's halving: see pacing.ts. */
	private steady = new SteadyVsync();

	/**
	 * The next frame: the display's, or when the rate is Unlimited, as soon as
	 * the GPU has finished the frame before last, so two are in flight at most.
	 * Not waiting let frames queue up faster than the GPU drew them, and the
	 * view lagged a third of a second behind the pointer.
	 */
	private nextFrame(run: (now: number) => void): void {
		if (this.options.frameRate !== "unlimited") {
			requestAnimationFrame(run);
			return;
		}
		this.inFlight[0].then(
			() => asap(run),
			() => asap(run),
		);
	}

	/** The GPU's work for the frame before last and the last, under Unlimited. */
	private inFlight: [Promise<void>, Promise<void>] = [Promise.resolve(), Promise.resolve()];

	/**
	 * Draws at the next frame, once however many things asked. `still`: only
	 * the view's own animation asked (still-frame TAA's average, beams), so
	 * the frame shows what the last did.
	 */
	private redraw(still = false): void {
		if (!still) this.stillNext = false;
		if (this.pending || !this.view || this.suspended) return;
		this.pending = true;
		this.stillNext = still;
		this.wantedAt = performance.now();
		const draw = (now: number) => {
			if (!this.view) {
				this.pending = false;
				return;
			}
			// Capped, or Steady halved: not yet this frame's turn, so the next one is asked again.
			const rate = this.options.frameRate;
			if (
				(typeof rate === "number" && !this.cap.allows(now, rate)) ||
				(rate === "steady" && !this.steady.allows(now))
			) {
				this.nextFrame(draw);
				return;
			}
			// Asked for by the view's own animation alone, the camera still:
			// one display frame in two, three or four, as Particle animation rate says.
			// Counted in display frames, not timed against the refresh, which
			// is measured from the frames drawn: halving them doubled it.
			const still = this.stillNext;
			const skip = still
				? stillSkip(
						this.options.stillFrames,
						typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
					)
				: 0;
			if (this.stillSkipped < skip) {
				this.stillSkipped++;
				this.nextFrame(draw);
				return;
			}
			this.stillSkipped = 0;
			this.pending = false;
			const started = performance.now();
			// A still frame drawn after some went by: its gap is not the refresh's measure.
			const gap = this.refresh.drawn(now, skip === 0);
			// Moving: drawn one after another, for the camera or the place, not a still frame.
			const moving = !still && gap < this.refresh.period() * 4;
			// WebGPU says when the GPU is done with the frame: how much room is left.
			const timed = this.view.backend === "WebGPU";
			// Automatic's depth path, measured on moving frames: see depthChoice.ts.
			const depthPath =
				timed && moving && this.depth.chosen === null && this.view.setDepthPath
					? this.depth.next()
					: null;
			if (depthPath) this.view.setDepthPath?.(depthPath);
			// WebGL2 is timed for this alone, by a fence (gpuDone).
			const lampTimed = timed || this.view.gpuDone !== undefined;
			const lampWay =
				lampTimed && moving && !depthPath && this.view.setLampMode && this.measuringLamps()
					? this.lamps.next()
					: null;
			if (lampWay) this.view.setLampMode?.(lampWay);
			this.drawOnce(now);
			// A frame drawn while its pipelines were still being built is slow for that alone.
			const generic = this.view.genericFrame === true;
			if (rate === "steady") this.steady.drawn(now, timed);
			const dynamic =
				this.options.renderScale === "dynamic" || this.options.dynamicOptimization === true;
			if (timed && (rate === "steady" || (dynamic && moving) || depthPath || lampWay)) {
				const steady = this.steady;
				void this.view.settled().then(() => {
					const ms = performance.now() - started;
					if (rate === "steady") steady.worked(ms);
					if (dynamic && moving) this.dynamicFrame(now, ms, true);
					if (depthPath) {
						this.depth.record(depthPath, ms);
						if (this.depth.chosen) this.view?.setDepthPath?.(this.depth.chosen);
					}
					if (lampWay && !generic) {
						this.lamps.record(lampWay, ms);
						if (this.lamps.chosen) this.applyLampMode();
					}
				});
			}
			if (!timed && lampWay && this.view.gpuDone) {
				void this.view.gpuDone().then(() => {
					if (generic) return;
					this.lamps.record(lampWay, performance.now() - started);
					if (this.lamps.chosen) this.applyLampMode();
				});
			}
			if (!timed && dynamic && moving) this.dynamicFrame(now, gap, false);
			if (rate === "unlimited") this.inFlight = [this.inFlight[1], this.view.settled()];
			this.countFrame(now);
			this.showRotation();
			// Beams and particles that move keep the view drawing, at the frame
			// rate's pace, until nothing moves, the Rendering panel turns them
			// off, or the tab is hidden; shown again, it carries on.
			// Not while a profile runs: its frames are timed one at a time, alone.
			if (this.view.animates() && !document.hidden && !this.state.profiling) this.redraw(true);
		};
		this.nextFrame(draw);
	}

	/** One frame: the handles and gizmos where the camera is, the place, and its time in the graph. */
	private drawOnce(now: number): void {
		const view = this.view;
		if (!view) return;
		const camera = this.camera();
		if ((showsHandles(this.state.tool) || this.state.pivotEdit) && this.selection.length > 0)
			this.drawHandles(camera.eye);
		this.followGizmos(camera.eye);
		// The GPU's times only as often as they are read: every frame for a
		// benchmark, a profile or the Performance panel's graph; Automatic's
		// level, which adds up time over many frames, from one in a few.
		view.setTimers?.(
			this.state.profiling !== null || this.frameWatchers > 0
				? "every"
				: this.auto !== null
					? "sampled"
					: "off",
		);
		view.draw(camera, this.stillNext);
		this.stillNext = false;
		this.drawPivot();
		this.frames.push(now);
		this.recordFrame(now);
		if (this.firstFrameLog) {
			this.firstFrameLog = false;
			logStep("First frame drawn");
			// A page that freezes before this leaves its start unfinished, which the next one reports.
			setTimeout(() => {
				if (!this.warmAhead) endStart("Settled");
			}, 10_000);
		}
	}

	/**
	 * Frames drawn one at a time, each waited for until the GPU has finished
	 * it: from the start of drawing it to the end of the wait is what the frame
	 * costs, with nothing left over from the frame before. Up to `n`, fewer on
	 * a slow device, which stops after `budget` milliseconds.
	 */
	private async waitedFrames(
		n: number,
		budget: number,
		before?: (frame: number) => void,
		after?: () => void,
	): Promise<number[]> {
		const times: number[] = [];
		const from = performance.now();
		for (let i = 0; i < n; i++) {
			const view = this.view;
			if (!view) break;
			before?.(i);
			const start = performance.now();
			this.drawOnce(start);
			await view.finished();
			times.push(performance.now() - start);
			after?.();
			if (times.length >= PROFILE_FEWEST && performance.now() - from > budget) break;
			// The page's turn, between frames: the progress shows, and nothing waits on this.
			await new Promise((r) => setTimeout(r, 0));
		}
		return times;
	}

	/** What one frame costs at whatever is set now: a few to settle, then up to `n` timed. */
	private async timeWaited(label: string, n: number): Promise<Timed> {
		// The pipelines for these switches, not the ones drawing while they compile.
		await this.view?.pipelinesReady();
		await this.waitedFrames(3, 400);
		// The GPU's own time beside the waited one, where it has timers; the CPU's for each frame.
		const view = this.view;
		const gpu: number[] = [];
		const cpu: number[] = [];
		const effects: number[] = [];
		const culling: number[] = [];
		view?.setProfiling(null, (f) => gpu.push(Object.values(f).reduce((a, b) => a + (b ?? 0), 0)));
		const times = await this.waitedFrames(n, PROFILE_BUDGET, undefined, () => {
			const s = this.view?.stats();
			if (!s) return;
			cpu.push(s.cpu);
			if (s.cpuSteps) {
				effects.push(s.cpuSteps.effects);
				culling.push(s.cpuSteps.culling);
			}
		});
		view?.setProfiling(null);
		return {
			label,
			...spread(times),
			...(gpu.length >= Math.min(5, n) ? { gpuMs: spread(gpu).median } : {}),
			...(cpu.length > 0 ? { cpuMs: spread(cpu).median } : {}),
			...(effects.length > 0
				? { cpuSteps: { effects: spread(effects).median, culling: spread(culling).median } }
				: {}),
		};
	}

	/**
	 * Frames the profile counts on screen: drawn at the display's pace, as
	 * the view is, each one's time since the last noted.
	 */
	private counting: {
		left: number;
		last: number;
		/** When the first frame was drawn, and how long it may go on past its fewest. */
		from: number;
		budget: number;
		times: number[];
		done: () => void;
	} | null = null;

	private countFrame(now: number): void {
		const c = this.counting;
		if (!c) return;
		if (c.last > 0) c.times.push(now - c.last);
		else c.from = now;
		c.last = now;
		c.left--;
		// A slow device stops at its budget, once it has enough frames to go on.
		const spent = c.times.length >= PROFILE_FEWEST && now - c.from > c.budget;
		if (c.left > 0 && !spent) this.redraw();
		else {
			this.counting = null;
			c.done();
		}
	}

	/**
	 * Draws up to `n` frames back to back, and the times between them: fewer
	 * on a slow device, which stops after `budget` milliseconds.
	 */
	private drawFrames(n: number, budget = Number.POSITIVE_INFINITY): Promise<number[]> {
		return new Promise((resolve) => {
			const c = {
				left: n + 1,
				last: 0,
				from: 0,
				budget,
				times: [] as number[],
				done: () => resolve(c.times),
			};
			this.counting = c;
			this.redraw();
			// The view closed, or stopped drawing: what was timed is what there is.
			setTimeout(() => {
				if (this.counting !== c) return;
				this.counting = null;
				resolve(c.times);
			}, 30000);
		});
	}

	/** The frame on screen, at the display's pace: a few frames to settle, then up to `n` timed. */
	private async timeFrames(label: string, n: number): Promise<Timed> {
		await this.drawFrames(4, 400);
		const times = await this.drawFrames(n, PROFILE_BUDGET);
		return { label, ...spread(times) };
	}

	/**
	 * Profiles the view: the free-running frame, each stage of it with the GPU
	 * waited for at the end of each (see `profile.ts`), the Rendering panel's
	 * steps added one at a time, and the frame at a half and a quarter of the
	 * pixels. Everything changed is put back, however it ends.
	 */
	async runProfile(): Promise<ProfileResult | null> {
		const view = this.view;
		const canvas = this.canvas;
		if (!view || !canvas || this.state.profiling) return null;
		const render = this.state.render;
		const options = this.options;
		const pixels = { ...this.drawn };
		// Its size on the page, before the antialiasing sweep replaces the canvas.
		const box = canvas.getBoundingClientRect();
		// Before the resolution sweep changes it: Settings' scale, as it comes to here.
		const renderScale = `${options.renderScale === "dynamic" ? "Dynamic, " : ""}${Math.round(this.pixelRatio() * 100)}% of the page's pixels (native ${Math.round(Math.min(2, devicePixelRatio || 1) * 100)}%)${this.upKey ? `, upscaled ${options.upscale === "always" ? "always" : "when still"} to ${canvas.width}×${canvas.height}` : ""}`;
		const steps = RENDER_STEPS.length;
		// The level and the camera the profile began from, for its head.
		const startQ = this.state.quality;
		const startedAt = `${startQ.auto ? "Automatic, " : ""}Level ${startQ.level}${
			changedFrom(render.features, this.levelFeatures(qualityLevel(startQ.level))).length > 0
				? ", switches changed by hand"
				: ""
		}`;
		const round = (v: number) => (Math.round(v * 10) / 10).toString();
		const eye = this.eye();
		const camera = `eye (${eye.map(round).join(", ")}) · looking at (${this.cam.target.map(round).join(", ")}) · ${round(this.cam.dist)} studs out`;
		// The switches turned off one at a time: those of these groups that are on.
		const alone = WITHOUT_GROUPS.map((title) => ({
			title,
			features: (FEATURE_GROUPS.find((g) => g.title === title)?.features ?? []).filter(
				(info) => render.features[info.key],
			),
		}));
		const total =
			1 +
			1 +
			3 +
			1 +
			1 +
			(steps + 1) +
			3 +
			view.antialiasModes().length +
			(view.setDepthPath
				? view.antialiasModes().filter((m) => antialiasInfo(m).samples > 1).length
				: 0) +
			TOP_LEVEL +
			alone.reduce((n, g) => n + g.features.length, 0) +
			(view.setDepthPath ? 2 : 0) +
			(view.deviceFacts().half ? 2 : 0) +
			5;
		// The level drawn at, and Automatic's steps, put back after the quality sweep.
		const level = this.state.quality.level;
		const auto = this.auto;
		let done = 0;
		const phase = (name: string) =>
			this.set({ profiling: { phase: name, done: done++, of: total } });
		let result: ProfileResult | null = null;
		try {
			phase("On screen");
			const baseline = await this.timeFrames("On screen", 60);
			phase("One frame");
			const frame = await this.timeWaited("One frame", 40);
			// The base: the frame with nothing drawn, the parts' depth alone, and
			// the parts shaded with every feature off.
			const baseRows: Timed[] = [];
			this.setRender({ ...render, mode: "lit", features: upToStep(0) });
			for (const [probe, label] of [
				["empty", "Empty frame"],
				["depth", "Parts' depth only"],
				[null, "Parts, shaded"],
			] as const) {
				phase(label);
				if (!view.setProbe(probe)) {
					baseRows.push({ label, median: Number.NaN, p95: Number.NaN });
					continue;
				}
				baseRows.push(await this.timeWaited(label, 30));
			}
			view.setProbe(null);
			this.setRender(render);
			phase("Stages");
			const frames: StageFrame[] = [];
			const gpuFrames: StageFrame[] = [];
			view.setProfiling(
				(each) => frames.push(each),
				(each) => gpuFrames.push(each),
			);
			await this.waitedFrames(60, PROFILE_BUDGET * 2);
			view.setProfiling(null);
			// WebGPU's last stages are timed when its queue says they are done.
			await view.settled();
			await new Promise((r) => setTimeout(r, 50));
			const timedSteps: Timed[] = [];
			for (let n = 0; n <= steps; n++) {
				const label = n === 0 ? "Parts, nothing else" : `+ ${RENDER_STEPS[n - 1][0]}`;
				phase(`Step ${n} of ${steps}`);
				// Only the switches the view has on: the last step is the view as
				// set, not every switch there is (Level 21's).
				const upTo = upToStep(n);
				const features = Object.fromEntries(
					FEATURES.map((i) => [i.key, upTo[i.key] && render.features[i.key]]),
				) as unknown as RenderFeatures;
				this.setRender({ ...render, mode: "lit", features });
				timedSteps.push(await this.timeWaited(label, 30));
			}
			this.setRender(render);
			// Each switch of these groups turned off alone, from the view as it is:
			// what the frame saves without it.
			const without: ProfileResult["without"] = [];
			// Measured again just before: a frame that drifts over the profile
			// -- a slow device warming, effects building up -- is compared with
			// itself as it is now, not as it was at the start.
			let asSet: Timed | null = null;
			if (alone.some((g) => g.features.length > 0)) {
				phase("As set");
				asSet = await this.timeWaited("As set", 30);
			}
			for (const group of alone) {
				const rows: ProfileResult["without"][number]["rows"] = [];
				for (const info of group.features) {
					phase(`Without ${info.label}`);
					this.setRender({ ...render, features: { ...render.features, [info.key]: false } });
					const timed = await this.timeWaited(info.label, 30);
					rows.push({ ...timed, saves: (asSet?.median ?? frame.median) - timed.median });
				}
				if (rows.length > 0) without.push({ title: group.title, rows });
			}
			this.setRender(render);
			// The depth path: the parts' depth first, then shaded once; or shaded
			// and depth-tested in one draw, as a tile-based GPU wants.
			const depthPath: Timed[] = [];
			if (view.setDepthPath) {
				for (const [path, label] of [
					["full", "Full depth pre-pass"],
					["lean", "Lean, for tile GPUs"],
				] as const) {
					phase(label);
					view.setDepthPath(path);
					depthPath.push(await this.timeWaited(label, 30));
				}
				view.setDepthPath("auto");
				// Automatic measures its own again after the profile's.
				this.depth.reset();
				this.lamps.reset();
			}
			const resolution: Timed[] = [];
			for (const scale of [1, 0.5, 0.25]) {
				phase(`Resolution ${Math.round(scale * 100)}%`);
				this.resolutionScale = Math.sqrt(scale);
				this.fit();
				const { width: w, height: h } = this.drawn;
				resolution.push(await this.timeWaited(`${Math.round(scale * 100)}% (${w}×${h})`, 30));
			}
			this.resolutionScale = 1;
			// Before the antialiasing sweep builds the view again: this one's counts and device.
			const stats = view.stats();
			const facts = view.deviceFacts();
			// Antialiasing: the view built again in each mode this device draws,
			// each measured once it has its assets and pipelines, so they compare.
			const antialias: Timed[] = [];
			for (const mode of view.antialiasModes()) {
				const { label } = antialiasInfo(mode);
				phase(`Antialiasing ${label}`);
				this.options = { ...options, antialias: mode };
				await this.restartView();
				await this.viewSettled();
				antialias.push(await this.timeWaited(label, 30));
				// Multisampled, with the parts shaded and depth-tested in one draw too:
				// the depth pre-pass stores every sample's depth between its passes.
				const made = this.view;
				if (antialiasInfo(mode).samples > 1 && made?.setDepthPath) {
					phase(`Antialiasing ${label}, one draw`);
					made.setDepthPath("lean");
					antialias.push(await this.timeWaited(`${label}, one draw`, 30));
					made.setDepthPath("auto");
				}
			}
			this.options = options;
			if (this.view?.antialias !== this.antialiasMode()) {
				await this.restartView();
				await this.viewSettled();
			}
			// Precision: WebGPU's shader in half, then full, where the device has half.
			const precision: Timed[] = [];
			if (view.deviceFacts().half) {
				for (const [half, label] of [
					[true, "Half precision"],
					[false, "Full precision"],
				] as const) {
					phase(label);
					this.options = { ...options, half };
					await this.restartView();
					await this.viewSettled();
					precision.push(await this.timeWaited(label, 30));
				}
				this.options = options;
				await this.restartView();
				await this.viewSettled();
			}
			// The camera moving, as the view is set.
			const moving = await this.timeMoving(phase);
			// Quality: each level as Settings would set it, its own scale and
			// antialiasing too, from Level 1 up, so the view is made again only
			// where a level's samples or shadow maps change. Then back.
			const quality: LevelRow[] = [];
			this.auto = null;
			this.options = { ...options, antialias: undefined, renderScale: "native" };
			for (let n = 1; n <= TOP_LEVEL; n++) {
				phase(`Quality ${n}`);
				const made = this.view;
				await this.toLevel(n, true);
				if (this.view !== made) await this.viewSettled();
				quality.push(await this.timeLevel(n));
			}
			this.options = options;
			this.auto = auto;
			this.setRender(render);
			await this.toLevel(level, false);
			await this.viewSettled();
			result = {
				facts: {
					renderer: view.backend,
					gpu: facts.gpu,
					gpuTimers: facts.timers,
					canvas: pixels,
					css: { width: Math.round(box.width), height: Math.round(box.height) },
					pixelRatio: devicePixelRatio || 1,
					samples: facts.samples,
					frameRate: String(options.frameRate),
					renderScale,
					depthPath: view.leanDepth ? (view.leanDepth() ? "lean" : "full") : "",
					quality: startedAt,
					assets: this.assetGaps(),
					...(stats.memory ? { memory: stats.memory } : {}),
					antialias: antialiasInfo(view.antialias).label,
					camera,
					draws: stats.draws,
					instances: stats.instances,
					triangles: stats.triangles,
					beams: stats.beams,
					particles: stats.particles,
					userAgent: navigator.userAgent,
					version: RELEASES[0]?.version ?? "",
				},
				baseline,
				frame,
				stages: stageRows(frames),
				stageTotal: stagesTotal(frames),
				gpuStages: stageRows(gpuFrames),
				gpuStageTotal: stagesTotal(gpuFrames),
				stageFrames: frames.length,
				steps: timedSteps,
				base: baseRows,
				without,
				asSet,
				resolution,
				depthPath,
				precision,
				moving,
				antialias,
				quality,
				clock: clockStep(),
			};
		} finally {
			// The view as it is now: the antialiasing sweep builds it again.
			this.view?.setProfiling(null);
			this.view?.setProbe(null);
			this.options = options;
			this.counting = null;
			this.resolutionScale = 1;
			this.auto = auto;
			this.setRender(render);
			// A sweep cut short: back to the level it started at.
			if (this.state.quality.level !== level) void this.toLevel(level, false);
			this.fit();
			this.set({ profiling: null, ...(result ? { profile: result } : {}) });
		}
		return result;
	}

	/** The Performance panel's frame-time graph: see `frameGraph.ts`. */
	private history = new FrameHistory();
	/** When the frame being waited for was asked for, and when the last was drawn. */
	private wantedAt = 0;
	private drawnAt = Number.NEGATIVE_INFINITY;

	/** A frame drawn, into the graph: a few numbers into a ring, nothing drawn. */
	private recordFrame(now: number): void {
		const stats = this.view?.stats();
		const gpu = stats?.gpu;
		const interval = frameInterval(now, this.drawnAt, this.wantedAt);
		this.autoStep(this.wantedAt - this.drawnAt <= FRAME_RUN, interval, gpu);
		this.drawnAt = now;
		this.history.push({
			interval,
			page: stats?.cpu ?? Number.NaN,
			shadows: gpu?.shadows ?? Number.NaN,
			scene: gpu?.scene ?? Number.NaN,
			post: gpu?.post ?? Number.NaN,
		});
	}

	/** Performance panel graphs showing: the GPU's passes are timed while any is. */
	private frameWatchers = 0;
	/** A graph of the frames is showing until the returned function is called. */
	watchFrames(): () => void {
		this.frameWatchers++;
		this.redraw();
		let done = false;
		return () => {
			if (done) return;
			done = true;
			this.frameWatchers--;
		};
	}

	/** The last frames drawn, for the Performance panel's graph. */
	frameHistory(): FrameHistory {
		return this.history;
	}

	/** While any pointer or key is held, the view draws every frame. */
	private hold(on: boolean): void {
		this.holding = Math.max(0, this.holding + (on ? 1 : -1));
		if (this.holding === 0 || this.looping) return;
		this.looping = true;
		const tick = () => {
			if (this.holding === 0 || !this.view) {
				this.looping = false;
				return;
			}
			this.redraw();
			this.nextFrame(tick);
		};
		this.nextFrame(tick);
	}

	/** Frames drawn in the last second; idle rather than slow when nothing has moved. */
	private showRate(): void {
		const now = performance.now();
		while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift();
		const last = this.frames.at(-1);
		const idle = last === undefined || now - last > 400;
		if (this.corner)
			this.corner.rate.textContent = this.startup
				? startingText(this.startup.backend, this.startup.shaders, this.startup.updated)
				: `${idle ? "Idle" : `${this.frames.length}Hz`} (${this.state.backend ?? "…"})`;
	}

	/**
	 * The camera's rotation as Roblox writes an Orientation: X tilts the view up,
	 * Y turns it left, and this camera never rolls. With no turn it looks down
	 * -Z, as Roblox's does.
	 */
	private showRotation(): void {
		if (!this.corner) return;
		const x = (-this.cam.pitch * 180) / Math.PI;
		let y = ((this.cam.yaw * 180) / Math.PI) % 360;
		if (y > 180) y -= 360;
		if (y <= -180) y += 360;
		// No "-0.0": a turn that rounds to nothing is nothing.
		const deg = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
		this.corner.rotation.textContent = `X ${deg(x)}°  Y ${deg(y)}°  Z 0.0°`;
		if (this.corner.position) this.corner.position.textContent = this.cameraPosition();
		this.drawGizmo();
	}

	/** Where the camera is in the world, in studs, as Roblox writes a Position: "12.3, 4.5, -67.8". */
	private cameraPosition(): string {
		const n = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
		const [x, y, z] = this.eye();
		return `${n(x)}, ${n(y)}, ${n(z)}`;
	}

	/**
	 * The camera, as a report gives it: where it is and which way it looks, so
	 * the view can be put back exactly.
	 */
	cameraText(): string {
		const x = (-this.cam.pitch * 180) / Math.PI;
		let y = ((this.cam.yaw * 180) / Math.PI) % 360;
		if (y > 180) y -= 360;
		if (y <= -180) y += 360;
		return `Camera: position ${this.cameraPosition()}; rotation X ${x.toFixed(1)}°, Y ${y.toFixed(1)}°; ${this.cam.dist.toFixed(1)} studs from what it orbits`;
	}

	/**
	 * The axes, as Blender draws them: where X, Y and Z point from this camera,
	 * the positive ends labelled, the negative ends plainer, nearest on top.
	 */
	private drawGizmo(): void {
		const svg = this.corner?.gizmo.querySelector("svg");
		if (!svg) return;
		const b = this.back();
		const forward = b.map((v) => -v);
		const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
		const up = [
			right[1] * forward[2] - right[2] * forward[1],
			right[2] * forward[0] - right[0] * forward[2],
			right[0] * forward[1] - right[1] * forward[0],
		];
		const R = GIZMO / 2 - 14;
		const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
		const ends = GIZMO_AXES.flatMap((axis) =>
			[1, -1].map((sign) => {
				const d = axis.dir.map((v) => v * sign);
				// Towards the camera is nearer: drawn last.
				return { x: dot(d, right) * R, y: -dot(d, up) * R, depth: -dot(d, forward), axis, sign };
			}),
		).sort((p, q) => p.depth - q.depth);
		svg.innerHTML =
			`<circle class="vp-gizmo-back" r="${GIZMO / 2 - 2}"/>` +
			ends
				.map((e) => {
					const x = e.x.toFixed(1);
					const y = e.y.toFixed(1);
					const id = `${e.sign > 0 ? "+" : "-"}${e.axis.name}`;
					return e.sign > 0
						? `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="${e.axis.col}" stroke-width="2.5" stroke-linecap="round"/>` +
								`<g class="vp-gizmo-end" data-axis="${id}"><circle cx="${x}" cy="${y}" r="9" fill="${e.axis.col}"/><text x="${x}" y="${(e.y + 3.6).toFixed(1)}" text-anchor="middle">${e.axis.name}</text></g>`
						: `<g class="vp-gizmo-end vp-gizmo-neg" data-axis="${id}"><circle cx="${x}" cy="${y}" r="7" fill="${e.axis.dark}" stroke="${e.axis.col}" stroke-width="1.5"/><text x="${x}" y="${(e.y + 3.2).toFixed(1)}" text-anchor="middle">−${e.axis.name}</text></g>`;
				})
				.join("");
	}

	/**
	 * The chosen tool's handles round the selection, all of it in one box, square
	 * to that box -- a part's own axes, a model's pivot -- in Studio's axis
	 * colours, the same size on screen near or far. With Edit Pivot on, the
	 * tool's handles at the pivot of the one thing picked: Select's are Move's
	 * and Rotate's both.
	 */
	private drawHandles(eye?: number[]): void {
		if (!this.view) return;
		const { tool, pivotEdit, space } = this.state;
		const world = space === "world";
		const built = new HandleBuilder();
		const pivot = pivotEdit && this.selection.length === 1 ? this.pivotOf(this.selection[0]) : null;
		const b =
			!pivot && this.selection.length > 0 && showsHandles(tool)
				? world
					? this.worldBox(this.selection)
					: this.boxRound(this.selection)
				: null;
		const frame = pivot
			? { c: pivot.at, axes: world ? WORLD : pivot.axes, half: [0, 0, 0] }
			: b && b.length >= SCENE_STRIDE
				? {
						c: [b[9], b[10], b[11]],
						axes: [0, 1, 2].map((j) => unit([b[j * 3], b[j * 3 + 1], b[j * 3 + 2]], j)),
						half: [0, 1, 2].map((j) => Math.hypot(b[j * 3], b[j * 3 + 1], b[j * 3 + 2]) / 2),
					}
				: null;
		if (frame) {
			const { c, axes, half } = frame;
			const from = eye ?? this.camera().eye;
			const k = Math.hypot(from[0] - c[0], from[1] - c[1], from[2] - c[2]) * 0.016;
			// Out at the selection's faces, but never further than this on screen:
			// a 2048-stud baseplate keeps its handles in view.
			const out = (a: number) => Math.min(half[a], k * 12);
			const at = (dir: number[], d: number) => c.map((v, a) => v + dir[a] * d);
			// On the pivot, the chosen tool's handles alone; Select, which has none, shows
			// Move's and Rotate's.
			const both = pivot !== null && tool === "select";
			const rings = both || tool === "rotate";
			const arrows = both || tool !== "rotate";
			axes.forEach((axis, a) => {
				const col = AXES[a][1];
				if (rings) {
					const radius = pivot
						? k * 8
						: Math.min(Math.max(Math.hypot(half[0], half[1], half[2]) * 1.05, k * 6), k * 16);
					built.ring(c, axis, radius, k * 0.36, col);
				}
				if (!arrows) return;
				for (const sign of [1, -1]) {
					const dir = axis.map((v) => v * sign);
					const tip = at(dir, out(a) + k * 6.5);
					built.along("cylinder", at(dir, out(a) + k * 0.8), tip, k * 0.36, col);
					if (both || tool === "move")
						built.along("cone", tip, at(dir, out(a) + k * 9), k * 1.6, col);
					else built.ball(at(dir, out(a) + k * 7.3), k * 2.1, col);
				}
			});
		}
		this.view.setHandles(built.build());
	}

	/** The pivot's mark over the view: drawn over everything, on what one thing is picked. */
	private pivotMark: SVGSVGElement | null = null;

	/**
	 * The pivot of the one thing picked, as Studio shows it: a dot, with its
	 * three axes in their colours, over every part in front of it. Where a
	 * press would drag by it the dot grows in a ring of the selection's blue,
	 * and a drag by it keeps it so, filled, with a Pivot tag beside it.
	 */
	private drawPivot(): void {
		const canvas = this.canvas;
		const holder = canvas?.parentElement;
		const pivot = this.selection.length === 1 ? this.pivotOf(this.selection[0]) : null;
		if (!canvas || !holder || !pivot) {
			this.pivotMark?.remove();
			this.pivotMark = null;
			return;
		}
		if (!this.pivotMark || this.pivotMark.parentElement !== holder) {
			this.pivotMark?.remove();
			this.pivotMark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			this.pivotMark.setAttribute("class", "vp-pivot");
			this.pivotMark.setAttribute("aria-hidden", "true");
			holder.append(this.pivotMark);
		}
		const mark = this.pivotMark;
		const box = canvas.getBoundingClientRect();
		Object.assign(mark.style, {
			left: `${canvas.offsetLeft}px`,
			top: `${canvas.offsetTop}px`,
			width: `${box.width}px`,
			height: `${box.height}px`,
		});
		const shot = this.shot(box);
		const centre = screenPoint(shot, pivot.at);
		if (!centre) {
			mark.innerHTML = "";
			return;
		}
		const eye = this.eye();
		const k = Math.hypot(...pivot.at.map((v, a) => v - eye[a])) * 0.016;
		// Its axes only with Edit Pivot on, as Studio shows them: otherwise the dot alone.
		const axes = this.state.pivotEdit ? pivot.axes : [];
		const lines = axes
			.map((axis, a) => {
				const end = screenPoint(
					shot,
					pivot.at.map((v, i) => v + axis[i] * k * 4),
				);
				if (!end) return "";
				const [x, y] = end.map((v) => v.toFixed(1));
				const col = GIZMO_AXES[a].col;
				return `<line x1="${centre[0].toFixed(1)}" y1="${centre[1].toFixed(1)}" x2="${x}" y2="${y}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="3" fill="${col}"/>`;
			})
			.join("");
		const [cx, cy] = centre.map((v) => v.toFixed(1));
		const held = this.drag?.start.byPivot === true;
		const ringed = held || (this.pivotHover && this.drag === null);
		mark.classList.toggle("vp-pivot-held", held);
		const ring = ringed
			? `<circle cx="${cx}" cy="${cy}" r="11" fill="${PIVOT_BLUE}" fill-opacity="0.18" stroke="${PIVOT_BLUE}" stroke-width="2"/>`
			: "";
		const dot = `<circle cx="${cx}" cy="${cy}" r="${ringed ? 6.5 : 5}" fill="${held ? PIVOT_BLUE : "#fff"}" stroke="${held ? "#fff" : "#14171c"}" stroke-width="1.5"/>`;
		const tag = held
			? `<g class="vp-pivot-tag" transform="translate(${(centre[0] + 15).toFixed(1)} ${(centre[1] - 27).toFixed(1)})"><rect width="38" height="18" rx="4" fill="${PIVOT_BLUE}"/><text x="19" y="12.5" text-anchor="middle">Pivot</text></g>`
			: "";
		mark.innerHTML = `${lines}${ring}${dot}${tag}`;
	}

	/** The handles' axes, object or world: Ctrl+L, and the bar's toggle. */
	setSpace(space: "object" | "world"): void {
		if (!this.state.editable) return;
		this.set({ space });
		this.drawHandles();
		this.redraw();
	}

	/** Edit Pivot, on or off: the bar's toggle. */
	setPivotEdit(on: boolean): void {
		if (on && !this.state.editable) return;
		// Its handles want a tool: Select, picked up again.
		this.set(
			on && this.state.tool === null ? { pivotEdit: on, tool: "select" } : { pivotEdit: on },
		);
		this.drawHandles();
		this.redraw();
	}

	/**
	 * Where Studio's camera was when the place was saved, as a frustum ten
	 * studs deep, with a small triangle on its top edge for which way is up.
	 */
	private frustumLines(): Float32Array {
		const studio = this.place?.camera;
		if (!studio) return new Float32Array();
		const fov = studio.fieldOfView * (Math.PI / 180);
		const r = studio.rotation;
		const right = [r[0], r[3], r[6]];
		const up = [r[1], r[4], r[7]];
		const look = [-r[2], -r[5], -r[8]];
		const p = studio.position;
		const D = 10;
		const h = D * Math.tan(fov / 2);
		const w = h * (16 / 9);
		const at = (sx: number, sy: number) =>
			[0, 1, 2].map((a) => p[a] + look[a] * D + right[a] * sx + up[a] * sy);
		const corners = [at(-w, -h), at(w, -h), at(w, h), at(-w, h)];
		const col = [1, 0.84, 0.38];
		const out: number[] = [];
		const line = (a: number[], b: number[]) => out.push(...a, ...col, ...b, ...col);
		for (const c of corners) line(p, c);
		for (let i = 0; i < 4; i++) line(corners[i], corners[(i + 1) % 4]);
		const tip = at(0, h * 1.45);
		line(at(-w * 0.35, h * 1.06), tip);
		line(tip, at(w * 0.35, h * 1.06));
		line(at(w * 0.35, h * 1.06), at(-w * 0.35, h * 1.06));
		return new Float32Array(out);
	}

	/** Where the light ranges and gizmos were last found from, or null with them off. */
	private gizmoAt: string | null = null;

	/** The light ranges or the gizmos are drawn, and so follow the camera. */
	private overlayFollows(): boolean {
		return this.state.render.lightRanges || gizmosOn(this.state.gizmos, this.selection.length > 0);
	}

	/** Every row picked, and every row inside one: what With the selection shows the gizmos of. */
	private pickedRows(): Set<number> {
		const out = new Set<number>();
		const take = (i: number) => {
			if (out.has(i)) return;
			out.add(i);
			for (const k of this.kids[i] ?? []) take(k);
		};
		for (const i of this.selection) take(i);
		return out;
	}

	/**
	 * The overlay: Studio's camera, and with Light ranges on the lights near
	 * `eye`, and the gizmos that are on (see `visualGizmos.ts`).
	 */
	private overlayLines(eye: number[] = this.eye()): Float32Array {
		const probe = this.probeLines();
		const lines = this.overlayWithout(eye);
		if (probe.length === 0) return lines;
		const out = new Float32Array(lines.length + probe.length);
		out.set(lines);
		out.set(probe, lines.length);
		return out;
	}

	/** The overlay's lines but the probe's mark: the frustum, light ranges and gizmos. */
	private overlayWithout(eye: number[]): Float32Array {
		const frustum = this.frustumLines();
		if (!this.overlayFollows()) {
			this.gizmoAt = null;
			return frustum;
		}
		this.gizmoAt = gizmoCell(eye);
		const lights = this.state.render.lightRanges
			? lightGizmoLines(this.place?.lights, eye)
			: new Float32Array();
		const gizmos = gizmosOn(this.state.gizmos, this.selection.length > 0)
			? visualGizmoLines(
					this.place?.gizmos,
					this.state.gizmos,
					eye,
					this.state.gizmos.picked ? this.pickedRows() : undefined,
				)
			: new Float32Array();
		if (lights.length === 0 && gizmos.length === 0) return frustum;
		const out = new Float32Array(frustum.length + lights.length + gizmos.length);
		out.set(frustum);
		out.set(lights, frustum.length);
		out.set(gizmos, frustum.length + lights.length);
		return out;
	}

	/** The light ranges and gizmos found again once the camera has moved a step: see `GIZMO_STEP`. */
	private followGizmos(eye: number[]): void {
		if (!this.view || !this.overlayFollows() || this.gizmoAt === gizmoCell(eye)) return;
		this.view.setOverlay(this.overlayLines(eye));
	}

	// -- input -------------------------------------------------------------------

	/** The view's keys, while it is in front: never while typing, nor with Ctrl or Cmd held. */
	private keys() {
		const typing = (e: KeyboardEvent) =>
			Boolean(
				(e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]"),
			) || Boolean(document.querySelector("dialog[open], .dialog-backdrop"));
		return {
			down: (e: KeyboardEvent) => {
				// Ctrl+L, Cmd+L on a Mac, as in Studio: the handles' axes, the object's
				// or the world's. Taken from the browser, whose own is the address bar.
				if (
					(e.ctrlKey || e.metaKey) &&
					!e.altKey &&
					!e.shiftKey &&
					e.code === "KeyL" &&
					!typing(e)
				) {
					e.preventDefault();
					this.setSpace(this.state.space === "world" ? "object" : "world");
					return;
				}
				if (typing(e) || e.ctrlKey || e.metaKey) return;
				// While a part is dragged, as in Studio: R turns it about the up axis, T
				// tilts it, a quarter each press; Esc puts it back.
				if (this.drag && !e.altKey) {
					if (e.code === "KeyR" || e.code === "KeyT") {
						e.preventDefault();
						if (!e.repeat) this.turnDrag(e.code === "KeyR" ? "R" : "T");
						return;
					}
					if (e.key === "Escape") {
						this.cancelDrag();
						return;
					}
				}
				if (MOVES[e.code] && !e.altKey) {
					this.held.add(e.code);
					this.fly();
					return;
				}
				if (e.key === "f" || e.key === "F") this.frameSelection();
				else if (e.key === "Home") this.fitAll();
				else if (e.key === "Escape") this.clear();
				else {
					// The bar's order. Studio's Ctrl+1 to Ctrl+4 are the browser's, for its own tabs.
					const pick = toolForKey(e.key);
					if (pick && !e.altKey) this.chooseTool(pick);
				}
			},
			up: (e: KeyboardEvent) => this.held.delete(e.code),
			blur: () => this.held.clear(),
		};
	}

	/** The box a left-drag draws, over the canvas; there only while it is drawn. */
	private marquee: HTMLElement | null = null;

	private hideMarquee(): void {
		this.marquee?.remove();
		this.marquee = null;
	}

	/**
	 * The mouse: a click picks, as below. A left-drag draws a box and picks each
	 * part whose centre is inside it, and with Shift adds them to what is
	 * picked. Alt and a left-drag orbits round what is picked, right-drag looks,
	 * and middle-drag, or Shift and a right-drag, pans. Scroll zooms.
	 *
	 * Touch and pen: one finger orbits, or pans with Shift held, two fingers
	 * pinch and pan, a tap picks and a long press picks as Alt and a click do.
	 *
	 * A press that moves no more than DRAG is a click: the GPU's pick, of the
	 * highest Model in Workspace there, or with Alt or Shift the part. With
	 * Settings' `altClickSteps`, Alt picks one Model further in instead.
	 *
	 * With no tool, nothing picks: no click, box, long press or hover outline,
	 * and a left-drag does nothing. The camera's drags all stay.
	 */
	private attach(el: HTMLCanvasElement): void {
		const pointers = new Map<number, { x: number; y: number }>();
		// The pointers that hold the view drawing every frame: see pointerdown.
		const holding = new Set<number>();
		let moved = 0;
		let mode: DragMode = "orbit";
		// Where a left-drag's box started, and whether it adds to what is picked.
		let start: { x: number; y: number; adding: boolean } | null = null;
		let pinch = 0;
		// What a press on a part or its pivot holds, and whether it has moved far enough to drag it.
		let grip: Grip | null = null;
		let dragging = false;
		/** The box from where the drag started to the pointer, in CSS pixels from the canvas's corner. */
		const boxTo = (from: { x: number; y: number }, e: PointerEvent) => {
			const r = el.getBoundingClientRect();
			return {
				r,
				rect: rectBetween(from.x - r.left, from.y - r.top, e.clientX - r.left, e.clientY - r.top),
			};
		};
		const drawBox = (from: { x: number; y: number }, e: PointerEvent) => {
			const holder = el.parentElement;
			if (!holder) return;
			if (!this.marquee) {
				this.marquee = document.createElement("div");
				this.marquee.className = "vp-marquee";
				holder.append(this.marquee);
			}
			const { rect } = boxTo(from, e);
			const s = this.marquee.style;
			s.left = `${el.offsetLeft + rect.left}px`;
			s.top = `${el.offsetTop + rect.top}px`;
			s.width = `${rect.right - rect.left}px`;
			s.height = `${rect.bottom - rect.top}px`;
		};
		const takeBox = (from: { x: number; y: number; adding: boolean }, e: PointerEvent) => {
			const { r, rect } = boxTo(from, e);
			// Each part's outermost Model, as a click takes it, and the parts no Model holds.
			const parts = partsInRect(this.words, this.shot(r), rect);
			const inside = this.place ? boxTargets(this.place.outline, this.workspace, parts) : parts;
			if (from.adding && inside.length === 0) return;
			this.pickHere(from.adding ? addTo(this.selection, inside) : inside);
		};
		// A touch held still picks as Alt and a click do, where a touch screen has no Alt.
		let press: ReturnType<typeof setTimeout> | undefined;
		let pressed = false;
		const unpress = () => {
			clearTimeout(press);
			press = undefined;
		};
		const idAt = (x: number, y: number) => {
			const box = el.getBoundingClientRect();
			const dpr = el.width / box.width;
			return this.pickId(Math.floor((x - box.left) * dpr), Math.floor((y - box.top) * dpr));
		};
		// The mouse over the view outlines, faintly, what a click there would pick:
		// a ray against the parts' own shapes, once a frame while it moves.
		let aim: { x: number; y: number; alt: boolean; shift: boolean } | null = null;
		let aiming = 0;
		// The part the ray last met, -1 for none: a step down moves on after each click.
		let aimed = -1;
		const hoverAimed = () => {
			this.setHover(
				aim && aimed >= 0 ? this.clickTarget(aimed, this.reachFor(aim.alt, aim.shift)) : null,
			);
		};
		// `toggle` is Ctrl, Cmd on a Mac: what the click reaches joins what is
		// picked, or leaves it, rather than replacing it.
		const pickAt = async (x: number, y: number, reach: Reach, toggle = false) => {
			if (this.state.probe.armed) {
				this.probeHere(x, y);
				return;
			}
			if (!this.view || !picks(this.state.tool)) return;
			const id = await idAt(x, y);
			if (!toggle) this.pickHere(id >= 0 ? [this.clickTarget(id, reach)] : []);
			else if (id >= 0) {
				const target = this.clickTarget(id, reach);
				this.pickHere(
					this.selection.includes(target)
						? this.selection.filter((i) => i !== target)
						: [...this.selection, target],
				);
			}
			// What the next click would pick, which a step down has just moved.
			if (aim) hoverAimed();
		};
		el.addEventListener("pointermove", (e) => {
			if (e.pointerType !== "mouse" || pointers.size > 0) return;
			// Over the pivot's mark, a press drags by the pivot: it says so first.
			const r = el.getBoundingClientRect();
			this.setPivotHover(this.pivotGrip(e.clientX - r.left, e.clientY - r.top, r) !== null);
			// With no tool nothing is picked, so nothing is outlined as if it would be.
			if (!picks(this.state.tool)) {
				aim = null;
				aimed = -1;
				return;
			}
			aim = { x: e.clientX, y: e.clientY, alt: e.altKey, shift: e.shiftKey };
			if (aiming) return;
			aiming = requestAnimationFrame(() => {
				aiming = 0;
				if (!aim || !this.place || pointers.size > 0 || !picks(this.state.tool)) return;
				const box = el.getBoundingClientRect();
				aimed = rayPick(this.place, this.eye(), this.rayAt(aim.x - box.left, aim.y - box.top, box));
				hoverAimed();
			});
		});
		el.addEventListener("pointerleave", () => {
			aim = null;
			aimed = -1;
			this.setHover(null);
			if (!this.drag) this.setPivotHover(false);
		});
		el.addEventListener("contextmenu", (e) => e.preventDefault());
		el.addEventListener("pointerdown", (e) => {
			el.setPointerCapture(e.pointerId);
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			moved = 0;
			pressed = false;
			mode = dragMode(e, this.state.tool);
			// A part pressed, with editing on, drags rather than drawing a box, whatever
			// the tool, as in Studio; a finger drags only what is picked, and orbits
			// over the rest. A second finger lets go of a drag not yet begun.
			if (pointers.size === 1) {
				dragging = false;
				const r = el.getBoundingClientRect();
				grip =
					e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey
						? this.gripAt(
								e.clientX - r.left,
								e.clientY - r.top,
								r,
								this.reachFor(false, e.shiftKey),
								e.pointerType !== "mouse",
							)
						: null;
			} else if (grip && !dragging) grip = null;
			if (grip) mode = "none";
			// Drawn every frame only while the camera can move. A box is drawn over
			// the view and changes nothing in it: held, a box redrew the whole place
			// each frame for nothing, and a large place stalled as the drag began.
			if ((mode !== "box" && mode !== "none") || pointers.size > 1) {
				holding.add(e.pointerId);
				this.hold(true);
			}
			start =
				mode === "box"
					? { x: e.clientX, y: e.clientY, adding: e.shiftKey || e.ctrlKey || e.metaKey }
					: null;
			this.hideMarquee();
			unpress();
			if (pointers.size === 1 && e.pointerType !== "mouse" && picks(this.state.tool)) {
				const { clientX: x, clientY: y } = e;
				press = setTimeout(() => {
					press = undefined;
					if (moved > DRAG || pointers.size !== 1) return;
					pressed = true;
					void pickAt(x, y, this.reachFor(true, false));
				}, LONG_PRESS);
			}
			if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				pinch = Math.hypot(a.x - b.x, a.y - b.y);
			}
		});
		el.addEventListener("pointermove", (e) => {
			const last = pointers.get(e.pointerId);
			if (!last) return;
			const dx = e.clientX - last.x;
			const dy = e.clientY - last.y;
			moved += Math.abs(dx) + Math.abs(dy);
			if (moved > DRAG) unpress();
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (grip) {
				if (!dragging && moved > DRAG) {
					dragging = true;
					this.beginDrag(grip, { x: e.clientX, y: e.clientY });
				}
				// Esc may have put it back already: then the press does nothing more.
				if (dragging && this.drag) this.dragTo(e.clientX, e.clientY);
				return;
			}
			if (mode === "box") {
				if (start && moved > DRAG) drawBox(start, e);
				return;
			}
			// A left-drag with no tool moves nothing, as in Studio.
			if (mode === "none") return;
			if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				const d = Math.hypot(a.x - b.x, a.y - b.y);
				if (pinch > 0) this.cam.dist = Math.max(2, this.cam.dist * (pinch / d));
				pinch = d;
				this.pan(dx / 2, dy / 2);
			} else if (mode === "pan") this.pan(dx, dy);
			else if (mode === "look") this.look(dx, dy);
			else this.orbit(dx, dy);
			this.redraw();
		});
		el.addEventListener("pointerup", (e) => {
			if (!pointers.has(e.pointerId)) return;
			pointers.delete(e.pointerId);
			if (holding.delete(e.pointerId)) this.hold(false);
			unpress();
			this.hideMarquee();
			if (grip && pointers.size === 0) {
				const was = dragging;
				grip = null;
				dragging = false;
				if (was) {
					void this.endDrag();
					return;
				}
			}
			const from = start;
			start = null;
			if (mode === "box" && from && moved > DRAG && e.button === 0) {
				takeBox(from, e);
				return;
			}
			// A long press has picked already.
			if (pressed || pointers.size > 0 || moved > DRAG || e.button !== 0) return;
			void pickAt(
				e.clientX,
				e.clientY,
				this.reachFor(e.altKey, e.shiftKey),
				e.ctrlKey || e.metaKey,
			);
		});
		el.addEventListener("pointercancel", (e) => {
			unpress();
			this.hideMarquee();
			start = null;
			if (dragging) this.cancelDrag();
			grip = null;
			dragging = false;
			pointers.delete(e.pointerId);
			if (holding.delete(e.pointerId)) this.hold(false);
		});
		el.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault();
				// Shift turns a wheel's turn sideways in most browsers: either way, a notch.
				if (e.shiftKey) {
					const d = e.deltaY || e.deltaX;
					if (d !== 0) this.setSpeed(this.state.speed * (d > 0 ? 1 / SPEED_NOTCH : SPEED_NOTCH));
					return;
				}
				this.cam.dist = Math.max(2, this.cam.dist * Math.exp(e.deltaY * 0.0012));
				this.redraw();
			},
			{ passive: false },
		);
	}

	/** A click on an axis's end looks along it; a drag orbits. */
	private attachGizmo(gizmo: HTMLElement): void {
		let down: { x: number; y: number; moved: number; axis?: string } | null = null;
		gizmo.onpointerdown = (e) => {
			// Which end was pressed, read now: once the gizmo has the pointer, events are its own.
			const axis = (e.target as Element).closest?.<SVGGElement>("[data-axis]")?.dataset.axis;
			gizmo.setPointerCapture(e.pointerId);
			down = { x: e.clientX, y: e.clientY, moved: 0, axis };
			this.hold(true);
		};
		gizmo.onpointermove = (e) => {
			if (!down) return;
			const dx = e.clientX - down.x;
			const dy = e.clientY - down.y;
			down.moved += Math.abs(dx) + Math.abs(dy);
			down.x = e.clientX;
			down.y = e.clientY;
			this.cam.yaw -= dx * 0.012;
			this.cam.pitch = clampPitch(this.cam.pitch + dy * 0.012);
			this.redraw();
		};
		gizmo.onpointerup = () => {
			if (!down) return;
			const clicked = down.moved < 4;
			const along = down.axis ? ALONG[down.axis] : undefined;
			down = null;
			this.hold(false);
			if (clicked && along) this.turnTo(along[0], along[1]);
		};
		gizmo.onpointercancel = () => {
			if (down) this.hold(false);
			down = null;
		};
	}
}

/** The Rendering panel's groups whose switches a profile turns off one at a time. */
const WITHOUT_GROUPS = ["Environment light", "Shadows"];

/** How long one of a profile's measurements may take, and the fewest frames it times. */
const PROFILE_BUDGET = 1500;
const PROFILE_FEWEST = 8;
/** How long each motion of a profile or benchmark runs: one second, as many frames as that takes. */
const MOVING_MS = 1000;
/** With Dynamic or Dynamic optimization on, how long a benchmark's motion lets them settle before it is timed. */
const DYNAMIC_SETTLE_MS = 3000;
/** A bound on those frames, for a display or GPU far beyond any yet. */
const MOVING_MOST = 4000;

/**
 * The smallest step the page's clock takes: Safari rounds `performance.now`
 * to a coarse step, which a single short stage cannot be measured under.
 */
function clockStep(): number {
	let smallest = Number.POSITIVE_INFINITY;
	let last = performance.now();
	for (let i = 0; i < 2000 && smallest > 0.001; i++) {
		const now = performance.now();
		if (now > last) {
			smallest = Math.min(smallest, now - last);
			last = now;
		}
	}
	return Number.isFinite(smallest) ? smallest : Number.NaN;
}

/**
 * The GPU's name, for Automatic's first level: WebGPU's adapter's, or
 * WebGL2's renderer string; empty where the browser keeps it back.
 */
async function gpuName(gl2: boolean): Promise<string> {
	try {
		const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
		if (!gl2 && gpu) {
			const adapter = (await gpu.requestAdapter()) as {
				info?: { vendor?: string; architecture?: string; description?: string };
			} | null;
			const info = adapter?.info;
			if (info) return [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
		}
		const gl = document.createElement("canvas").getContext("webgl2");
		if (!gl) return "";
		const ext = gl.getExtension("WEBGL_debug_renderer_info");
		const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
		gl.getExtension("WEBGL_lose_context")?.loseContext();
		return name;
	} catch {
		return "";
	}
}

/** How many parts a place draws, opaque and see-through: for the start log. */
function partCount(place: PlaceScene): number {
	const sum = (rows: Record<string, { count: number }>) =>
		Object.values(rows).reduce((n, row) => n + row.count, 0);
	return sum(place.kinds) + sum(place.translucent);
}
