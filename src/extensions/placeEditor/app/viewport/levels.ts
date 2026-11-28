/**
 * The quality levels' names and where Roswaal's own begin. Levels 1 to 21
 * are Studio's Enum.QualityLevel, drawn as near to Studio's picture as this
 * viewer can; Automatic never goes past them. From Level 22 each level adds
 * one of Roswaal's own on the one below, the cheapest first on the author's
 * iPads (1.1.0-canary.147): what Studio does not draw, or draws wrongly.
 *
 * Kept apart from quality.ts, which needs the renderer's tables, so the
 * settings' list can name the levels without them.
 */

/** Studio's highest level: everything, as Studio draws it. Automatic climbs no higher. */
export const STUDIO_TOP = 21;

/** From here, reflections are drawn exactly every frame, not from a grid of kept cubes. */
export const REALTIME_REFLECTIONS = 22;
/** From here, light objects are lit pixel by pixel, not from the light grid, whatever the LightingStyle. */
export const REALTIME_LIGHTS = 23;
/** From here, the ambient light reads the sky's maps in full, not the lighting cells. */
export const REALTIME_AMBIENT = 24;
/** From here, the Rendering panel's Roswaal fixes are on: changes from Studio's picture on purpose. */
export const FIXES_LEVEL = 25;

/** The highest level of all. */
export const ROSWAAL_TOP = FIXES_LEVEL;

/** What each level past Studio's adds. */
const BEYOND: Record<number, string> = {
	[REALTIME_REFLECTIONS]: "Realtime reflections",
	[REALTIME_LIGHTS]: "Realtime light objects",
	[REALTIME_AMBIENT]: "Realtime ambient lighting",
	[FIXES_LEVEL]: "Roswaal fixes",
};

/** A level's name: Level 21's with As Studio, those past it with what they add. */
export function levelLabel(level: number): string {
	if (level === STUDIO_TOP) return `Level ${level} · As Studio`;
	const adds = BEYOND[level];
	return adds ? `Level ${level} · ${adds}` : `Level ${level}`;
}
