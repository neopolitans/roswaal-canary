/**
 * The Place Editor on the website: the sign-in the worker made, and what it
 * downloads, kept in this browser's own storage for the site
 * (`roblox/browserShelf.ts`). Signing out, or losing access, deletes all of
 * it, through `forget`, which the worker's sign-in calls.
 */

import type { RobloxAccount } from "../../../server/roblox/signin.js";
import { AssetCache } from "./roblox/assets.js";
import { browserShelf } from "./roblox/browserShelf.js";
import type { PlaceEditorCapabilities } from "./routes.js";

export interface PlaceEditorWebsite {
	capabilities: PlaceEditorCapabilities;
	/** Deletes every download: for the sign-in's `onForget`. */
	forget(): Promise<void>;
}

export function placeEditorWebsite(
	roblox: RobloxAccount & { accessToken(): Promise<string> },
): PlaceEditorWebsite {
	const assets = new AssetCache({ token: () => roblox.accessToken(), shelf: browserShelf() });
	return {
		capabilities: { roblox, robloxAssets: assets },
		forget: () => assets.clearEverywhere(),
	};
}
