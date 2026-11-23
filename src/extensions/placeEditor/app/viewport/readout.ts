/**
 * The corner readout while the renderer starts: which one, and how much of
 * its shaders has compiled, as "Starting (WebGPU – Shaders 70%)".
 */
export function startingText(
	backend: string | null,
	shaders: number | null,
	updated = false,
): string {
	const name = backend ?? "…";
	// An update changed the shaders: the browser has none of them yet, and this start is slower.
	const why = updated ? ", new in this update" : "";
	if (shaders === null) return `Starting (${name}${why})`;
	// Down, so 100% is only ever all of them; the nudge keeps 0.29 from flooring to 28.
	const percent = Math.floor(Math.max(0, Math.min(1, shaders)) * 100 + 1e-9);
	return `Starting (${name} – Shaders ${percent}%${why})`;
}
