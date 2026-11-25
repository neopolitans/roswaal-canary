import {
	emptyScript,
	type GraphNode,
	type Link,
	type Literal,
	type NodeScript,
	type ScriptVariable,
} from "../src/core/schema.js";

/** Terse graph construction, so the tests read like the graph they describe. */
export class Builder {
	script: NodeScript;
	private n = 0;

	constructor(name = "Test") {
		this.script = emptyScript(name, "graph-test");
	}

	node(def: string, opts: Partial<GraphNode> = {}): string {
		this.n += 1;
		const id = opts.id ?? `n${this.n}`;
		this.script.nodes.push({
			id,
			def,
			x: (this.n % 6) * 220,
			y: Math.floor(this.n / 6) * 160,
			...opts,
		});
		return id;
	}

	variable(name: string, type: string, value: Literal): string {
		const id = `v_${name}`;
		const variable: ScriptVariable = { id, name, type, default: value };
		this.script.variables.push(variable);
		return id;
	}

	lit(nodeId: string, pin: string, value: Literal): this {
		const node = this.script.nodes.find((x) => x.id === nodeId)!;
		node.literals = { ...(node.literals ?? {}), [pin]: value };
		return this;
	}

	link(from: string, fromPin: string, to: string, toPin: string): this {
		const link: Link = {
			id: `l${this.script.links.length + 1}`,
			from: { node: from, pin: fromPin },
			to: { node: to, pin: toPin },
		};
		this.script.links.push(link);
		return this;
	}

	build(patch: Partial<NodeScript> = {}): NodeScript {
		return { ...this.script, ...patch };
	}
}

/** Everything after the generated header, which carries volatile hashes. */
export function body(code: string): string {
	const lines = code.split("\n");
	const start = lines.findIndex((l) => l.startsWith("-- roswaal-output:"));
	return lines
		.slice(start + 1)
		.join("\n")
		.trim();
}

/**
 * A test source with its cursor marker taken out, and where the marker was.
 * Only the first `|`: Luau's union types use the character too.
 */
export function cursorIn(source: string): { doc: string; pos: number } {
	const pos = source.indexOf("|");
	if (pos < 0) return { doc: source, pos };
	return { doc: source.slice(0, pos) + source.slice(pos + 1), pos };
}

/**
 * Markup's text with every tag taken out, read a character at a time: a
 * pattern can leave a tag behind where removing one joins the halves of
 * another.
 */
export function withoutTags(html: string): string {
	let text = "";
	let inTag = false;
	for (const ch of html) {
		if (ch === "<") inTag = true;
		else if (ch === ">" && inTag) inTag = false;
		else if (!inTag) text += ch;
	}
	return text;
}

/** `text` matched literally inside a regular expression. */
export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
