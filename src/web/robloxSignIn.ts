/**
 * Sign in with Roblox on the website: where the worker keeps the sign-in,
 * and how it hears Roblox send the browser back. The sign-in itself is the
 * daemon's code (`server/roblox/signin.ts`), Node-free.
 *
 * - **Kept** in this browser's own storage for the site (IndexedDB), in a
 *   database of its own, `roswaal-roblox`: the refresh token and the Roblox
 *   user id, as the daemon's vault keeps them. Only pages on this site can
 *   read it; canary.roswaal.app keeps its own. The access token is held in
 *   memory only. The start-up screen's "Forget remembered folders" deletes
 *   the folders' database, not this one.
 * - **Heard** through the site's `/oauth/callback` page, which Roblox sends
 *   the tab it opened to. The page hands the visit to the editor's worker on
 *   a BroadcastChannel and shows its answer. A worker answers only the visit
 *   carrying its own sign-in's state, so another open tab never steals one.
 */

import {
	type KeptSignIn,
	ROBLOX_WEB_REDIRECT_PATH,
	type SignInReceiver,
	type SignInVault,
} from "../server/roblox/signin.js";

/** The channel the callback page and the editor's worker speak on. */
export const SIGN_IN_CHANNEL = "roswaal-roblox-signin";

const DATABASE = "roswaal-roblox";
const STORE = "signin";
const KEY = "kept";

function isKept(value: unknown): value is KeptSignIn {
	const v = value as KeptSignIn | null;
	return !!v && typeof v.refreshToken === "string" && typeof v.userId === "string";
}

/** The sign-in, kept in this browser's IndexedDB for the site. */
export function browserVault(name = DATABASE): SignInVault {
	const open = () =>
		new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	const run = async <T>(
		mode: IDBTransactionMode,
		act: (store: IDBObjectStore) => IDBRequest<T>,
	): Promise<T> => {
		const db = await open();
		try {
			return await new Promise<T>((resolve, reject) => {
				const tx = db.transaction(STORE, mode);
				const request = act(tx.objectStore(STORE));
				tx.oncomplete = () => resolve(request.result);
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	};
	return {
		read: async () => {
			const kept = await run("readonly", (store) => store.get(KEY));
			return isKept(kept) ? kept : null;
		},
		write: async (kept) => {
			await run("readwrite", (store) => store.put({ ...kept }, KEY));
		},
		forget: async () => {
			await run("readwrite", (store) => store.delete(KEY));
		},
	};
}

/** What the callback page says on the channel, and what the worker answers. */
export type CallbackMessage =
	| { kind: "visit"; id: string; search: string }
	| { kind: "answer"; id: string; text: string };

/**
 * The website's receiver: the site's own `/oauth/callback` page, heard on
 * SIGN_IN_CHANNEL while a sign-in waits. `origin` is the site's.
 */
export function channelReceiver(origin: string): SignInReceiver {
	let channel: BroadcastChannel | null = null;
	return {
		redirectUri: `${origin}${ROBLOX_WEB_REDIRECT_PATH}`,
		async open(visit, ended) {
			channel?.close();
			const listening = new BroadcastChannel(SIGN_IN_CHANNEL);
			channel = listening;
			listening.onmessage = (event: MessageEvent<CallbackMessage>) => {
				const message = event.data;
				if (message?.kind !== "visit" || typeof message.search !== "string") return;
				void visit(new URLSearchParams(message.search)).then((answer) => {
					// Not this tab's sign-in: another worker's to answer.
					if (!answer) return;
					const reply: CallbackMessage = { kind: "answer", id: message.id, text: answer.text };
					listening.postMessage(reply);
					if (answer.end) ended();
				});
			};
		},
		close() {
			channel?.close();
			channel = null;
		},
	};
}
