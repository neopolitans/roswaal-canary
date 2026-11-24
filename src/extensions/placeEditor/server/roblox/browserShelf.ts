/**
 * The website's shelf for downloaded assets: one folder, `roblox-assets`, in
 * the site's own browser storage (its origin private file system), shared by
 * every project opened in this browser and never written into a project or a
 * folder on disk. Only the site's own pages can read it; canary.roswaal.app
 * keeps its own.
 *
 * One shelf for the browser, so `root` is passed over: clearing deletes
 * everything, and signing out deletes everything at once, with no list of
 * folders to visit.
 *
 * Every call opens the directory again rather than holding a handle, as
 * `web/persist.ts` does: a held handle can go stale while a tab sleeps.
 */

import type { AssetRecord, AssetShelf } from "./assets.js";

/** The folder in the site's storage. */
export const BROWSER_ASSET_FOLDER = "roblox-assets";

export function browserShelf(
	root: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory(),
): AssetShelf {
	const folder = async (create: boolean): Promise<FileSystemDirectoryHandle | null> => {
		try {
			return await (await root()).getDirectoryHandle(BROWSER_ASSET_FOLDER, { create });
		} catch {
			// Not there yet is the common case: nothing has been downloaded.
			return null;
		}
	};
	const readFile = async (name: string): Promise<File | null> => {
		const at = await folder(false);
		if (!at) return null;
		try {
			return await (await at.getFileHandle(name)).getFile();
		} catch {
			return null;
		}
	};
	const writeFile = async (
		at: FileSystemDirectoryHandle,
		name: string,
		data: string | Uint8Array,
	) => {
		const writable = await (await at.getFileHandle(name, { create: true })).createWritable();
		await writable.write(data as BlobPart);
		await writable.close();
	};
	const record = async (id: string): Promise<AssetRecord | null> => {
		const file = await readFile(`${id}.json`);
		if (!file) return null;
		try {
			return JSON.parse(await file.text()) as AssetRecord;
		} catch {
			return null;
		}
	};
	const clearAll = async () => {
		await (await root())
			.removeEntry(BROWSER_ASSET_FOLDER, { recursive: true })
			// Already gone is what clearing wants.
			.catch(() => undefined);
	};
	return {
		kept: "browser",
		record: (_root, id) => record(id),
		async keep(_root, kept, bytes) {
			const at = await folder(true);
			if (!at) throw new Error("This browser would not keep the download.");
			// The bytes first, so a record never names bytes that are not there.
			if (bytes) await writeFile(at, kept.assetId, bytes);
			await writeFile(at, `${kept.assetId}.json`, JSON.stringify(kept));
		},
		async bytes(_root, id) {
			const file = await readFile(id);
			return file ? new Uint8Array(await file.arrayBuffer()) : null;
		},
		async records() {
			const at = await folder(false);
			if (!at) return [];
			const ids: string[] = [];
			for await (const handle of at.values()) {
				const id = handle.kind === "file" ? /^(\d+)\.json$/.exec(handle.name)?.[1] : undefined;
				if (id) ids.push(id);
			}
			const out: AssetRecord[] = [];
			for (const id of ids) {
				const found = await record(id);
				if (found) out.push(found);
			}
			return out;
		},
		async remove(_root, id) {
			const at = await folder(false);
			if (!at) return;
			for (const name of [id, `${id}.json`]) {
				await at.removeEntry(name).catch(() => undefined);
			}
		},
		clear: clearAll,
		clearEverywhere: clearAll,
	};
}
