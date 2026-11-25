/**
 * The pixel probe, in the Rendering panel's Inspect tab: a tap on the view,
 * and what is there. Which part and material; how many light objects reach
 * the spot, and of which kinds; whether the sun reaches it; how much of the
 * sky it sees; what that makes it cost to shade.
 *
 * Worked out on the CPU from the place's own parts, as a click's pick is,
 * rather than read back from the GPU: the same answer on every renderer, and
 * nothing the frame has to wait for. Shadows and sky are rays against the
 * parts' shapes, so they say what the place's geometry does, which is what
 * the view's shadow maps and sky visibility approximate.
 */

import { MATERIALS } from "../../core/materials.js";
import {
	LIGHT_POINT,
	LIGHT_SPOT,
	LIGHT_STRIDE,
	LIGHT_SURFACE,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
} from "../../core/scene.js";
import { rayHit } from "./geometry.js";

export interface ProbeResult {
	/** The part's row in the DataModel browser. */
	row: number;
	/** Where the ray met it, and the face's outward normal there. */
	point: number[];
	normal: number[];
	/** From the eye, in studs. */
	distance: number;
	material: string;
	lights: { total: number; point: number; spot: number; surface: number };
	sun: "lit" | "in shadow" | "faces away";
	/** The share of the sky the spot sees, 0 to 1, over the half facing out of its face. */
	sky: number;
}

/** Rays cast over the half-sphere for the sky's share. */
export const SKY_RAYS = 48;
/** How far off the face the shadow and sky rays start, so they do not meet it. */
const LIFT = 0.02;

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: number[], b: number[], s = 1) => [
	a[0] + b[0] * s,
	a[1] + b[1] * s,
	a[2] + b[2] * s,
];
const norm = (a: number[]) => {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
};

/** A part's material name, from its row in the scene's data. */
function materialOf(scene: PlaceScene, id: number): string {
	for (const set of [scene.kinds, scene.translucent])
		for (const kind of SCENE_KINDS) {
			const { data, count } = set[kind];
			const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
			for (let i = 0; i < count; i++) {
				const at = i * SCENE_STRIDE;
				if (words[at + 13] === id) return MATERIALS[words[at + 14] & 0xff]?.name ?? "Plastic";
			}
		}
	return "Plastic";
}

/** The light objects whose light reaches `point`, by kind: within Range, and inside a SpotLight's or SurfaceLight's angle. */
export function lightsReaching(lights: readonly number[] | undefined, point: number[]) {
	const out = { total: 0, point: 0, spot: 0, surface: 0 };
	if (!lights) return out;
	for (let i = 0; i + LIGHT_STRIDE <= lights.length; i += LIGHT_STRIDE) {
		const to = [point[0] - lights[i], point[1] - lights[i + 1], point[2] - lights[i + 2]];
		const far = Math.hypot(to[0], to[1], to[2]);
		if (far > lights[i + 3]) continue;
		const kind = lights[i + 7];
		if (kind !== LIGHT_POINT && far > 1e-6) {
			const way = norm([lights[i + 8], lights[i + 9], lights[i + 10]]);
			const cos = dot(way, to) / far;
			if (cos < Math.cos(Math.min(Math.max(lights[i + 11], 0), Math.PI / 2))) continue;
		}
		out.total++;
		if (kind === LIGHT_POINT) out.point++;
		else if (kind === LIGHT_SPOT) out.spot++;
		else if (kind === LIGHT_SURFACE) out.surface++;
	}
	return out;
}

/**
 * Even directions over the half-sphere about `n`, weighted towards it as
 * light from the sky falls: a Fibonacci spiral, the same every time.
 */
export function hemisphere(n: number[], count = SKY_RAYS): number[][] {
	const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
	const t = norm([a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]]);
	const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
	const golden = Math.PI * (3 - Math.sqrt(5));
	const out: number[][] = [];
	for (let i = 0; i < count; i++) {
		const up = Math.sqrt(1 - (i + 0.5) / count);
		const side = Math.sqrt(1 - up * up);
		const turn = i * golden;
		out.push(
			norm(
				add(
					add(
						n.map((x) => x * up),
						t,
						side * Math.cos(turn),
					),
					b,
					side * Math.sin(turn),
				),
			),
		);
	}
	return out;
}

/** What is at the end of a ray from `eye` along `dir`, or null where it meets nothing. */
export function probeAt(
	scene: PlaceScene,
	eye: number[],
	dir: number[],
	sun: number[],
): ProbeResult | null {
	const hit = rayHit(scene, eye, dir);
	if (!hit) return null;
	const point = add(eye, dir, hit.t);
	const normal = norm(hit.normal);
	const from = add(point, normal, LIFT);
	// The part itself is passed through: its own face would shade every ray.
	const itself = (id: number) => id === hit.id;
	const toSun = norm(sun);
	const sunState: ProbeResult["sun"] =
		dot(normal, toSun) <= 0
			? "faces away"
			: rayHit(scene, from, toSun, itself)
				? "in shadow"
				: "lit";
	const rays = hemisphere(normal);
	const open = rays.filter((ray) => !rayHit(scene, from, ray, itself)).length;
	return {
		row: hit.id,
		point,
		normal,
		distance: hit.t * Math.hypot(dir[0], dir[1], dir[2]),
		material: materialOf(scene, hit.id),
		lights: lightsReaching(scene.lights, point),
		sun: sunState,
		sky: open / rays.length,
	};
}

/** How costly the spot is to shade, in words: what the probe found makes it so. */
export function probeCost(result: ProbeResult): { level: "low" | "medium" | "high"; why: string } {
	const { lights } = result;
	if (lights.total >= 8)
		return { level: "high", why: `${lights.total} light objects reach it, each worked out here` };
	if (lights.total >= 3) return { level: "medium", why: `${lights.total} light objects reach it` };
	return {
		level: "low",
		why:
			lights.total === 0 ? "no light objects reach it" : `${lights.total} light objects reach it`,
	};
}
