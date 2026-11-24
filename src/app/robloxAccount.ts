/**
 * Sign in with Roblox as the editor knows it: Roswaal's own, not an
 * extension's, so whatever fetches from Roblox can use it (today, the Place
 * Editor's meshes and images). Asked of the host once, and kept current by
 * its `roblox` event, which App passes on here. Never a token: the host holds
 * those and the editor never sees one.
 */

import { useSyncExternalStore } from "react";

import { apiRequest } from "./api.js";

/** Sign in with Roblox as the host tells it. See `extensions/placeEditor/server/roblox/signin.ts`. */
export interface RobloxStatus {
	/** Whether this copy of Roswaal offers it: the daemon does, the website does not yet. */
	available: boolean;
	signedIn?: boolean;
	userId?: string;
	signingIn?: boolean;
	failed?: string;
}

const post = <T>(url: string, body: unknown) =>
	apiRequest<T>(url, { method: "POST", body: JSON.stringify(body) });

export const robloxAccountApi = {
	/** Whether it is offered here, and who is signed in. */
	status: () => apiRequest<RobloxStatus>("/api/roblox"),
	/** Starts a sign-in; the address is Roblox's own sign-in page. */
	signIn: () => post<{ url: string }>("/api/roblox/signin", {}),
	/** Revokes the sign-in and deletes it and everything downloaded with it. */
	signOut: () => post<{ ok: boolean }>("/api/roblox/signout", {}),
};

let status: RobloxStatus = { available: false };
let asked = false;
const listeners = new Set<() => void>();

function set(next: RobloxStatus): void {
	status = next;
	for (const listener of listeners) listener();
}

/** What the host's `roblox` event says, which is the same shape as its status. */
export function setRobloxStatus(next: Omit<RobloxStatus, "available">): void {
	set({ ...next, available: true });
}

/** Asks the host again. */
export async function refreshRobloxStatus(): Promise<void> {
	try {
		set(await robloxAccountApi.status());
	} catch {
		set({ available: false });
	}
}

export function useRobloxStatus(): RobloxStatus {
	if (!asked) {
		asked = true;
		void refreshRobloxStatus();
	}
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => status,
	);
}

/**
 * Starts a sign-in and opens Roblox's page in a new tab.
 *
 * The tab is opened first, empty, while the click still counts as one -- a
 * browser blocks a window opened after waiting on the host -- and is sent to
 * Roblox once the host answers.
 */
export async function startRobloxSignIn(): Promise<void> {
	const tab = window.open("about:blank", "_blank");
	try {
		const { url } = await robloxAccountApi.signIn();
		if (tab) {
			tab.opener = null;
			tab.location.href = url;
		} else {
			window.open(url, "_blank", "noopener");
		}
	} catch (err) {
		tab?.close();
		throw err;
	}
}

export async function signOutOfRoblox(): Promise<void> {
	await robloxAccountApi.signOut();
	await refreshRobloxStatus();
}
