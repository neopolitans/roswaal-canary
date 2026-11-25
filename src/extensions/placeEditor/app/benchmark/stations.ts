/**
 * Roswaal Benchmark 5: the places the benchmark draws, generated here from a
 * fixed seed rather than stored, a station at a time, with the models and
 * textures it carries (see assets.ts).
 *
 * Each station is a small place of its own, so one station's particles are
 * not simulated while another is measured, and its parts do not widen the
 * sky maps that cover another. Each has a pose: where its camera stands and
 * what it looks at. A station may come in variants (the Lights station's 10,
 * 20, 50 and 100 lights), each measured on its own.
 *
 * A benchmark is frozen once released: a changed scene, or a change in how
 * it is measured, is the next one, so a score always says what it measured.
 * Change BENCHMARK_VERSION with it.
 */

import { outlinePlace } from "../../../../core/rbx/browse.js";
import type { Prop, PropType, RbxDocument, RbxInstance } from "../../../../core/rbx/dom.js";
import { readLighting } from "../../core/lighting.js";
import { MATERIALS } from "../../core/materials.js";
import type { FileMesh } from "../../core/mesh.js";
import { benchmarkAsset, benchmarkContent, buildPlaceScene } from "../../core/scene.js";
import type { ViewportPlace } from "../viewport/controller.js";
import { loadTanks, loadTextures, TANK_NAMES, TEXTURE_NAMES } from "./assets.js";

/**
 * 2: Benchmark 1's scenes, measured with the GPU kept busy (two frames in
 * flight) rather than one frame at a time: an iPad's GPU set its clock by
 * the gaps, so its timers timed the clock as much as the scenes.
 */
export const BENCHMARK_VERSION = 5;
/**
 * 3: Benchmark 2, with two stations of real assets: Textures (Kenney's
 * prototype textures as Texture instances) and Meshes (96 tanks of
 * MayLizbeth's, 1,788 MeshParts).
 */
/**
 * 4: Benchmark 3, the tanks' skirts and tracks DoubleSided, as their models
 * have them: the Meshes station draws their back faces too.
 */
/**
 * 5: Benchmark 4 with two stations for 1.1's lighting work: Reflections
 * (Metal, Glass and Reflectance over a reflective floor, what the
 * reflection cube and the per-pixel reflection reads cost) and Bloom (a
 * BloomEffect over bright parts in the sun, with no Neon, apart from Glow's).
 */
/** How Benchmarks 2 to 4 time their frames: see ViewportController.busyFrames. */
export const BENCHMARK_MEASURE = "busy" as const;
export const BENCHMARK_SEED = 1;

/** Where a station's camera stands, and what it looks at. */
export interface StationPose {
	eye: [number, number, number];
	at: [number, number, number];
}

export interface StationVariant {
	/** Beside the station's name in the report: "50 lights". Empty for a station of one. */
	label: string;
	/** The place, made when it is measured: once what it carries has been fetched, for some. */
	place: () => ViewportPlace | Promise<ViewportPlace>;
	/** Frames drawn and not measured first, for effects to fill in: particles take their lifetime. */
	settleMs?: number;
}

export interface Station {
	/** Its number in the run's order, from 1. */
	n: number;
	id: string;
	name: string;
	/** What it measures, for the report. */
	measures: string;
	pose: StationPose;
	variants: StationVariant[];
	/** Each of the controls' motions measured, rather than one orbit: the Moving station. */
	allMotions?: boolean;
}

// -- making instances ---------------------------------------------------------------

/** A seeded random number generator (mulberry32): the same place on every device. */
export function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type Props = Record<string, [PropType, unknown]>;

