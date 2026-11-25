/**
 * `--!native` and `--!optimize` on the graph, `@native` and `@deprecated` on
 * its functions (1.1.0): written to the file, and read back on import.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, type ImportOptions, importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

function imported(src: string, options: Partial<ImportOptions> = {}): NodeScript {
	const { name, scriptClass } = graphNameOf("Test.server.luau");
	const result = importLuau(src, {
		name,
		scriptClass,
		target: "roblox",
		idPrefix: "t",
		...options,
	});
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

const code = (s: NodeScript) => compile(s, registry).code;
const functions = (s: NodeScript) => s.nodes.filter((n) => n.def === "function.declareHere");

describe("the graph's --!native and --!optimize", () => {
	it("write nothing when unset", () => {
		const out = code(new Builder().build({ typecheck: "strict" }));
		expect(out).not.toContain("--!native");
		expect(out).not.toContain("--!optimize");
	});

	it("write their lines under the mode line", () => {
		const out = code(new Builder().build({ typecheck: "strict", native: true, optimize: 2 }));
		expect(out.split("\n").slice(0, 3)).toEqual(["--!strict", "--!native", "--!optimize 2"]);
	});

	it("change the source hash only when set", () => {
		const plain = code(new Builder().build());
		const hash = (s: string) => /roswaal-source: (\w+)/.exec(s)?.[1];
		expect(hash(code(new Builder().build({ optimize: 0 })))).not.toBe(hash(plain));
		expect(hash(code(new Builder().build({ native: false })))).toBe(hash(plain));
	});

	it("are read back from an imported file", () => {
		const s = imported("--!strict\n--!native\n--!optimize 1\nprint(1)\n");
		expect([s.typecheck, s.native, s.optimize]).toEqual(["strict", true, 1]);
		const none = imported("print(1)\n");
		expect([none.native, none.optimize]).toEqual([undefined, undefined]);
	});
});

describe("@native and @deprecated on a function", () => {
	it("are written above a hoisted function", () => {
		const b = new Builder();
		b.node("function.entry", {
			config: { name: "go", params: [], returns: [], native: true, deprecated: true },
		});
		expect(code(b.build())).toMatch(/@native\n@deprecated\nlocal function go\(\)/);
	});

	it("are written above a Declare Function", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "go", params: [], returns: [], native: true },
		});
		b.link(start, "then", fn, "in");
		expect(code(b.build())).toMatch(/@native\nlocal function go\(\)/);
	});

	it("are kept by the node when imported, plain or bracketed", () => {
		const s = imported(
			"@native\nlocal function go()\n\tprint(1)\nend\n@[deprecated]\nfunction old()\nend\n",
		);
		const [go, old] = functions(s);
		expect(go.config).toMatchObject({ name: "go", native: true });
		expect(old.config).toMatchObject({ name: "old", deprecated: true });
		const out = code(s);
		expect(out).toMatch(/@native\nlocal function go\(\)/);
		expect(out).toMatch(/@deprecated\nfunction old\(\)/);
	});

	it("keep a function as code when an attribute is another one, or has arguments", () => {
		for (const src of [
			'@[deprecated {use = "neu"}]\nlocal function go()\nend\n',
			"@checked\nlocal function go()\nend\n",
		]) {
			const s = imported(src);
			expect(functions(s), src).toEqual([]);
			expect(code(s), src).toContain("local function go()");
		}
	});
});
