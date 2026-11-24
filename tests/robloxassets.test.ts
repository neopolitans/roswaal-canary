/**
 * What Sign in with Roblox downloads: kept in the project's `.roswaal/assets`,
 * out of Git (the daemon), or in the site's browser storage (the website), fetched only from Roblox's CDN and without the token, Roblox's
 * own assets never downloaded, unused ones expiring, and every project's
 * deleted on signing out.
 */

import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	ASSET_FOLDER,
	AssetCache,
	isRobloxCdn,
	LARGEST_ASSET,
} from "../src/extensions/placeEditor/server/roblox/assets.js";
import {
	BROWSER_ASSET_FOLDER,
	browserShelf,
} from "../src/extensions/placeEditor/server/roblox/browserShelf.js";
import {
	downloadRegistry,
	projectShelf,
} from "../src/extensions/placeEditor/server/roblox/projectShelf.js";

let base: string;
beforeEach(async () => {
	base = await mkdtemp(path.join(tmpdir(), "roswaal-assets-"));
});
afterEach(async () => {
	await rm(base, { recursive: true, force: true });
});

interface Seen {
	url: string;
	auth: string | null;
}

/** Roblox's two APIs and its CDN, as the cache sees them. */
function fakeRoblox(options: {
	creator?: Record<string, string>;
	location?: (id: string) => string;
	size?: number;
	redirectedTo?: string;
}) {
	const seen: Seen[] = [];
	const fetchFn = (async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		seen.push({ url, auth: new Headers(init?.headers).get("Authorization") });
		const asset = /assets\/v1\/assets\/(\d+)/.exec(url)?.[1];
		if (asset) {
			return Response.json({
				assetId: asset,
				creationContext: { creator: { userId: options.creator?.[asset] ?? "958742555" } },
			});
		}
		const delivered = /assetId\/(\d+)/.exec(url)?.[1];
		if (delivered) {
			return Response.json({
				location: options.location?.(delivered) ?? `https://c0.rbxcdn.com/${delivered}`,
				assetTypeId: 4,
			});
		}
		const body = new Uint8Array(options.size ?? 16).fill(7);
		const response = new Response(body, { status: 200 });
		Object.defineProperty(response, "url", { value: options.redirectedTo ?? url });
		return response;
	}) as typeof fetch;
	return { seen, fetch: fetchFn };
}

function cache(roblox: ReturnType<typeof fakeRoblox>, now = () => 1_000_000_000) {
	const registryFile = path.join(base, "home", ".roswaal", "roblox-downloads.json");
	const registry = downloadRegistry(registryFile);
	return {
		registry,
		registryFile,
		assets: new AssetCache({
			token: async () => "access-token",
			shelf: projectShelf(registry),
			fetch: roblox.fetch,
			now,
		}),
	};
}

async function project(name = "project"): Promise<string> {
	const root = path.join(base, name);
	await rm(root, { recursive: true, force: true });
	const { mkdir } = await import("node:fs/promises");
	await mkdir(root, { recursive: true });
	return root;
}

