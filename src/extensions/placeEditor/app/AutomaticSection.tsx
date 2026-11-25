/**
 * Automatic's choices in the Rendering panel's Inspect tab: what the view
 * measured and chose in this place, with the times behind each, read again
 * each second while it is open, as the measuring goes on while the view moves.
 */

import { useEffect, useState } from "react";

import { SectionHead, useFold } from "../../../app/PanelParts.jsx";
import { type AutomaticLine, automaticLines } from "./viewport/automaticLines.js";
import type { ViewportController } from "./viewport/controller.js";
import { SAVING_LABELS } from "./viewport/dynamicScale.js";
import { FEATURES } from "./viewport/renderFeatures.js";

/** A saving's words, or a switch's name, for the savings Dynamic optimization has taken. */
const labelOf = (key: string) =>
	(SAVING_LABELS as Record<string, string>)[key] ??
	FEATURES.find((f) => f.key === key)?.label ??
	key;

/** The rows, as text: for a report. */
export function automaticText(controller: ViewportController): string {
	return automaticLines(controller.automaticChoices(), labelOf)
		.map((line) => `${line.label}: ${line.value}${line.detail ? ` (${line.detail})` : ""}`)
		.join("\n");
}

export function AutomaticSection({ controller }: { controller: ViewportController }) {
	const [open, toggle] = useFold(true);
	const [lines, setLines] = useState<AutomaticLine[]>(() =>
		automaticLines(controller.automaticChoices(), labelOf),
	);
	useEffect(() => {
		if (!open) return;
		const read = () => setLines(automaticLines(controller.automaticChoices(), labelOf));
		read();
		const every = setInterval(read, 1000);
		return () => clearInterval(every);
	}, [controller, open]);
	return (
		<div className="place-group">
			<SectionHead title="Automatic's choices" open={open} onToggle={toggle} />
			{open && (
				<dl className="auto-lines">
					{lines.map((line) => (
						<div key={line.label}>
							<dt>{line.label}</dt>
							<dd>
								{line.value}
								{line.detail && <span className="render-setting-line">{line.detail}</span>}
							</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);
}
