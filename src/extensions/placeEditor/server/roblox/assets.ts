/**
 * Assets downloaded through Sign in with Roblox: the meshes and images a
 * place refers to, kept so they can be drawn. Needs no Node: the daemon and
 * the website's worker both run it, each with its own shelf.
 *
 * - **Where.** A shelf the host gives. The daemon's (`projectShelf.ts`) is
 *   the project's `.roswaal/assets/`, out of Git, with a list of the folders
 *   holding copies so signing out can delete them all. The website's
 *   (`browserShelf.ts`) is one folder in the site's own browser storage,
 *   shared by every project opened in that browser and never written into a
 *   project.
 * - **What is fetched.** The Assets API (`asset:read`) names the creator
 *   first: Roblox's own assets (user 1) are recorded as skipped and never
 *   downloaded, as the Privacy Policy says. Then asset delivery
 *   (`legacy-asset:manage`) gives a download address, which must be HTTPS on
 *   one of Roblox's download servers (`isRobloxCdn`), before and after any
 *   redirect (CASA 5.1). They are not sent the token. Each download is
 *   size-limited.
 * - **How long.** An asset unused for 30 days is deleted. Clear deletes what
 *   the shelf holds for the project (on the website, everything). Signing
 *   out, or losing access, deletes everything everywhere.
 *
 * Never sold, never put back online, never used to train AI: nothing here
 * sends an asset anywhere.
 */

import { readLimited } from "../../../../server/download.js";
import { HttpError, UserError } from "../../../../server/errors.js";

/** Where a project's downloads are kept, on the daemon. */
export const ASSET_FOLDER = ".roswaal/assets";
/** The most one asset may be. Meshes and images are a few MiB at most. */
export const LARGEST_ASSET = 32 * 1024 * 1024;
/** The most assets one request may ask for. */
export const ASSET_BUDGET = 64;
/** An asset unused this long is deleted. */
export const UNUSED_DAYS = 30;
/** Roblox's own account: what it made is never downloaded. */
export const ROBLOX_USER_ID = "1";

const ASSETS_API = "https://apis.roblox.com/assets/v1/assets/";
const DELIVERY_API = "https://apis.roblox.com/asset-delivery-api/v1/assetId/";
const REQUEST_MS = 20_000;
const DAY_MS = 24 * 60 * 60_000;

/** What is known about one asset. */
export interface AssetRecord {
	assetId: string;
	/** Roblox's asset type: 1 an image, 4 a mesh, 13 a decal. */
	assetTypeId?: number;
	creatorUserId?: string;
	/** Not downloaded, and why. */
	skipped?: "roblox-made";
	size?: number;
	fetched: number;
	used: number;
}

/** How one asked-for asset came out. */
export type AssetOutcome =
	| { state: "ready"; assetTypeId?: number }
	| { state: "skipped"; reason: "roblox-made" }
	| { state: "failed"; reason: string };

/**
 * Where downloads are kept. `root` is the open project's: the daemon keeps
 * each project's apart, the website keeps one shelf for the browser and
 * passes over it. Ids reaching a shelf are always digits.
 */
export interface AssetShelf {
	/** Where copies are kept, for the editor to say: the project's folder, or this browser. */
	readonly kept: "project" | "browser";
	record(root: string, id: string): Promise<AssetRecord | null>;
	/** Writes the record, and the bytes when there are any. */
	keep(root: string, record: AssetRecord, bytes?: Uint8Array): Promise<void>;
	bytes(root: string, id: string): Promise<Uint8Array | null>;
	records(root: string): Promise<AssetRecord[]>;
	/** Deletes one asset, its bytes and its record. */
	remove(root: string, id: string): Promise<void>;
	/** Deletes what is kept for this project: on the website, everything. */
	clear(root: string): Promise<void>;
	/** Deletes every copy kept anywhere: for signing out, and for lost access. */
	clearEverywhere(): Promise<void>;
}

