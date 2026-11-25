/**
 * The start log in the Rendering panel's Inspect tab: the steps of the last
 * start with their times, and, where the start before this page's never
 * reached its end, the step it stopped at. See `startLog.ts`.
 */

import { useEffect, useState } from "react";

import { SectionHead, useFold } from "../../../app/PanelParts.jsx";
import {
	clearStartLog,
	START_LOG_EVENT,
	type StartRun,
	startRuns,
	startText,
	thisPageStart,
	unfinishedBefore,
} from "./viewport/startLog.js";

/** The starts kept, again whenever a step is written. */
function useStartRuns(): StartRun[] {
	const [runs, setRuns] = useState(startRuns);
	useEffect(() => {
		const again = () => setRuns(startRuns());
		addEventListener(START_LOG_EVENT, again);
		return () => removeEventListener(START_LOG_EVENT, again);
	}, []);
	return runs;
}

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function StartLogSection() {
	const runs = useStartRuns();
	const stopped = unfinishedBefore(runs, thisPageStart());
	const [open, toggle] = useFold(true);
	const [copied, setCopied] = useState<"" | "Copied" | "Copy failed">("");
	const latest = runs[0];
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(runs.map(startText).join("\n\n"));
			setCopied("Copied");
		} catch {
			setCopied("Copy failed");
		}
		setTimeout(() => setCopied(""), 2000);
	};
	return (
		<div className="place-group">
			<SectionHead title="Start log" open={open} onToggle={toggle} />
			{open && (
				<>
					{stopped && (
						<p className="render-detail start-stopped" role="status">
							<strong>{stopped.kind}</strong> did not finish last time: it stopped after{" "}
							<strong>{stopped.steps.at(-1)?.step}</strong>,{" "}
							{seconds(stopped.steps.at(-1)?.at ?? 0)} in. The page froze, or was closed or
							reloaded, there.
						</p>
					)}
					{latest ? (
						<>
							<p className="render-setting-line start-head">
								{latest.kind}
								{latest.done ? "" : ", under way"}
							</p>
							<ol className="start-steps">
								{latest.steps.map((s, i) => (
									<li key={`${s.at}-${i}`}>
										<span className="start-at">{seconds(s.at)}</span>
										<span>
											{s.step}
											{s.note && <span className="start-note"> · {s.note}</span>}
										</span>
									</li>
								))}
							</ol>
						</>
					) : (
						<p className="render-setting-line start-head">Opening a place writes its steps here.</p>
					)}
					<div className="start-actions">
						<button type="button" className="tb" disabled={runs.length === 0} onClick={copy}>
							{copied || "Copy log"}
						</button>
						<button
							type="button"
							className="tb"
							disabled={runs.length <= 1}
							onClick={clearStartLog}
						>
							Clear older
						</button>
					</div>
				</>
			)}
		</div>
	);
}
