import { describe, expect, it } from "vitest";
import {
	CameraHeading,
	nearSkyCentre,
	nearSkyInto,
	SKY_BLOCK,
	SKY_LAYERS,
	SKY_NEAR,
	SKY_NEAR_LAYER,
	SKY_NEAR_LEAD,
	SKY_NEAR_RECENTRE,
	SKY_NEAR_SNAP,
	skyBlock,
} from "../src/extensions/placeEditor/app/viewport/view.js";

const box = { min: [-5000, -50, -2000], max: [2000, 1800, 2000] };

function project(block: Float32Array, layer: number, p: number[]): number[] {
	const m = block.subarray(layer * 16, layer * 16 + 16);
	return [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
}

describe("the near sky maps", () => {
	it("stay where they are until the camera is far from their centre, then move ahead of it", () => {
		// First drawn: round the camera, on the snap's grid.
		expect(nearSkyCentre([10, 30, -20])).toEqual([8, 32, -16]);
		const at = [0, 0, 0];
		// Inside the reach along every axis: kept, the same array.
		expect(nearSkyCentre([SKY_NEAR_RECENTRE, -40, 30], at, [1, 0, 0])).toBe(at);
		// Past it: put ahead of the camera along its way, by the lead.
		const moved = nearSkyCentre([SKY_NEAR_RECENTRE + 1, 0, 0], at, [2, 0, 0]);
		expect(moved).toEqual([
			Math.round((SKY_NEAR_RECENTRE + 1 + SKY_NEAR_LEAD) / SKY_NEAR_SNAP) * SKY_NEAR_SNAP,
			0,
			0,
		]);
		// Not moving: round the camera.
		expect(nearSkyCentre([200, 0, 0], at, [0, 0, 0])).toEqual([200, 0, 0]);
	});

	it("leave the camera inside the reach once moved, whichever way it goes", () => {
		for (const way of [
			[1, 0, 0],
			[1, 1, 1],
			[-3, 0.5, 2],
			[0, -1, 0],
		]) {
			const eye = [123.4, 56.7, -890.1];
			const centre = nearSkyCentre(eye, [0, 0, 0], way);
			const off = Math.max(...eye.map((v, a) => Math.abs(v - centre[a])));
			expect(off).toBeLessThanOrEqual(SKY_NEAR_RECENTRE);
			// So the next frame keeps it.
			expect(nearSkyCentre(eye, centre, way)).toBe(centre);
		}
	});

	it("go between redraws twice and more the old 48-stud step, full detail kept 80 studs every way", () => {
		const reach = SKY_NEAR * 0.75 - SKY_NEAR_RECENTRE;
		expect(reach).toBeGreaterThanOrEqual(80);
		// Flying straight along x a stud a frame: how far between redraws.
		const heading = new CameraHeading();
		let centre: number[] | null = null;
		const moves: number[] = [];
		let last = 0;
		for (let x = 0; x < 2000; x++) {
			const eye = [x, 10, 0];
			const next = nearSkyCentre(eye, centre, heading.update(eye));
			if (next !== centre) {
				if (centre) moves.push(x - last);
				last = x;
				centre = next;
			}
		}
		const typical = moves.slice(1).reduce((s, m) => s + m, 0) / (moves.length - 1);
		expect(typical).toBeGreaterThan(110);
	});

	it("follow the whole place's views in the block, with their texel and their box", () => {
		const block = skyBlock(box, [0, 1, 0], true);
		expect(block.length).toBe(SKY_BLOCK);
		nearSkyInto(block, box, [96, 4992, 0], true);
		const at = 16 * SKY_LAYERS;
		expect(block[at + 3]).toBe(1);
		expect(block[at + 7]).toBe(1);
		expect(Array.from(block.subarray(at + 8, at + 12))).toEqual([96, 4992, 0, SKY_NEAR]);
		// A texel well under a wall's width, where the whole place's are many studs.
		expect(block[at + 4]).toBeLessThan(1);
		expect(block[at]).toBeGreaterThan(5);
	});

	it("see their centre in the middle of each map, and the box's corners within it", () => {
		const block = skyBlock(box, [0, 1, 0], true);
		const centre = [96, 4992, 0];
		nearSkyInto(block, box, centre, true);
		for (let k = 0; k < 8; k++) {
			const c = project(block, SKY_NEAR_LAYER + k, centre);
			expect(Math.abs(c[0] / c[3])).toBeLessThan(1e-4);
			expect(Math.abs(c[1] / c[3])).toBeLessThan(1e-4);
			for (const dx of [-1, 1])
				for (const dz of [-1, 1]) {
					const q = project(block, SKY_NEAR_LAYER + k, [
						96 + dx * SKY_NEAR,
						4992 + SKY_NEAR,
						dz * SKY_NEAR,
					]);
					expect(Math.abs(q[0])).toBeLessThanOrEqual(1);
					expect(Math.abs(q[1])).toBeLessThanOrEqual(1);
				}
		}
	});

	it("reach far enough towards the sky to hold a roof far above", () => {
		const block = skyBlock(box, [0, 1, 0], true);
		nearSkyInto(block, box, [0, 0, 0], true);
		// Straight up is the first direction: a roof 1,500 studs up is in front of the map.
		const roof = project(block, SKY_NEAR_LAYER, [0, 1500, 0]);
		const floor = project(block, SKY_NEAR_LAYER, [0, 0, 0]);
		expect(roof[2]).toBeGreaterThanOrEqual(0);
		expect(roof[2]).toBeLessThan(floor[2]);
		expect(floor[2]).toBeLessThanOrEqual(1);
	});
});
