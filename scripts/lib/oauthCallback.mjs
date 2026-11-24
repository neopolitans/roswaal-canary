/**
 * The site's `/oauth/callback` page and its script, for `build-pages.mjs`:
 * where Roblox sends the tab Sign in with Roblox opened. The page hands the
 * visit to the editor's worker on SIGN_IN_CHANNEL and shows its answer; the
 * worker's side is `src/web/robloxSignIn.ts`, whose channel name a test
 * checks against this one.
 */

/** The channel the callback page and the editor's worker speak on. */
export const SIGN_IN_CHANNEL = "roswaal-roblox-signin";

/**
 * The callback page's script: `/oauth/callback.js`, written by the site's
 * build beside `callback.html`. Takes the code out of the address bar first,
 * hands the visit to the editor's worker, shows its answer and closes the tab.
 * Plain JavaScript, as it runs alone, with nothing of the editor loaded.
 */
export const CALLBACK_SCRIPT = `(() => {
	const search = location.search;
	history.replaceState(null, "", location.pathname);
	const said = document.getElementById("said");
	const say = (text) => { said.textContent = text; };
	if (!("BroadcastChannel" in window)) {
		say("This browser cannot hand the sign-in back to Roswaal.");
		return;
	}
	const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
	const channel = new BroadcastChannel(${JSON.stringify(SIGN_IN_CHANNEL)});
	const late = setTimeout(() => {
		say("No Roswaal tab was waiting for this sign-in. Start it again from Settings, Roblox account, in the tab where Roswaal is open.");
		channel.close();
	}, 20000);
	channel.onmessage = (event) => {
		const message = event.data;
		if (!message || message.kind !== "answer" || message.id !== id) return;
		clearTimeout(late);
		say(message.text);
		channel.close();
		setTimeout(() => window.close(), 1500);
	};
	channel.postMessage({ kind: "visit", id, search });
})();
`;

/** The callback page itself: `/oauth/callback.html`, which Pages serves for `/oauth/callback`. */
export function callbackPage() {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Signing in · Roswaal</title>
<script src="callback.js" defer></script>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#16171b;color:#e6e6e9;font:16px system-ui,sans-serif">
<p id="said" style="max-width:32em;padding:24px;text-align:center">Handing the sign-in to Roswaal…</p>
</body>
</html>
`;
}
