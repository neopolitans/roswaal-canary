/**
 * Syncback (1.1.0): a generated file somebody changed since it was compiled,
 * brought back into its graph. The route answers the graph rather than
 * writing it, keeping the graph's identity, so the editor takes it as one
 * edit; compiled with force, the file is the graph's again and says what
 * the edit said.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NodeScript } from "../src/core/schema.js";
import { type CompileOutcome, editedOutput } from "../src/server/compile.js";
import { ApiSession } from "../src/server/routes.js";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo");
const GRAPH = ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript";
const OUTPUT = "src/ReplicatedStorage/Shared/Greeter.luau";

let base: string;
let session: ApiSession;
const abs = () => path.join(base, OUTPUT);

beforeAll(async () => {
	base = await mkdtemp(path.join(tmpdir(), "roswaal-syncback-"));
	await cp(DEMO, base, { recursive: true });
	session = new ApiSession();
	await session.openAt(base);
	await session.handle("POST", "/compile", { body: { path: GRAPH, write: true, force: true } });
});

afterAll(async () => {
	await rm(base, { recursive: true, force: true });
});

const compile = async (force: boolean) =>
	(
		(await session.handle("POST", "/compile", { body: { path: GRAPH, write: true, force } })) as {
			results: CompileOutcome[];
		}
	).results[0];

describe("syncback", () => {
	it("finds nothing to bring back in a file as the graph wrote it", async () => {
		expect(editedOutput(await readFile(abs(), "utf8"))).toBeNull();
		await expect(
			session.handle("POST", "/script/syncback", { body: { path: GRAPH } }),
		).rejects.toThrow(/nothing to bring back/);
	});

	it("brings an edited file into its graph, which then compiles to what the edit said", async () => {
		const before = (
			(await session.handle("GET", "/script", { query: { path: GRAPH } })) as { script: NodeScript }
		).script;
		const text = await readFile(abs(), "utf8");
		// An edit made outside Roswaal: a line added before the module's return.
		const lines = text.trimEnd().split("\n");
		lines.splice(lines.length - 1, 0, 'print("synced back")');
		await writeFile(abs(), `${lines.join("\n")}\n`);
		expect((await compile(false)).skipped).toMatch(/edited by hand/);
		const edited = editedOutput(await readFile(abs(), "utf8"));
		expect(edited).toContain('print("synced back")');
		expect(edited).not.toContain("roswaal-output");

		const { script } = (await session.handle("POST", "/script/syncback", {
			body: { path: GRAPH },
		})) as { script: NodeScript };
		expect([script.id, script.name, script.scriptClass, script.target]).toEqual([
			before.id,
			before.name,
			before.scriptClass,
			before.target,
		]);
		// Answered, not written: the graph on disk is as it was until the editor saves it.
		const onDisk = (
			(await session.handle("GET", "/script", { query: { path: GRAPH } })) as { script: NodeScript }
		).script;
		expect(onDisk.nodes.length).toBe(before.nodes.length);

		await session.handle("PUT", "/script", { body: { path: GRAPH, script } });
		const outcome = await compile(true);
		expect(outcome.written).toBe(true);
		const after = await readFile(abs(), "utf8");
		expect(after).toContain('print("synced back")');
		expect(editedOutput(after)).toBeNull();
	});
});
