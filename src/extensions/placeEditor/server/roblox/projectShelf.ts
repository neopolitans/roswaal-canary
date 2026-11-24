/**
 * The daemon's shelf for downloaded assets: the project's own
 * `.roswaal/assets/`. `<id>` holds an asset's bytes and `<id>.json` what is
 * known about it. A `.gitignore` of `*` keeps the folder out of Git whatever
 * the project's own `.gitignore` says. Every write goes through `safeJoin`
 * and the confined filesystem, as every project write does.
 *
 * Signing out, or losing access, deletes every project's, through the list
 * `downloadRegistry` keeps of the folders downloaded into.
 */

import nodeFs from "node:fs";
import os from "node:os";
import nodePath from "node:path";

import { fs } from "../../../../server/host.js";
import { safeJoin } from "../../../../server/paths.js";
import { ASSET_FOLDER, type AssetRecord, type AssetShelf } from "./assets.js";

const IGNORE =
	"# Assets downloaded through Sign in with Roblox. Never committed: see Roswaal's Privacy Policy.\n*\n";

/**
 * The project folders that hold downloads, in `~/.roswaal/roblox-downloads.json`,
 * so signing out can delete them all and not only the open project's.
 */
export interface DownloadRegistry {
	add(root: string): Promise<void>;
	remove(root: string): Promise<void>;
	roots(): Promise<string[]>;
}

export function downloadRegistry(
	file = nodePath.join(os.homedir(), ".roswaal", "roblox-downloads.json"),
): DownloadRegistry {
	const read = async (): Promise<string[]> => {
		try {
			const parsed = JSON.parse(await nodeFs.promises.readFile(file, "utf8")) as {
				roots?: unknown;
			};
			return Array.isArray(parsed.roots)
				? parsed.roots.filter((r): r is string => typeof r === "string")
				: [];
		} catch {
			return [];
		}
	};
	const write = async (roots: string[]) => {
		await nodeFs.promises.mkdir(nodePath.dirname(file), { recursive: true, mode: 0o700 });
		await nodeFs.promises.rm(file, { force: true });
		if (roots.length === 0) return;
		await nodeFs.promises.writeFile(file, `${JSON.stringify({ roots }, null, "\t")}\n`, {
			mode: 0o600,
			flag: "wx",
		});
	};
	return {
		async add(root) {
			const roots = await read();
			if (!roots.includes(root)) await write([...roots, root]);
		},
		async remove(root) {
			const roots = await read();
			if (roots.includes(root)) await write(roots.filter((r) => r !== root));
		},
		roots: read,
	};
}

/** Each project's downloads in its own `.roswaal/assets`, listed in `registry`. */
export function projectShelf(registry: DownloadRegistry): AssetShelf {
	const folder = (root: string) => safeJoin(root, ASSET_FOLDER);
	const record = async (root: string, id: string): Promise<AssetRecord | null> => {
		try {
			return JSON.parse(
				await fs.readFile(nodePath.join(folder(root), `${id}.json`), "utf8"),
			) as AssetRecord;
		} catch {
			return null;
		}
	};
	const clear = async (root: string) => {
		await fs.rm(folder(root), { recursive: true, force: true });
		await registry.remove(root);
	};
	return {
		kept: "project",
		record,
		async keep(root, kept, bytes) {
			const at = folder(root);
			await fs.mkdir(at, { recursive: true });
			await fs.writeFile(nodePath.join(at, ".gitignore"), IGNORE, "utf8");
			if (bytes) await fs.writeFile(nodePath.join(at, kept.assetId), bytes);
			await fs.writeFile(
				nodePath.join(at, `${kept.assetId}.json`),
				`${JSON.stringify(kept, null, "\t")}\n`,
				"utf8",
			);
			await registry.add(root);
		},
		async bytes(root, id) {
			try {
				return await fs.readFile(nodePath.join(folder(root), id));
			} catch {
				return null;
			}
		},
		async records(root) {
			let names: string[];
			try {
				names = await fs.readdir(folder(root));
			} catch {
				return [];
			}
			const out: AssetRecord[] = [];
			for (const name of names) {
				const id = /^(\d+)\.json$/.exec(name)?.[1];
				if (!id) continue;
				const found = await record(root, id);
				if (found) out.push(found);
			}
			return out;
		},
		async remove(root, id) {
			await fs.rm(nodePath.join(folder(root), id), { force: true });
			await fs.rm(nodePath.join(folder(root), `${id}.json`), { force: true });
		},
		clear,
		async clearEverywhere() {
			for (const root of await registry.roots()) {
				try {
					await clear(root);
				} catch {
					// A folder since moved or deleted has nothing left to delete.
					await registry.remove(root);
				}
			}
		},
	};
}
