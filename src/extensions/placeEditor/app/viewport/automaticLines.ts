/**
 * What Automatic measured and chose in this place, as the Rendering panel's
 * Inspect tab shows it: a row for each choice, with the times behind it.
 * Today these choices are made out of sight; this is where they are seen.
 */

import type { DepthPath, LampMode } from "./depthChoice.js";

/** The controller's choices, as `ViewportController.automaticChoices` gives them. */
export interface AutomaticChoices {
	/** The renderer drawing, or null before the view has started. */
	backend: "WebGPU" | "WebGL2" | null;
	/** Why WebGPU did not start, where WebGL2 draws in its place. */
	fellBackWhy: string | null;
	quality: { auto: boolean; level: number };
	/** The depth path, where the renderer has two; null where it draws one way. */
	depth: {
		chosen: DepthPath | null;
		medians: Record<DepthPath, number> | null;
		/** Measured on this device before and kept: see keptDepth. */
		kept: boolean;
	} | null;
	lamps: {
		/** Light objects in the place. */
		lights: number;
		/** How the view draws them now. */
		mode: LampMode;
	};
	/** Dynamic's render scale and Dynamic optimization's savings, or null with both off. */
	dynamic: { share: number; savings: string[] } | null;
}

export interface AutomaticLine {
	label: string;
	value: string;
	detail?: string;
}

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const ms = (n: number) => `${n.toFixed(1)} ms`;

/** The rows, in the order the view makes its choices. `labelOf` names a switch by key. */
export function automaticLines(
	choices: AutomaticChoices,
	labelOf: (key: string) => string,
): AutomaticLine[] {
	const lines: AutomaticLine[] = [];
	const { backend, fellBackWhy, quality, depth, lamps, dynamic } = choices;

	lines.push(
		backend === null
			? { label: "Renderer", value: "Not started" }
			: fellBackWhy && backend === "WebGL2"
				? { label: "Renderer", value: "WebGL2", detail: `WebGPU did not start: ${fellBackWhy}` }
				: { label: "Renderer", value: backend },
	);

	lines.push({
		label: "Quality",
		value: quality.auto ? `Automatic · Level ${quality.level}` : `Level ${quality.level}`,
		detail: quality.auto
			? "Moves a level down or up with how fast frames are drawn."
			: "Chosen in Settings or Picture's Quality.",
	});

	if (depth) {
		const m = depth.medians;
		lines.push({
			label: "Depth path",
			value: depth.chosen
				? m && depth.chosen === "lean"
					? `Lean · ${ms(m.full - m.lean)} faster`
					: cap(depth.chosen)
				: m
					? "Measuring"
					: "Measured as the view moves",
			detail: m
				? `A frame's median: full ${ms(m.full)}, lean ${ms(m.lean)}.`
				: depth.kept
					? "Measured on this device before, and kept."
					: "Full shades each pixel once after the depth; lean shades and tests depth in one draw.",
		});
	}

	lines.push(
		lamps.lights === 0
			? { label: "Light objects", value: "None in this place" }
			: {
					label: "Light objects",
					value: cap(lamps.mode),
					detail: "Set in Settings › Graphics, not measured.",
				},
	);

	lines.push(
		dynamic === null
			? {
					label: "Dynamic",
					value: "Off",
					detail: "Render scale Dynamic and Dynamic optimization are off.",
				}
			: {
					label: "Dynamic",
					value: dynamic.share < 1 ? `${Math.round(dynamic.share * 100)}% of Native` : "Full scale",
					detail:
						dynamic.savings.length > 0
							? `Savings taken: ${dynamic.savings.map(labelOf).join(", ")}.`
							: "No savings taken: frames fit.",
				},
	);
	return lines;
}