/** An address's scheme and host, and nothing of its path or query. */
function hostOf(address: unknown): string {
	try {
		const url = new URL(String(address));
		return `${url.protocol}//${url.hostname}`;
	} catch {
		return "no address";
	}
}

/**
 * Whether an address is one of Roblox's download servers, over HTTPS: the only
 * places an asset is fetched from. Its CDN, `rbxcdn.com`, and
 * `contentdelivery.roblox.com`, which asset delivery hands out for some
 * Creator Marketplace meshes (seen 13 Nov 2026). Named exactly rather than
 * all of `roblox.com`.
 */
export function isRobloxCdn(address: string): boolean {
	try {
		const url = new URL(address);
		return (
			url.protocol === "https:" &&
			(url.hostname === "rbxcdn.com" ||
				url.hostname.endsWith(".rbxcdn.com") ||
				url.hostname === "contentdelivery.roblox.com")
		);
	} catch {
		return false;
	}
}

/** Whether a text is an asset id, as every shelf may assume. */
const isAssetId = (id: string) => /^\d{1,20}$/.test(id);

export interface AssetCacheOptions {
	/** An access token from the sign-in, refreshed as it needs. */
	token: () => Promise<string>;
	shelf: AssetShelf;
	fetch?: typeof fetch;
	now?: () => number;
}

export class AssetCache {
	private readonly token: () => Promise<string>;
	private readonly shelf: AssetShelf;
	private readonly fetch: typeof fetch;
	private readonly now: () => number;
	/** Downloads under way, so two requests for one asset share one. */
	private readonly pending = new Map<string, Promise<AssetOutcome>>();

	constructor(options: AssetCacheOptions) {
		this.token = options.token;
		this.shelf = options.shelf;
		// Called on its own, never as this object's method: a browser refuses that
		// ("Illegal invocation"), where Node does not mind.
		this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
		this.now = options.now ?? Date.now;
	}

	get kept(): "project" | "browser" {
		return this.shelf.kept;
	}

	/**
	 * Makes sure each asset is here: downloaded unless it already is, or is
	 * Roblox's own. Up to `ASSET_BUDGET` at once; one that fails is said so
	 * and the rest go on.
	 */
	async fetchAll(root: string, ids: readonly string[]): Promise<Record<string, AssetOutcome>> {
		if (ids.length > ASSET_BUDGET) {
			throw new UserError(`At most ${ASSET_BUDGET} assets can be asked for at once.`);
		}
		await this.expire(root);
		const out: Record<string, AssetOutcome> = {};
		for (const id of new Set(ids)) {
			try {
				out[id] = await this.fetchShared(root, id);
			} catch (err) {
				out[id] = { state: "failed", reason: err instanceof Error ? err.message : String(err) };
			}
		}
		return out;
	}

	private fetchShared(root: string, id: string): Promise<AssetOutcome> {
		const key = `${root}\0${id}`;
		const under = this.pending.get(key);
		if (under) return under;
		const started = this.fetchOne(root, id).finally(() => this.pending.delete(key));
		this.pending.set(key, started);
		return started;
	}