describe("downloading an asset", () => {
	it("keeps it in the project's .roswaal/assets, out of Git", async () => {
		const roblox = fakeRoblox({});
		const { assets, registry } = await cache(roblox);
		const root = await project();
		expect(await assets.fetchAll(root, ["431039918"])).toEqual({
			"431039918": { state: "ready", assetTypeId: 4 },
		});
		const folder = path.join(root, ASSET_FOLDER);
		expect((await readFile(path.join(folder, "431039918"))).length).toBe(16);
		expect(await readFile(path.join(folder, ".gitignore"), "utf8")).toMatch(/^\*$/m);
		expect(await registry.roots()).toEqual([root]);
		expect(await assets.summary(root)).toEqual({ count: 1, bytes: 16 });
	});

	it("sends the token to Roblox's APIs and never to the CDN", async () => {
		const roblox = fakeRoblox({});
		const { assets } = cache(roblox);
		await assets.fetchAll(await project(), ["5"]);
		const cdn = roblox.seen.find((s) => s.url.includes("rbxcdn.com"));
		expect(cdn?.auth).toBeNull();
		expect(roblox.seen.filter((s) => s.url.includes("apis.roblox.com")).every((s) => s.auth)).toBe(
			true,
		);
	});

	it("never downloads what Roblox made, and remembers not to ask again", async () => {
		const roblox = fakeRoblox({ creator: { "81475938": "1" } });
		const { assets } = cache(roblox);
		const root = await project();
		expect(await assets.fetchAll(root, ["81475938"])).toEqual({
			"81475938": { state: "skipped", reason: "roblox-made" },
		});
		expect(roblox.seen.some((s) => s.url.includes("asset-delivery"))).toBe(false);
		roblox.seen.length = 0;
		await assets.fetchAll(root, ["81475938"]);
		expect(roblox.seen).toEqual([]);
		expect(await assets.summary(root)).toEqual({ count: 0, bytes: 0 });
	});

	it("refuses a download address, or a redirect, that is not Roblox's CDN", async () => {
		const root = await project();
		const elsewhere = cache(fakeRoblox({ location: () => "https://evil.example/x" })).assets;
		expect((await elsewhere.fetchAll(root, ["7"]))["7"]).toMatchObject({ state: "failed" });
		const plain = cache(fakeRoblox({ location: () => "http://c0.rbxcdn.com/x" })).assets;
		expect((await plain.fetchAll(root, ["8"]))["8"]).toMatchObject({ state: "failed" });
		const redirected = cache(fakeRoblox({ redirectedTo: "https://evil.example/y" })).assets;
		expect((await redirected.fetchAll(root, ["9"]))["9"]).toMatchObject({ state: "failed" });
		await expect(stat(path.join(root, ASSET_FOLDER, "7"))).rejects.toThrow();
	});

	it("refuses an asset past the size limit, and an id that is not a number", async () => {
		const root = await project();
		const big = cache(fakeRoblox({ size: LARGEST_ASSET + 1 })).assets;
		expect((await big.fetchAll(root, ["10"]))["10"]).toMatchObject({ state: "failed" });
		const any = cache(fakeRoblox({})).assets;
		expect((await any.fetchAll(root, ["../../x"]))["../../x"]).toMatchObject({ state: "failed" });
	});

	it("matches Roblox's download servers and nothing that only resembles them", () => {
		expect(isRobloxCdn("https://c0.rbxcdn.com/abc")).toBe(true);
		expect(isRobloxCdn("https://contentdelivery.roblox.com/v1/x")).toBe(true);
		expect(isRobloxCdn("https://www.roblox.com/abc")).toBe(false);
		expect(isRobloxCdn("https://contentdelivery.roblox.com.evil.example/x")).toBe(false);
		expect(isRobloxCdn("https://rbxcdn.com.evil.example/abc")).toBe(false);
		expect(isRobloxCdn("https://evilrbxcdn.com/abc")).toBe(false);
		expect(isRobloxCdn("http://c0.rbxcdn.com/abc")).toBe(false);
	});
});

describe("reading a download back", () => {
	it("hands over its bytes and type, touching nothing, and nothing for one skipped", async () => {
		const { assets } = cache(fakeRoblox({ creator: { "81475938": "1" } }));
		const root = await project();
		await assets.fetchAll(root, ["15", "81475938"]);
		const record = path.join(root, ASSET_FOLDER, "15.json");
		const before = await readFile(record, "utf8");
		const held = await assets.read(root, "15");
		expect(held?.assetTypeId).toBe(4);
		expect(held?.bytes.length).toBe(16);
		expect(await readFile(record, "utf8")).toBe(before);
		expect(await assets.read(root, "81475938")).toBeNull();
		expect(await assets.read(root, "99")).toBeNull();
		expect(await assets.read(root, "../x")).toBeNull();
	});
});

