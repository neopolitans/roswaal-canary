/**
 * Settings › Scene view's Downloaded assets: what the open project holds from
 * Sign in with Roblox, and a way to delete it. Shown while signed in.
 */

import { useCallback, useEffect, useState } from "react";

import { useRobloxStatus } from "../../../app/robloxAccount.js";
import { Group, Row } from "../../../app/settingsParts.jsx";
import { robloxApi } from "../app/robloxApi.js";

export function DownloadedAssetsSection() {
	const status = useRobloxStatus();
	if (!status.available || !status.signedIn) return null;
	return (
		<Group title="Roblox">
			<DownloadedAssetsRow />
		</Group>
	);
}

/**
 * What the open project holds from Sign in with Roblox, and a way to delete it.
 * Unused assets go by themselves after 30 days.
 */
function DownloadedAssetsRow() {
	const [held, setHeld] = useState<{ count: number; bytes: number } | null>(null);
	const [busy, setBusy] = useState(false);
	const load = useCallback(() => {
		robloxApi.assets().then(
			(answer) => setHeld(answer.available ? answer : null),
			() => setHeld(null),
		);
	}, []);
	useEffect(load, [load]);
	if (!held) return null;
	const size =
		held.bytes < 1024 * 1024
			? `${Math.ceil(held.bytes / 1024)} KB`
			: `${(held.bytes / 1024 / 1024).toFixed(1)} MB`;
	return (
		<Row
			label="Downloaded assets"
			help={
				held.count === 0
					? "None in this project. Any not used for 30 days are deleted by themselves."
					: `${held.count} in this project, ${size}, out of Git. Any not used for 30 days are deleted by themselves.`
			}
		>
			<button
				type="button"
				className="tb"
				disabled={busy || held.count === 0}
				onClick={() => {
					setBusy(true);
					robloxApi
						.clearAssets()
						.then(load, load)
						.finally(() => setBusy(false));
				}}
			>
				Clear
			</button>
		</Row>
	);
}
