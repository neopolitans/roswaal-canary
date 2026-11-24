/**
 * What the Place Editor downloads through Sign in with Roblox, as the editor
 * asks the host for it: see `../server/routes.ts`. The sign-in itself is
 * Roswaal's own (`app/robloxAccount.ts`). Never a token.
 */

import { apiRequest } from "../../../app/api.js";
import { type RobloxStatus, robloxAccountApi } from "../../../app/robloxAccount.js";

export type { RobloxStatus };

const post = <T>(url: string, body: unknown) =>
	apiRequest<T>(url, { method: "POST", body: JSON.stringify(body) });

export const robloxApi = {
	/** Whether it is offered here, and who is signed in. */
	status: robloxAccountApi.status,
	/** How many assets the open project holds from Sign in with Roblox, and their size. */
	assets: () =>
		apiRequest<{ available: boolean; count: number; bytes: number }>("/api/roblox/assets"),
	/** Makes sure the open project has these assets: downloaded, or skipped as Roblox's own. */
	fetchAssets: (ids: string[]) =>
		post<{
			assets: Record<
				string,
				| { state: "ready"; assetTypeId?: number }
				| { state: "skipped"; reason: string }
				| { state: "failed"; reason: string }
			>;
		}>("/api/roblox/assets", { ids }),
	/** Deletes the open project's downloaded assets. */
	clearAssets: () => post<{ ok: boolean }>("/api/roblox/assets/clear", {}),
	/** One downloaded asset's bytes, base64, for the viewer: never fetched from Roblox here. */
	asset: (id: string) =>
		apiRequest<{ available: boolean; found: boolean; assetTypeId?: number; data?: string }>(
			`/api/roblox/asset?id=${encodeURIComponent(id)}`,
		),
};