function inst(
	className: string,
	name: string,
	props: Props = {},
	children: RbxInstance[] = [],
): RbxInstance {
	const made: RbxInstance = {
		className,
		name,
		parent: null,
		children,
		props: new Map<string, Prop>(
			Object.entries(props).map(([k, [type, value]]) => [k, { type, value }]),
		),
		service: false,
	};
	for (const child of children) child.parent = made;
	return made;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const MATERIAL = Object.fromEntries(MATERIALS.map((m) => [m.name, m.value])) as Record<
	string,
	number
>;

/** A rotation about Y, as a CFrame's row-major 3x3. */
function aboutY(angle: number): number[] {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return [c, 0, s, 0, 1, 0, -s, 0, c];
}

interface PartSpec {
	at: number[];
	size: number[];
	colour?: number[];
	material?: string;
	transparency?: number;
	reflectance?: number;
	rotation?: number[];
	className?: string;
	/** Enum.PartType: Ball 0, Block 1, Cylinder 2. */
	shape?: number;
	castShadow?: boolean;
	name?: string;
}

function part(spec: PartSpec, children: RbxInstance[] = []): RbxInstance {
	const props: Props = {
		CFrame: ["CFrame", { position: spec.at, rotation: spec.rotation ?? IDENTITY }],
		size: ["Vector3", spec.size],
		Color3uint8: ["Color3uint8", spec.colour ?? [163, 162, 165]],
		Material: ["Enum", MATERIAL[spec.material ?? "SmoothPlastic"] ?? 272],
		Transparency: ["Float32", spec.transparency ?? 0],
		Reflectance: ["Float32", spec.reflectance ?? 0],
		Anchored: ["Bool", true],
	};
	if (spec.shape !== undefined) props.shape = ["Enum", spec.shape];
	if (spec.castShadow === false) props.CastShadow = ["Bool", false];
	return inst(spec.className ?? "Part", spec.name ?? "Part", props, children);
}

/** A colour from a hue, 0 to 1, as Color3uint8. */
function hue(h: number, s = 0.75, v = 0.95): number[] {
	const f = (n: number) => {
		const k = (n + h * 6) % 6;
		return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
	};
	return [f(5), f(3), f(1)].map((c) => Math.round(c * 255));
}

const baseplate = (size = 512) =>
	part({ at: [0, -0.5, 0], size: [size, 1, size], colour: [99, 95, 98], name: "Baseplate" });

/** A place of a Workspace's parts and a Lighting, as the host would make it from a file. */
function placeOf(
	workspaceParts: RbxInstance[],
	lightingChildren: RbxInstance[] = [],
	lightingProps: Props = {},
): ViewportPlace {
	const workspace = inst("Workspace", "Workspace", {}, workspaceParts);
	workspace.service = true;
	const lighting = inst("Lighting", "Lighting", lightingProps, lightingChildren);
	lighting.service = true;
	const instances: RbxInstance[] = [];
	const walk = (i: RbxInstance) => {
		instances.push(i);
		for (const c of i.children) walk(c);
	};
	walk(workspace);
	walk(lighting);
	const doc: RbxDocument = {
		format: "binary",
		roots: [workspace, lighting],
		instances,
		undecoded: new Map(),
	};
	const { outline, order } = outlinePlace(doc);
	const index = new Map(order.map((i, n) => [i, n]));
	const scene = buildPlaceScene(workspace, (i) => index.get(i));
	return { ...scene, lighting: readLighting(doc), outline, stamp: "benchmark" };
}

// -- the stations -------------------------------------------------------------------

function materialsPlace(): ViewportPlace {
	const parts = [baseplate()];
	const colours = [
		[163, 162, 165],
		[196, 40, 28],
		[13, 105, 172],
	];
	MATERIALS.forEach((m, x) => {
		colours.forEach((colour, c) =>
			[0, 0.5, 1].forEach((reflectance, r) =>
				parts.push(
					part({
						at: [(x - (MATERIALS.length - 1) / 2) * 5, 2.5 + (c * 3 + r) * 5, 0],
						size: [4, 4, 4],
						colour,
						material: m.name,
						reflectance,
					}),
				),
			),
		);
	});
	return placeOf(parts);
}

function shapesPlace(): ViewportPlace {
	const rand = seeded(BENCHMARK_SEED + 3);
	const parts = [baseplate()];
	const kinds: { className?: string; shape?: number; mesh?: number }[] = [
		{ shape: 1 },
		{ className: "WedgePart" },
		{ className: "CornerWedgePart" },
		{ shape: 2 },
		{ shape: 0 },
		// SpecialMesh: a Sphere.
		{ mesh: 3 },
	];
	kinds.forEach((kind, k) => {
		for (let i = 0; i < 200; i++) {
			const s = 1 + rand() * 5;
			const children =
				kind.mesh !== undefined
					? [inst("SpecialMesh", "Mesh", { MeshType: ["Enum", kind.mesh] })]
					: [];
			parts.push(
				part(
					{
						className: kind.className,
						shape: kind.shape,
						at: [(rand() - 0.5) * 200, s / 2 + rand() * 2, (rand() - 0.5) * 200],
						size: [s, s * (0.5 + rand()), s],
						rotation: aboutY(rand() * Math.PI * 2),
						colour: hue(k / kinds.length),
					},
					children,
				),
			);
		}
	});
	return placeOf(parts);
}

function skyLightPlace(): ViewportPlace {
	const parts = [baseplate()];
	// Closed rooms but for the side facing the camera, walls 1, 2, 4 and 8 studs thick.
	[1, 2, 4, 8].forEach((wall, i) => {
		const cx = -90 + i * 60;
		const w = 24 + wall * 2;
		const h = 12;
		parts.push(
			part({ at: [cx, h + wall / 2, 0], size: [w, wall, w] }),
			part({ at: [cx - w / 2 + wall / 2, h / 2, 0], size: [wall, h, w] }),
			part({ at: [cx + w / 2 - wall / 2, h / 2, 0], size: [wall, h, w] }),
			part({ at: [cx, h / 2, -w / 2 + wall / 2], size: [w, h, wall] }),
		);
	});
	// Roofs 8 to 128 studs over the floor, each on a post.
	[8, 16, 32, 64, 128].forEach((up, i) => {
		const cx = -100 + i * 50;
		parts.push(
			part({ at: [cx, up, 60], size: [20, 1, 20] }),
			part({ at: [cx, up / 2, 60], size: [1, up, 1] }),
		);
	});
	// Struts and rails over an open floor: thinner than a lighting cell.
	for (let i = 0; i < 20; i++) {
		parts.push(
			part({ at: [-40 + i * 4, 10, -70], size: [0.4, 0.4, 40] }),
			part({ at: [0, 10.5, -90 + i * 2], size: [80, 0.3, 0.3] }),
		);
	}
	return placeOf(parts);
}

function sunShadowsPlace(): ViewportPlace {
	const rand = seeded(BENCHMARK_SEED + 5);
	const parts = [baseplate(1600)];
	[50, 100, 150, 200, 250, 300, 350, 400].forEach((h, i) => {
		parts.push(part({ at: [i * 80, h / 2, -40], size: [12, h, 12] }));
	});
	for (let i = 0; i < 400; i++)
		parts.push(
			part({
				at: [(rand() - 0.2) * 300, 10, 40 + rand() * 160],
				size: [0.5, 20, 0.5],
				colour: [120, 96, 70],
			}),
		);
	return placeOf(parts);
}

function lightsPlace(count: number): ViewportPlace {
	const rand = seeded(BENCHMARK_SEED + 6 + count);
	const parts = [baseplate()];
	// Some shapes for the lights to fall on.
	for (let i = 0; i < 40; i++)
		parts.push(
			part({
				at: [(rand() - 0.5) * 120, 2, (rand() - 0.5) * 120],
				size: [4, 4, 4],
				colour: [200, 200, 200],
			}),
		);
	// The lights: in one area of 60 studs, mixed kinds, coloured, overlapping.
	for (let i = 0; i < count; i++) {
		const kind = i % 3;
		const colour = hue(rand());
		const light =
			kind === 0
				? inst("PointLight", "PointLight", {
						Range: ["Float32", 16 + rand() * 24],
						Brightness: ["Float32", 1 + rand() * 2],
						Color: ["Color3", colour.map((c) => c / 255)],
					})
				: inst(
						kind === 1 ? "SpotLight" : "SurfaceLight",
						kind === 1 ? "SpotLight" : "SurfaceLight",
						{
							Range: ["Float32", 16 + rand() * 24],
							Brightness: ["Float32", 1 + rand() * 2],
							Color: ["Color3", colour.map((c) => c / 255)],
							Angle: ["Float32", 60 + rand() * 60],
							// Enum.NormalId Bottom.
							Face: ["Enum", 4],
						},
					);
		parts.push(
			part(
				{
					at: [(rand() - 0.5) * 60, 8 + rand() * 8, (rand() - 0.5) * 60],
					size: [1, 1, 1],
					colour,
					material: "Neon",
					castShadow: false,
				},
				[light],
			),
		);
	}
	return placeOf(parts);
}

function seeThroughPlace(): ViewportPlace {
	const parts = [baseplate()];
	// A coloured wall behind, to be seen through everything.
	for (let i = 0; i < 12; i++)
		parts.push(part({ at: [-66 + i * 12, 15, -40], size: [12, 30, 2], colour: hue(i / 12) }));
	// Six stacks of eight Glass panes.
	for (let s = 0; s < 6; s++)
		for (let p = 0; p < 8; p++)
			parts.push(
				part({
					at: [-60 + s * 14, 8, -20 + p * 3],
					size: [10, 14, 0.4],
					material: "Glass",
					transparency: 0.5,
					colour: [180, 210, 230],
				}),
			);
	// Transparency in steps, and ForceField.
	for (let t = 1; t <= 9; t++)
		parts.push(
			part({
				at: [-45 + t * 9, 6, 20],
				size: [7, 12, 7],
				transparency: t / 10,
				colour: [230, 120, 60],
			}),
		);
	for (let i = 0; i < 4; i++)
		parts.push(
			part({
				at: [-30 + i * 20, 6, 40],
				size: [10, 10, 10],
				material: "ForceField",
				colour: hue(i / 4),
			}),
		);
	return placeOf(parts);
}

function glowPlace(): ViewportPlace {
	const parts = [
		part({ at: [0, -0.5, 0], size: [512, 1, 512], material: "CrackedLava", colour: [70, 60, 60] }),
	];
	// Neon cubes in colours and sizes.
	for (let x = 0; x < 12; x++)
		for (let y = 0; y < 6; y++)
			parts.push(
				part({
					at: [-66 + x * 12, 4 + y * 8, -30],
					size: [2 + (x % 4), 2 + (y % 3), 2],
					material: "Neon",
					colour: hue((x + y * 12) / 72),
				}),
			);
	// Neon behind glass, and a strip seen through a seam.
	for (let i = 0; i < 6; i++) {
		parts.push(
			part({ at: [-40 + i * 16, 6, 10], size: [6, 6, 1], material: "Neon", colour: hue(i / 6) }),
		);
		parts.push(
			part({ at: [-40 + i * 16, 6, 14], size: [8, 8, 0.4], material: "Glass", transparency: 0.4 }),
		);
	}
	parts.push(
		part({ at: [0, 6, 30], size: [40, 1, 1], material: "Neon", colour: [0, 220, 255] }),
		part({ at: [-10.1, 6, 32], size: [20, 12, 1] }),
		part({ at: [10.1, 6, 32], size: [20, 12, 1] }),
	);
	return placeOf(parts);
}

/**
 * Reflections: a reflective floor, and rows of Metal blocks, Glass panes and
 * balls at Reflectance 0.25 to 1, among coloured columns for them to show.
 */
function reflectionsPlace(): ViewportPlace {
	const parts = [
		part({ at: [0, -0.5, 0], size: [400, 1, 400], colour: [60, 62, 70], reflectance: 0.3 }),
	];
	// Coloured columns round the rows: something for the reflections to show.
	for (let i = 0; i < 16; i++) {
		const a = (i / 16) * Math.PI * 2;
		parts.push(
			part({
				at: [Math.cos(a) * 70, 15, Math.sin(a) * 70 - 10],
				size: [6, 30, 6],
				colour: hue(i / 16),
			}),
		);
	}
	for (let x = 0; x < 8; x++) {
		// Metal blocks.
		parts.push(
			part({
				at: [-42 + x * 12, 3, -20],
				size: [6, 6, 6],
				material: "Metal",
				colour: [200 - x * 12, 200, 210],
			}),
		);
		// Glass panes.
		parts.push(
			part({ at: [-42 + x * 12, 5, 0], size: [8, 10, 0.4], material: "Glass", transparency: 0.3 }),
		);
		// Balls, more reflective along the row.
		parts.push(
			part({
				at: [-42 + x * 12, 3, 20],
				size: [6, 6, 6],
				shape: 0,
				reflectance: 0.25 + (x / 7) * 0.75,
				colour: [90, 95, 105],
			}),
		);
	}
	return placeOf(parts);
}

/** Bloom: a BloomEffect over bright white parts in the sun, and no Neon. */
function bloomPlace(): ViewportPlace {
	const rand = seeded(BENCHMARK_SEED + 13);
	const parts = [baseplate()];
	for (let i = 0; i < 60; i++)
		parts.push(
			part({
				at: [(rand() - 0.5) * 140, 2 + rand() * 20, -rand() * 120],
				size: [2 + rand() * 6, 2 + rand() * 6, 2 + rand() * 6],
				colour: [250, 248, 240],
			}),
		);
	return placeOf(
		parts,
		[
			inst("BloomEffect", "Bloom", {
				Intensity: ["Float32", 1],
				Size: ["Float32", 24],
				Threshold: ["Float32", 0.8],
			}),
		],
		{ Brightness: ["Float32", 3] },
	);
}

function effectsPlace(particles: number): ViewportPlace {
	const rand = seeded(BENCHMARK_SEED + 9);
	const parts = [baseplate()];
	// 100 Beams between pairs of posts.
	for (let i = 0; i < 100; i++) {
		const x = -60 + (i % 10) * 12;
		const z = -60 + Math.floor(i / 10) * 6;
		const a0 = inst("Attachment", "A0", {
			CFrame: ["CFrame", { position: [0, 4, 0], rotation: IDENTITY }],
		});
		const a1 = inst("Attachment", "A1", {
			CFrame: ["CFrame", { position: [0, 4, 0], rotation: IDENTITY }],
		});
		const beam = inst("Beam", "Beam", {
			Attachment0: ["Ref", a0],
			Attachment1: ["Ref", a1],
			Width0: ["Float32", 1],
			Width1: ["Float32", 1],
			FaceCamera: ["Bool", true],
		});
		parts.push(
			part({ at: [x, 4, z], size: [1, 8, 1] }, [a0, beam]),
			part({ at: [x + 8, 4, z + rand() * 4], size: [1, 8, 1] }, [a1]),
		);
	}
	// 20 ParticleEmitters, together about `particles` live: rate x lifetime.
	const lifetime = 2;
	const rate = particles / 20 / lifetime;
	for (let i = 0; i < 20; i++) {
		const emitter = inst("ParticleEmitter", "ParticleEmitter", {
			Rate: ["Float32", rate],
			Lifetime: ["NumberRange", [lifetime, lifetime]],
			Speed: ["NumberRange", [6, 10]],
		});
		parts.push(
			part({ at: [-50 + (i % 5) * 25, 2, 20 + Math.floor(i / 5) * 15], size: [4, 1, 4] }, [
				emitter,
			]),
		);
	}
	return placeOf(parts);
}

function highlightsPlace(): ViewportPlace {
	const parts = [baseplate()];
	// A Model of three parts, AlwaysOnTop (the default), half behind a wall.
	const model = inst("Model", "Highlighted", {}, [
		part({ at: [-30, 3, 0], size: [6, 6, 6] }),
		part({ at: [-24, 3, 0], size: [6, 6, 6] }),
		part({ at: [-27, 9, 0], size: [6, 6, 6] }),
		inst("Highlight", "Highlight", {}),
	]);
	parts.push(model, part({ at: [-30, 6, 8], size: [4, 12, 1], colour: [90, 110, 140] }));
	// Occluded, behind the same kind of wall.
	parts.push(
		part({ at: [0, 3, 0], size: [8, 6, 8] }, [
			inst("Highlight", "Highlight", {
				DepthMode: ["Enum", 1],
				FillColor: ["Color3", [0, 0.6, 1]],
			}),
		]),
		part({ at: [-2, 6, 8], size: [4, 12, 1], colour: [90, 110, 140] }),
	);
	// By Adornee, from elsewhere in Workspace.
	const target = part({ at: [24, 4, 0], size: [8, 8, 8], shape: 0 });
	parts.push(
		target,
		inst("Highlight", "Highlight", {
			Adornee: ["Ref", target],
			FillColor: ["Color3", [0.2, 1, 0.3]],
		}),
	);
	// A transparent part: left out unless Roswaal's switch keeps it.
	parts.push(
		part({ at: [44, 4, 0], size: [8, 8, 8], transparency: 0.5 }, [
			inst("Highlight", "Highlight", {}),
		]),
	);
	return placeOf(parts);
}

function airPlace(): ViewportPlace {
	const rand = seeded(BENCHMARK_SEED + 11);
	const parts = [baseplate(1600)];
	for (let i = 0; i < 80; i++) {
		const h = 10 + rand() * 60;
		parts.push(
			part({
				at: [(rand() - 0.5) * 600, h / 2, -rand() * 600],
				size: [10 + rand() * 20, h, 10 + rand() * 20],
				colour: [180, 180, 190],
			}),
		);
	}
	for (let i = 0; i < 10; i++)
		parts.push(
			part({ at: [-100 + i * 22, 8, -30], size: [3, 3, 3], material: "Neon", colour: hue(i / 10) }),
		);
	return placeOf(
		parts,
		[
			inst("Atmosphere", "Atmosphere", { Density: ["Float32", 0.4] }),
			inst("BloomEffect", "Bloom", {
				Intensity: ["Float32", 1],
				Size: ["Float32", 24],
				Threshold: ["Float32", 0.9],
			}),
			inst("ColorCorrectionEffect", "ColorCorrection", {
				Contrast: ["Float32", 0.1],
				Saturation: ["Float32", 0.2],
			}),
			inst("BlurEffect", "Blur", { Size: ["Float32", 4] }),
		],
		{
			FogStart: ["Float32", 50],
			FogEnd: ["Float32", 1500],
			FogColor: ["Color3", [0.75, 0.78, 0.82]],
		},
	);
}

/** A city grid of 140 by 140 blocks: 19,600 parts. */
/** How many studs a metre is: Roblox's own guide has a stud at 0.28 m. */
const STUDS_PER_METRE = 1 / 0.28;

/** The parts made as single sheets, DoubleSided in the models' own places. */
const DOUBLE_SIDED = /skirt|track/i;

/** Its tracks and wheels darker than its hull, as the part names say. */
const RUNNING_GEAR = /track|suspension|hubcap|wheel|roadwheel/i;

/**
 * Ninety-six tanks, the sixteen models six times over, each part a MeshPart
 * of its own as a Roblox model would have them: 1,788 MeshParts and 386,520
 * triangles, of 298 meshes.
 */
async function meshesPlace(): Promise<ViewportPlace> {
	const tanks = await loadTanks();
	const rand = seeded(BENCHMARK_SEED + 5);
	const parts = [baseplate(1200)];
	const meshes = new Map<string, FileMesh>();
	const COLUMNS = TANK_NAMES.length;
	const ROWS = 6;
	for (let row = 0; row < ROWS; row++)
		TANK_NAMES.forEach((name, column) => {
			const tank = tanks.get(name) ?? [];
			const yaw = rand() * Math.PI * 2;
			const rotation = aboutY(yaw);
			const at = [(column - (COLUMNS - 1) / 2) * 60, 0, (row - (ROWS - 1) / 2) * 70];
			const body = hue(rand(), 0.35, 0.7);
			// Stood on the ground: the tank's lowest point at y 0.
			const floor = Math.min(...tank.map((p) => p.min[1]));
			tank.forEach((piece, i) => {
				const asset = `${name}.${i}`;
				meshes.set(benchmarkAsset(asset), piece.mesh);
				const size = [0, 1, 2].map((a) =>
					Math.max((piece.max[a] - piece.min[a]) * STUDS_PER_METRE, 0.05),
				);
				const local = [0, 1, 2].map(
					(a) => ((piece.min[a] + piece.max[a]) / 2 - (a === 1 ? floor : 0)) * STUDS_PER_METRE,
				);
				const turned = [0, 1, 2].map(
					(r) =>
						rotation[r * 3] * local[0] +
						rotation[r * 3 + 1] * local[1] +
						rotation[r * 3 + 2] * local[2],
				);
				const mesh = part({
					className: "MeshPart",
					name: piece.name.trim() || "Part",
					at: turned.map((v, a) => v + at[a]),
					size,
					rotation,
					colour: RUNNING_GEAR.test(piece.name) ? [58, 56, 54] : body,
					material: "SmoothPlastic",
				});
				mesh.props.set("MeshId", { type: "Content", value: benchmarkContent(asset) });
				// Skirts and tracks are single sheets, seen from both sides: their models' own DoubleSided.
				if (DOUBLE_SIDED.test(piece.name))
					mesh.props.set("DoubleSided", { type: "Bool", value: true });
				parts.push(mesh);
			});
		});
	return { ...placeOf(parts), provided: { meshes } };
}

/**
 * Kenney's prototype textures as Texture instances: a wall of blocks with a
 * texture on every face, and a floor tiled with them, 162 images in all.
 */
async function texturesPlace(): Promise<ViewportPlace> {
	const loaded = await loadTextures();
	const rand = seeded(BENCHMARK_SEED + 3);
	const parts = [baseplate()];
	const texture = (name: string, face: number, tile: number) => {
		const made = inst("Texture", "Texture", {
			Face: ["Enum", face],
			StudsPerTileU: ["Float32", tile],
			StudsPerTileV: ["Float32", tile],
		});
		made.props.set("Texture", { type: "Content", value: benchmarkContent(name) });
		return made;
	};
	for (let x = 0; x < 6; x++)
		for (let y = 0; y < 4; y++) {
			const faces = [0, 1, 2, 3, 4, 5].map((face) =>
				texture(
					TEXTURE_NAMES[Math.floor(rand() * TEXTURE_NAMES.length)],
					face,
					4 + Math.floor(rand() * 3) * 4,
				),
			);
			parts.push(part({ at: [(x - 2.5) * 20, 9 + y * 20, 0], size: [16, 16, 16] }, faces));
		}
	for (let x = 0; x < 3; x++)
		for (let z = 0; z < 6; z++)
			parts.push(
				part({ at: [(x - 1) * 40, 0.5, 30 + z * 20], size: [40, 1, 20] }, [
					texture(TEXTURE_NAMES[(x * 6 + z) % TEXTURE_NAMES.length], 1, 8),
				]),
			);
	const images = new Map([...loaded].map(([name, image]) => [benchmarkAsset(name), image]));
	return { ...placeOf(parts), provided: { images } };
}

function densePlace(): ViewportPlace {
	const rand = seeded(BENCHMARK_SEED + 12);
	const parts = [baseplate(1600)];
	for (let x = 0; x < 140; x++)
		for (let z = 0; z < 140; z++) {
			const h = 4 + rand() ** 3 * 80;
			parts.push(
				part({
					at: [(x - 69.5) * 10, h / 2, (z - 69.5) * 10],
					size: [6, h, 6],
					colour: hue(rand(), 0.25, 0.85),
				}),
			);
		}
	return placeOf(parts);
}

const one = (
	place: () => ViewportPlace | Promise<ViewportPlace>,
	settleMs?: number,
): StationVariant[] => [{ label: "", place, ...(settleMs ? { settleMs } : {}) }];

export const STATIONS: readonly Station[] = [
	{
		n: 1,
		id: "empty",
		name: "Empty",
		measures: "What every frame costs",
		pose: { eye: [0, 40, 120], at: [0, 0, 0] },
		variants: one(() => placeOf([baseplate()])),
	},
	{
		n: 2,
		id: "materials",
		name: "Materials",
		measures: "Material textures, grain, reflections",
		pose: { eye: [0, 30, 150], at: [0, 22, 0] },
		variants: one(materialsPlace),
	},
	{
		n: 3,
		id: "textures",
		name: "Textures",
		measures: "Texture instances, tiled, on every face",
		pose: { eye: [0, 60, 190], at: [0, 30, 40] },
		variants: one(texturesPlace),
	},
	{
		n: 4,
		id: "shapes",
		name: "Shapes",
		measures: "Shape variety and instancing",
		pose: { eye: [0, 90, 170], at: [0, 0, 0] },
		variants: one(shapesPlace),
	},
	{
		n: 5,
		id: "meshes",
		name: "Meshes",
		measures: "MeshParts: many meshes, many triangles",
		pose: { eye: [-360, 150, -290], at: [0, 0, 20] },
		variants: one(meshesPlace),
	},
	{
		n: 6,
		id: "skyLight",
		name: "Sky light",
		measures: "Sky shadows, near maps, thin parts, cells",
		pose: { eye: [10, 50, 130], at: [0, 6, 0] },
		variants: one(skyLightPlace),
	},
	{
		n: 7,
		id: "sunShadows",
		name: "Sun shadows",
		measures: "Cascades, reach, soft edges, far shadows",
		pose: { eye: [-80, 90, 260], at: [220, 20, 0] },
		variants: one(sunShadowsPlace),
	},
	{
		n: 8,
		id: "lights",
		name: "Lights",
		measures: "The per-pixel light loop",
		pose: { eye: [0, 60, 90], at: [0, 0, 0] },
		variants: [10, 20, 50, 100].map((count) => ({
			label: `${count} lights`,
			place: () => lightsPlace(count),
		})),
	},
	{
		n: 9,
		id: "seeThrough",
		name: "See-through",
		measures: "The blended pass and its sorting",
		pose: { eye: [0, 25, 90], at: [0, 8, -10] },
		variants: one(seeThroughPlace),
	},
	{
		n: 10,
		id: "glow",
		name: "Glow",
		measures: "Glow sources, blur, bloom",
		pose: { eye: [0, 30, 90], at: [0, 10, -10] },
		variants: one(glowPlace),
	},
	{
		n: 11,
		id: "effects",
		name: "Effects",
		// To 20,000: the most particles Roswaal keeps alive in a view (PARTICLES_MOST).
		measures: "Particles simulated on the CPU, against drawing them",
		pose: { eye: [0, 50, 110], at: [0, 5, 0] },
		variants: [1000, 10000, 20000].map((count) => ({
			label: `${count.toLocaleString("en")} particles`,
			place: () => effectsPlace(count),
			// Long enough for each emitter's particles to reach their lifetime.
			settleMs: 2500,
		})),
	},
	{
		n: 12,
		id: "highlights",
		name: "Highlights",
		measures: "The Highlight mask and overlay",
		pose: { eye: [8, 25, 60], at: [8, 4, 0] },
		variants: one(highlightsPlace),
	},
	{
		n: 13,
		id: "air",
		name: "Air and post",
		measures: "Atmosphere, fog, Bloom, ColorCorrection, Blur",
		pose: { eye: [0, 40, 120], at: [0, 20, -200] },
		variants: one(airPlace),
	},
	{
		n: 14,
		id: "reflections",
		name: "Reflections",
		measures: "The reflection cube, and what reflects reading it",
		pose: { eye: [0, 22, 70], at: [0, 3, 0] },
		variants: one(reflectionsPlace),
	},
	{
		n: 15,
		id: "bloom",
		name: "Bloom",
		measures: "A BloomEffect over bright parts, no Neon",
		pose: { eye: [0, 30, 80], at: [0, 8, -50] },
		variants: one(bloomPlace),
	},
	{
		n: 16,
		id: "dense",
		name: "Dense",
		measures: "Draw counts, culling, many shadow casters",
		pose: { eye: [-500, 380, -500], at: [0, 0, 0] },
		variants: one(densePlace),
	},
	{
		n: 17,
		id: "moving",
		name: "Moving",
		measures: "What each control's motion costs",
		pose: { eye: [-500, 380, -500], at: [0, 0, 0] },
		variants: one(densePlace),
		allMotions: true,
	},
];
