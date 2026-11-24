/**
 * Settings › Roblox account: Sign in with Roblox. Roswaal's own, first under
 * This browser, so whatever fetches from Roblox can use it: today the Place
 * Editor's meshes and images, whose downloads it lists on its Scene view page.
 *
 * Before Roblox's own page, what is asked for, where it is kept, how to
 * remove it, and a word for anyone under 18 -- the screen the sign-in research
 * asked for. The sign-in itself is the daemon's; this never sees a token.
 */

import { useState } from "react";

import { pageHref } from "./pages.js";
import { signOutOfRoblox, startRobloxSignIn, useRobloxStatus } from "./robloxAccount.js";
import { Group, Row } from "./settingsParts.jsx";

export function RobloxAccountPage() {
	const status = useRobloxStatus();
	const [explaining, setExplaining] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!status.available) {
		return (
			<Group title="Sign in with Roblox">
				<Row
					label="Not on the website"
					help="Sign in with Roblox is offered by Roswaal on your computer. Here, meshes and images are drawn as stand-ins."
				/>
			</Group>
		);
	}

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Group title="Sign in with Roblox">
			{status.signedIn ? (
				<Row
					label={`Signed in as Roblox user ${status.userId ?? ""}`}
					help="Signing out ends the sign-in on Roblox and deletes everything downloaded with it."
				>
					<button
						type="button"
						className="tb"
						disabled={busy}
						onClick={() => void run(signOutOfRoblox)}
					>
						Sign out
					</button>
				</Row>
			) : explaining ? (
				<div className="setting roblox-consent">
					<div className="setting-label">
						<strong>Before you continue to Roblox</strong>
						<ul className="dialog-points">
							<li>
								Roblox asks you to let Roswaal download assets, read who made an asset, and know
								your Roblox user ID. Nothing else: not your name, avatar or friends.
							</li>
							<li>
								The sign-in stays on this computer, readable only by your account, and encrypted on
								Windows. It never goes into a project, this tab or a log.
							</li>
							<li>
								Meshes and images Roswaal downloads stay in the project's <code>.roswaal</code>{" "}
								folder, out of Git, and are never shared.
							</li>
							<li>
								Sign out here at any time. It ends the sign-in on Roblox and deletes what was
								downloaded.
							</li>
							<li>
								<strong>Under 18?</strong> Ask a parent or guardian before you sign in.
							</li>
						</ul>
						<span>
							More in the{" "}
							<a href={pageHref("docs", "privacy")} target="_blank" rel="noopener">
								Privacy Policy
							</a>
							.
						</span>
						<div className="roblox-consent-actions">
							<button type="button" className="tb" onClick={() => setExplaining(false)}>
								Cancel
							</button>
							<button
								type="button"
								className="tb primary"
								disabled={busy}
								onClick={() =>
									void run(async () => {
										await startRobloxSignIn();
										setExplaining(false);
									})
								}
							>
								Continue to Roblox
							</button>
						</div>
					</div>
				</div>
			) : (
				<Row
					label={status.signingIn ? "Waiting for Roblox" : "Not signed in"}
					help={
						status.signingIn
							? "Finish signing in on Roblox's page, in the tab that opened."
							: "Optional. Lets Roswaal fetch what your places use from Roblox: today, the meshes and images the Place Editor draws. Everything else works without it."
					}
				>
					<button type="button" className="tb" onClick={() => setExplaining(true)}>
						{status.signingIn ? "Start again" : "Sign in…"}
					</button>
				</Row>
			)}
			{(error ?? status.failed) && <p className="settings-note">{error ?? status.failed}</p>}
		</Group>
	);
}
