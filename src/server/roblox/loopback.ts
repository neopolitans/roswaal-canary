/**
 * The daemon's receiver for Sign in with Roblox: a listener on
 * `http://localhost:4474/oauth/callback`, the redirect registered for it,
 * open only while a sign-in waits. See `signin.ts`.
 */

import { createServer, type Server } from "node:http";

import type { SignInReceiver } from "./signin.js";

export function loopbackReceiver(redirect: {
	host: string;
	port: number;
	path: string;
}): SignInReceiver {
	const redirectUri = `http://${redirect.host}:${redirect.port}${redirect.path}`;
	const expectedHost = `${redirect.host}:${redirect.port}`;
	let server: Server | null = null;
	return {
		redirectUri,
		async open(visit, ended) {
			const listening = createServer((req, res) => {
				const url = new URL(req.url ?? "/", redirectUri);
				const host = req.headers.host;
				const answered =
					url.pathname !== redirect.path || (host && host !== expectedHost)
						? Promise.resolve({ status: 404, text: "Not here." })
						: visit(url.searchParams).then(
								// Another sign-in's state: answered, and ignored.
								(answer) =>
									answer ?? { status: 400, text: "This sign-in is not the one Roswaal started." },
							);
				void answered.then((answer) => {
					res.writeHead(answer.status, {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "no-store",
						"Referrer-Policy": "no-referrer",
					});
					res.end(answer.text, () => {
						if ("end" in answer && answer.end) ended();
					});
				});
			});
			await new Promise<void>((resolve, reject) => {
				listening.once("error", () =>
					reject(
						new Error(
							`Sign in with Roblox needs port ${redirect.port}, and something else is using it.`,
						),
					),
				);
				listening.listen(redirect.port, redirect.host, () => resolve());
			});
			server = listening;
		},
		close() {
			if (!server) return;
			server.closeAllConnections?.();
			server.close();
			server = null;
		},
	};
}