	private async fetchOne(root: string, id: string): Promise<AssetOutcome> {
		if (!isAssetId(id)) throw new UserError(`"${id.slice(0, 24)}" is not an asset id.`);
		const known = await this.shelf.record(root, id);
		if (known?.skipped) return { state: "skipped", reason: known.skipped };
		if (known) {
			await this.shelf.keep(root, { ...known, used: this.now() });
			return { state: "ready", assetTypeId: known.assetTypeId };
		}

		const bearer = { Authorization: `Bearer ${await this.token()}` };
		// Who made it, first: Roblox's own assets are not downloaded.
		const info = await this.fetch(`${ASSETS_API}${id}`, {
			headers: bearer,
			signal: AbortSignal.timeout(REQUEST_MS),
		});
		if (!info.ok)
			throw new HttpError(502, `Roblox would not say what asset ${id} is (${info.status}).`);
		const about = (await info.json()) as {
			creationContext?: { creator?: { userId?: string } };
		};
		const creatorUserId = about.creationContext?.creator?.userId;
		const now = this.now();
		if (creatorUserId === ROBLOX_USER_ID) {
			await this.shelf.keep(root, {
				assetId: id,
				creatorUserId,
				skipped: "roblox-made",
				fetched: now,
				used: now,
			});
			return { state: "skipped", reason: "roblox-made" };
		}

		const delivery = await this.fetch(`${DELIVERY_API}${id}`, {
			headers: bearer,
			signal: AbortSignal.timeout(REQUEST_MS),
		});
		if (!delivery.ok)
			throw new HttpError(502, `Roblox would not hand over asset ${id} (${delivery.status}).`);
		const { location, assetTypeId } = (await delivery.json()) as {
			location?: unknown;
			assetTypeId?: unknown;
		};
		if (typeof location !== "string" || !isRobloxCdn(location)) {
			// The host alone: the rest of the address is a signed link, and not repeated.
			throw new HttpError(
				502,
				`Asset ${id}'s download address is not Roblox's (${hostOf(location)}).`,
			);
		}
		// The CDN gets no token, and wherever it redirects must be Roblox's too.
		const download = await this.fetch(location, { signal: AbortSignal.timeout(REQUEST_MS) });
		if (download.url && !isRobloxCdn(download.url)) {
			await download.body?.cancel().catch(() => undefined);
			throw new HttpError(502, `Asset ${id} was redirected away from Roblox.`);
		}
		if (!download.ok)
			throw new HttpError(502, `Asset ${id} could not be downloaded (${download.status}).`);
		const bytes = await readLimited(download, LARGEST_ASSET, `Asset ${id}`);
		await this.shelf.keep(
			root,
			{
				assetId: id,
				...(typeof assetTypeId === "number" ? { assetTypeId } : {}),
				...(creatorUserId ? { creatorUserId } : {}),
				size: bytes.length,
				fetched: now,
				used: now,
			},
			bytes,
		);
		return { state: "ready", ...(typeof assetTypeId === "number" ? { assetTypeId } : {}) };
	}

	/**
	 * One downloaded asset's bytes and type, or null when it is not here (or was
	 * skipped as Roblox's own). Reads only: it does not count as a use, which
	 * `fetchAll` records.
	 */
	async read(
		root: string,
		id: string,
	): Promise<{ assetTypeId?: number; bytes: Uint8Array } | null> {
		if (!isAssetId(id)) return null;
		const record = await this.shelf.record(root, id);
		if (!record || record.skipped) return null;
		const bytes = await this.shelf.bytes(root, id);
		if (!bytes) return null;
		return {
			...(record.assetTypeId !== undefined ? { assetTypeId: record.assetTypeId } : {}),
			bytes,
		};
	}

	/** How many assets are kept for this project (on the website, in all), and how many bytes. Reads only. */
	async summary(root: string): Promise<{ count: number; bytes: number }> {
		let count = 0;
		let bytes = 0;
		for (const record of await this.shelf.records(root)) {
			if (record.skipped) continue;
			count++;
			bytes += record.size ?? 0;
		}
		return { count, bytes };
	}

	/** Deletes what has gone unused for `UNUSED_DAYS`. */
	async expire(root: string): Promise<number> {
		const before = this.now() - UNUSED_DAYS * DAY_MS;
		let gone = 0;
		for (const record of await this.shelf.records(root)) {
			if (record.used >= before || !isAssetId(record.assetId)) continue;
			await this.shelf.remove(root, record.assetId);
			gone++;
		}
		return gone;
	}

	/** Deletes the project's downloads: on the website, every download in this browser. */
	clear(root: string): Promise<void> {
		return this.shelf.clear(root);
	}

	/** Deletes every download kept anywhere: for signing out, and for lost access. */
	clearEverywhere(): Promise<void> {
		return this.shelf.clearEverywhere();
	}
}
