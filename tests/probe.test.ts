/**
 * Scene reflections' cube: a point drawn through a face's view-projection
 * lands where a cube lookup of its direction reads, in WebGPU's texel order
 * and in WebGL's.
 */

import { describe, expect, it } from "vitest";
import {
	cubeLookup,
	PROBE_FAR,
	PROBE_NEAR,
	probeFaces,
} from "../src/extensions/placeEditor/app/viewport/view.js";

const apply = (m: Float32Array, p: number[]) =>
	[0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

describe("the reflection cube's faces", () => {
	const eye = [12, 5030, -40];
	const dirs = [
		[1, 0.2, -0.3],
		[-1, 0.4, 0.1],
		[0.2, 1, 0.3],
		[0.1, -1, -0.4],
		[0.3, -0.2, 1],
		[-0.4, 0.1, -1],
		[0.7, -0.6, 0.2],
	];

	for (const upward of [false, true]) {
		it(`draw each direction where a lookup reads it (${upward ? "WebGL" : "WebGPU"})`, () => {
			const faces = probeFaces(eye, upward);
			for (const d of dirs) {
				const { face, u, v } = cubeLookup(d);
				const p = d.map((x, a) => eye[a] + x * 50);
				const [x, y, z, w] = apply(faces[face], p);
				expect(w).toBeGreaterThan(0);
				expect((x / w + 1) / 2).toBeCloseTo(u, 5);
				// WebGPU's rows run down as clip y falls; WebGL's run up as it rises.
				const row = upward ? (y / w + 1) / 2 : (1 - y / w) / 2;
				expect(row).toBeCloseTo(v, 5);
				const depth = z / w;
				expect(depth).toBeGreaterThan(upward ? -1 : 0);
				expect(depth).toBeLessThan(1);
			}
		});
	}

	it("put the near and far planes at the ends of depth", () => {
		const [face] = probeFaces(eye, false);
		const at = (dist: number) => {
			const [, , z, w] = apply(face, [eye[0] + dist, eye[1], eye[2]]);
			return z / w;
		};
		expect(at(PROBE_NEAR)).toBeCloseTo(0, 5);
		expect(at(PROBE_FAR)).toBeCloseTo(1, 5);
	});
});
