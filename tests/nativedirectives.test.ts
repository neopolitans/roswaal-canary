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

	it("keep a function as code when an attribute is another one, or its arguments are not use and reason", () => {
		for (const src of [
			"@checked\nlocal function go()\nend\n",
			'@[deprecated "neu"]\nlocal function go()\nend\n',
			'@[deprecated {since = "2"}]\nlocal function go()\nend\n',
			"@[deprecated {use = 1}]\nlocal function go()\nend\n",
			'@[native("x")]\nlocal function go()\nend\n',
			"@native @native\nlocal function go()\nend\n",
		]) {
			const s = imported(src);
			expect(functions(s), src).toEqual([]);
			expect(code(s), src).toContain("local function go()");
		}
	});
});

describe("a deprecation's use and reason (1.1.0-canary.126)", () => {
	const declared = (config: Record<string, unknown>) => {
		const b = new Builder();
		b.node("function.entry", { config: { name: "old", params: [], returns: [], ...config } });
		return code(b.build());
	};

	it("are written in the bracketed form the Luau linter reads", () => {
		expect(declared({ deprecated: true, deprecatedUse: "neu()" })).toContain(
			'@[deprecated {use = "neu()"}]\nlocal function old()',
		);
		expect(
			declared({ deprecated: true, deprecatedUse: "neu()", deprecatedReason: 'Says "why".' }),
		).toContain('@[deprecated {use = "neu()", reason = "Says \\"why\\"."}]');
		expect(declared({ native: true, deprecated: true, deprecatedReason: "Old." })).toContain(
			'@native\n@[deprecated {reason = "Old."}]\nlocal function old',
		);
	});

	it("write plain @deprecated when blank, and nothing when not deprecated", () => {
		expect(declared({ deprecated: true, deprecatedUse: "  " })).toContain(
			"\n@deprecated\nlocal function old",
		);
		expect(declared({ deprecatedUse: "neu()" })).not.toContain("deprecated");
	});

	it("are read back on import, with @native in the same brackets", () => {
		const s = imported(
			'@[native, deprecated {use = \'neu()\', reason = "Line\\none \\"two\\""}]\nlocal function old()\nend\n',
		);
		const [old] = functions(s);
		expect(old.config).toMatchObject({
			name: "old",
			native: true,
			deprecated: true,
			deprecatedUse: "neu()",
			deprecatedReason: 'Line\none "two"',
		});
		expect(code(s)).toContain(
			'@native\n@[deprecated {use = "neu()", reason = "Line\\none \\"two\\""}]\nlocal function old()',
		);
	});

	it("round trip what they write", () => {
		const out = declared({
			deprecated: true,
			deprecatedUse: "a\tb\\c",
			deprecatedReason: "\u0001",
		});
		const [old] = functions(imported(out));
		expect(old.config).toMatchObject({ deprecatedUse: "a\tb\\c", deprecatedReason: "\u0001" });
	});
});
