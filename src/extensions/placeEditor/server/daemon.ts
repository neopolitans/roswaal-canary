/**
 * The Place Editor on the daemon: Sign in with Roblox, kept in this account's
 * vault, and what it downloads, kept in each project. Signing out, or losing
 * access, deletes all of it. The website's is `website.ts`.
 */

import { loopbackReceiver } from "../../../server/roblox/loopback.js";
import { ROBLOX_REDIRECT, RobloxSignIn } from "../../../server/roblox/signin.js";
import { fileVault } from "../../../server/roblox/vault.js";
import type { DaemonExtensionOptions } from "../../daemon.js";
import { AssetCache } from "./roblox/assets.js";
import { downloadRegistry, projectShelf } from "./roblox/projectShelf.js";
import type { PlaceEditorCapabilities } from "./routes.js";

export interface PlaceEditorDaemon {
	capabilities: PlaceEditorCapabilities;
	/** Asks Roblox once whether the sign-in still has access. */
	afterStart(): void;
	close(): void;
}

export function placeEditorDaemon(options: DaemonExtensionOptions): PlaceEditorDaemon {
	// A test passes its own sign-in, or null for none, so it never reads the real one.
	let assets: AssetCache | null = null;
	const roblox =
		options.roblox === undefined
			? new RobloxSignIn({
					vault: fileVault(),
					receiver: loopbackReceiver(ROBLOX_REDIRECT),
					keptIn: "computer",
					onChange: (status) => options.broadcast("roblox", status),
					onForget: async () => {
						await assets?.clearEverywhere();
					},
				})
			: options.roblox;
	if (roblox) {
		assets = new AssetCache({
			token: () => roblox.accessToken(),
			shelf: projectShelf(downloadRegistry()),
		});
	}
	return {
		capabilities: roblox && assets ? { roblox, robloxAssets: assets } : {},
		afterStart: () => void roblox?.checkAccess(),
		close: () => roblox?.close(),
	};
}
