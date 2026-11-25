/**
 * The pixel probe: a tap on the view, and what is there. Rays against the
 * parts' own shapes say which part, whether the sun reaches it, how much sky
 * it sees, and which light objects reach it.
 */

import { describe, expect, it } from "vitest";

import {
	hemisphere,
	lightsReaching,
	probeAt,
	probeCost,
	SKY_RAYS,
} from "../src/extensions/placeEditor/app/viewport/probe.js";
import {
	LIGHT_POINT,
	LIGHT_SPOT,
	LIGHT_STRIDE,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneKind,
} from "../src/extensions/placeEditor/core/scene.js";

/** Unrotated parts, each a shape, a size, a place, an id and a material number. */
function sceneOf(
	parts: { kind: SceneKind; size: number[]; at: number[]; id: number; material?: number }[],
	lights: number[] = [],
): PlaceScene {
	const empty = () =>
		Object.fromEntries(
			SCENE_KINDS.map((k) => [k, { data: new Float32Array(), count: 0 }]),
		) as PlaceScene["kinds"];
	const kinds = empty();
	for (const k of SCENE_KINDS) {
		const mine = parts.filter((p) => p.kind === k);
		const data = new Float32Array(mine.length * SCENE_STRIDE);
		const words = new Uint32Array(data.buffer);
		mine.forEach((p, i) => {
			const at = i * SCENE_STRIDE;
			data.set([p.size[0], 0, 0, 0, p.size[1], 0, 0, 0, p.size[2], ...p.at], at);
			words[at + 13] = p.id;
			words[at + 14] = p.material ?? 0;
		});
		kinds[k] = { data, count: mine.length };
	}
	return { kinds, translucent: empty(), centre: [0, 0, 0], radius: 50, transparent: 0, lights };
}

/** A light's 20 floats: where, Range, colour and kind, the way it faces and half its Angle. */
function light(kind: number, at: number[], range: number, way = [0, -1, 0], half = Math.PI / 4) {
	const l = new Array(LIGHT_STRIDE).fill(0);
	l.splice(0, 4, ...at, range);
	l.splice(4, 4, 1, 1, 1, kind);
	l.splice(8, 4, ...way, half);
	return l;
}

const floor = { kind: "block" as const, size: [40, 1, 40], at: [0, 0, 0], id: 1 };
const roof = { kind: "block" as const, size: [10, 1, 10], at: [10, 6, 0], id: 2 };
const sun = [0, 1, 0];
const down = [0, -1, 0];

describe("the probe", () => {
	it("finds the part, the point and its face", () => {
		const found = probeAt(sceneOf([floor]), [0, 20, 0], down, sun);
		expect(found?.row).toBe(1);
		expect(found?.point[1]).toBeCloseTo(0.5);
		expect(found?.normal).toEqual([0, 1, 0]);
		expect(found?.distance).toBeCloseTo(19.5);
	});

	it("says nothing where the ray meets nothing", () => {
		expect(probeAt(sceneOf([floor]), [0, 20, 0], [0, 1, 0], sun)).toBeNull();
	});

	/** Under the roof the sun is shut out and half the sky with it; out in the open, neither. */
	it("says whether the sun reaches it, and how much sky it sees", () => {
		const scene = sceneOf([floor, roof]);
		const open = probeAt(scene, [-10, 20, 0], down, sun);
		expect(open?.sun).toBe("lit");
		expect(open?.sky).toBe(1);
		const under = probeAt(scene, [10, 3, 0], down, sun);
		expect(under?.row).toBe(1);
		expect(under?.sun).toBe("in shadow");
		expect(under?.sky).toBeGreaterThan(0);
		expect(under?.sky).toBeLessThan(0.6);
	});

	it("says a face turned from the sun faces away", () => {
		const found = probeAt(sceneOf([floor]), [0, -20, 0], [0, 1, 0], sun);
		expect(found?.normal).toEqual([0, -1, 0]);
		expect(found?.sun).toBe("faces away");
	});
});

describe("the lights reaching a spot", () => {
	it("counts those in range, and a SpotLight only inside its angle", () => {
		const lights = [
			...light(LIGHT_POINT, [0, 3, 0], 8),
			...light(LIGHT_POINT, [0, 30, 0], 8),
			// Straight above, facing down: reaches. Facing up: does not.
			...light(LIGHT_SPOT, [0, 4, 0], 10, [0, -1, 0]),
			...light(LIGHT_SPOT, [0, 4, 0], 10, [0, 1, 0]),
		];
		expect(lightsReaching(lights, [0, 0.5, 0])).toEqual({
			total: 2,
			point: 1,
			spot: 1,
			surface: 0,
		});
	});

	it("makes a spot many lights reach costly to shade", () => {
		const many = Array.from({ length: 9 }, (_, i) => light(LIGHT_POINT, [i * 0.1, 2, 0], 8)).flat();
		const found = probeAt(sceneOf([floor], many), [0, 20, 0], down, sun);
		expect(found?.lights.total).toBe(9);
		expect(found && probeCost(found).level).toBe("high");
		expect(
			probeCost({
				...(found as NonNullable<typeof found>),
				lights: { total: 0, point: 0, spot: 0, surface: 0 },
			}).level,
		).toBe("low");
	});
});

describe("the sky's rays", () => {
	it("cover the half facing out of the face, and only it", () => {
		const rays = hemisphere([0, 1, 0]);
		expect(rays).toHaveLength(SKY_RAYS);
		for (const ray of rays) {
			expect(ray[1]).toBeGreaterThan(0);
			expect(Math.hypot(ray[0], ray[1], ray[2])).toBeCloseTo(1);
		}
	});
});
