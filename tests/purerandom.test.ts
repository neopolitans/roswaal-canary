/**
 * Random BrickColor and Now are values, as Random is: each wire reads its
 * own. A graph from before, with execution wires through them, loads with
 * those wires joined.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { migrateScript } from "../src/core/migrate.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

describe("Random BrickColor and Now", () => {
	it("are pure", () => {
		for (const id of ["brickcolor.random", "datetime.now", "math.random"])
			expect(registry.get(id)?.pure, id).toBe(true);
	});

	it("inline where they are read", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const random = b.node("brickcolor.random");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(random, "result", print, "value");
		expect(body(compile(b.build(), registry).code)).toContain("print(BrickColor.random())");
	});

	it("join the execution wires that ran through them in an older graph", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const random = b.node("brickcolor.random", { id: "rnd" });
		const print = b.node("debug.print");
		b.link(start, "then", random, "in");
		b.link(random, "then", print, "in");
		b.link(random, "result", print, "value");
		const { script, notes } = migrateScript(b.build());
		expect(notes.join(" ")).toContain("now pure");
		expect(script.links).toContainEqual(
			expect.objectContaining({
				from: { node: start, pin: "then" },
				to: { node: print, pin: "in" },
			}),
		);
	});
});