describe("keeping downloads only as long as they are needed", () => {
	it("deletes an asset unused for thirty days", async () => {
		let clock = 1_000_000_000;
		const roblox = fakeRoblox({});
		const { assets } = cache(roblox, () => clock);
		const root = await project();
		await assets.fetchAll(root, ["11"]);
		clock += 29 * 24 * 60 * 60_000;
		expect(await assets.expire(root)).toBe(0);
		clock += 2 * 24 * 60 * 60_000;
		expect(await assets.expire(root)).toBe(1);
		expect(await assets.summary(root)).toEqual({ count: 0, bytes: 0 });
	});

	it("clears one project's downloads, folder and all", async () => {
		const { assets, registry } = cache(fakeRoblox({}));
		const root = await project();
		await assets.fetchAll(root, ["12"]);
		await assets.clear(root);
		expect(await readdir(path.join(root, ".roswaal")).catch(() => [])).not.toContain("assets");
		expect(await registry.roots()).toEqual([]);
	});

	it("deletes every project's downloads on signing out", async () => {
		const { assets, registryFile } = cache(fakeRoblox({}));
		const one = await project("one");
		const two = await project("two");
		await assets.fetchAll(one, ["13"]);
		await assets.fetchAll(two, ["14"]);
		await assets.clearEverywhere();
		for (const root of [one, two]) {
			await expect(stat(path.join(root, ASSET_FOLDER))).rejects.toThrow();
		}
		await expect(stat(registryFile)).rejects.toThrow();
	});
});

describe("downloading on the website, into the browser's own storage", () => {
	function browserCache(roblox: ReturnType<typeof fakeRoblox>, now = () => 1_000_000_000) {
		const root = new FakeDir("");
		return {
			root,
			assets: new AssetCache({
				token: async () => "access-token",
				shelf: browserShelf(async () => root as unknown as FileSystemDirectoryHandle),
				fetch: roblox.fetch,
				now,
			}),
		};
	}

	it("keeps copies in one roblox-assets folder, shared by every project, never in a project", async () => {
		const { assets, root } = browserCache(fakeRoblox({}));
		expect(assets.kept).toBe("browser");
		await assets.fetchAll("/one", ["21"]);
		expect([...root.dirs.keys()]).toEqual([BROWSER_ASSET_FOLDER]);
		expect([...(root.dirs.get(BROWSER_ASSET_FOLDER)?.files.keys() ?? [])].sort()).toEqual([
			"21",
			"21.json",
		]);
		// Another project in the same browser finds it without asking Roblox again.
		const read = await assets.read("/two", "21");
		expect(read?.bytes.length).toBe(16);
		expect(read?.assetTypeId).toBe(4);
		expect(await assets.summary("/two")).toEqual({ count: 1, bytes: 16 });
	});

	it("downloads an asset two requests ask for at once only once", async () => {
		const roblox = fakeRoblox({});
		const { assets } = browserCache(roblox);
		await Promise.all([assets.fetchAll("/p", ["22"]), assets.fetchAll("/p", ["22"])]);
		expect(roblox.seen.filter((s) => s.url.includes("rbxcdn.com"))).toHaveLength(1);
	});

	it("remembers Roblox's own as skipped, and expires what goes unused", async () => {
		let clock = 1_000_000_000;
		const { assets } = browserCache(fakeRoblox({ creator: { "23": "1" } }), () => clock);
		expect(await assets.fetchAll("/p", ["23", "24"])).toEqual({
			"23": { state: "skipped", reason: "roblox-made" },
			"24": { state: "ready", assetTypeId: 4 },
		});
		expect(await assets.read("/p", "23")).toBeNull();
		clock += 31 * 24 * 60 * 60_000;
		expect(await assets.expire("/p")).toBe(2);
		expect(await assets.summary("/p")).toEqual({ count: 0, bytes: 0 });
	});

	it("deletes every copy at once on signing out, and on Clear", async () => {
		const { assets, root } = browserCache(fakeRoblox({}));
		await assets.fetchAll("/one", ["25"]);
		await assets.clearEverywhere();
		expect([...root.dirs.keys()]).toEqual([]);
		await assets.fetchAll("/one", ["26"]);
		await assets.clear("/two");
		expect([...root.dirs.keys()]).toEqual([]);
		// Clearing what is already gone is not a failure.
		await assets.clearEverywhere();
	});
});

/** As much of an OPFS directory as the browser shelf asks for. */
class FakeDir {
	readonly kind = "directory" as const;
	readonly files = new Map<string, FakeEntry>();
	readonly dirs = new Map<string, FakeDir>();

	constructor(readonly name: string) {}

	async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir> {
		const found = this.dirs.get(name);
		if (found) return found;
		if (!options?.create) throw new DOMException(name, "NotFoundError");
		const made = new FakeDir(name);
		this.dirs.set(name, made);
		return made;
	}

	async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeEntry> {
		const found = this.files.get(name);
		if (found) return found;
		if (!options?.create) throw new DOMException(name, "NotFoundError");
		const made = new FakeEntry(name);
		this.files.set(name, made);
		return made;
	}

	async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
		const dir = this.dirs.get(name);
		if (dir && !options?.recursive && (dir.files.size > 0 || dir.dirs.size > 0))
			throw new DOMException(name, "InvalidModificationError");
		if (!this.files.delete(name) && !this.dirs.delete(name))
			throw new DOMException(name, "NotFoundError");
	}

	async *values(): AsyncGenerator<FakeDir | FakeEntry> {
		yield* this.dirs.values();
		yield* this.files.values();
	}
}

class FakeEntry {
	readonly kind = "file" as const;
	data = new Uint8Array();

	constructor(readonly name: string) {}

	async getFile() {
		const data = this.data;
		return {
			text: async () => new TextDecoder().decode(data),
			arrayBuffer: async () => data.slice().buffer,
		};
	}

	async createWritable() {
		return {
			write: async (chunk: string | Uint8Array) => {
				this.data =
					typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
			},
			close: async () => undefined,
		};
	}
}

describe("the browser's own fetch", () => {
	it("is called on its own, as a browser requires, not as the cache's method", async () => {
		const roblox = fakeRoblox({});
		// A browser's fetch throws when its `this` is anything but the global scope.
		const strict = function (this: unknown, input: string | URL, init?: RequestInit) {
			if (this !== undefined && this !== globalThis)
				throw new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation");
			return roblox.fetch(input, init);
		};
		vi.stubGlobal("fetch", strict);
		try {
			const assets = new AssetCache({
				token: async () => "access-token",
				shelf: browserShelf(async () => new FakeDir("") as unknown as FileSystemDirectoryHandle),
			});
			expect(await assets.fetchAll("/p", ["31"])).toEqual({
				"31": { state: "ready", assetTypeId: 4 },
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("a request the browser stops", () => {
	it("says which step and which host, not only Failed to fetch", async () => {
		const roblox = fakeRoblox({
			location: (id) => `https://contentdelivery.roblox.com/v1/${id}?sig=secret`,
		});
		const stopping = (async (input: string | URL, init?: RequestInit) => {
			if (String(input).includes("contentdelivery")) throw new TypeError("Failed to fetch");
			return roblox.fetch(input, init);
		}) as typeof fetch;
		const assets = new AssetCache({
			token: async () => "access-token",
			shelf: browserShelf(async () => new FakeDir("") as unknown as FileSystemDirectoryHandle),
			fetch: stopping,
		});
		const reason = (await assets.fetchAll("/p", ["41"]))["41"];
		expect(reason).toEqual({
			state: "failed",
			reason:
				"The download could not be reached (https://contentdelivery.roblox.com): Failed to fetch",
		});
		expect(JSON.stringify(reason)).not.toContain("secret");
	});
});

describe("asking which assets are kept already", () => {
	it("answers kept and skipped ones, leaves out the rest, and asks Roblox nothing", async () => {
		let clock = 1_000_000_000;
		const roblox = fakeRoblox({ creator: { "52": "1" } });
		const root = new FakeDir("");
		const assets = new AssetCache({
			token: async () => "access-token",
			shelf: browserShelf(async () => root as unknown as FileSystemDirectoryHandle),
			fetch: roblox.fetch,
			now: () => clock,
		});
		await assets.fetchAll("/p", ["51", "52"]);
		const asked = roblox.seen.length;
		clock += 20 * 24 * 60 * 60_000;
		expect(await assets.held("/p", ["51", "52", "53", "not-an-id"])).toEqual({
			"51": { state: "ready", assetTypeId: 4 },
			"52": { state: "skipped", reason: "roblox-made" },
		});
		expect(roblox.seen.length).toBe(asked);
		// Asking counts as a use: twenty more days and it is still kept.
		clock += 20 * 24 * 60 * 60_000;
		expect(await assets.expire("/p")).toBe(1);
		expect(await assets.summary("/p")).toEqual({ count: 1, bytes: 16 });
	});
});
