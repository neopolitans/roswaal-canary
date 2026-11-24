/**
 * The meshes a place's MeshParts and FileMeshes name, from what Sign in with
 * Roblox has downloaded: asked of the daemon, which fetches what the project
 * lacks, then read back and read as meshes.
 *
 * Nothing is asked of anyone who is not signed in; their places keep the boxes
 * they have always had. A mesh that cannot be read stays a box.
 */

import { type FileMesh, readMesh } from "../../core/mesh.js";
import type { NotAsked } from "./assetProgress.js";
import { bytesOf, ensure, notAsked } from "./images.js";

/** Roblox's asset type for a mesh. */
const MESH_TYPE = 4;

/**
 * Each of `assets` read as a mesh, handed to `show` as it arrives; the answer
 * is why none were asked for, or null. `kept` is called once the meshes kept
 * already are shown, before anything downloads, so the view can take them.
 */
export async function loadMeshes(
	assets: readonly string[],
	show: (asset: string, mesh: FileMesh) => void,
	kept?: () => void,
): Promise<NotAsked | null> {
	// Only Roblox's ids, which are numbers: a benchmark's own is handed to the viewer, never asked for.
	const roblox = assets.filter((a) => /^\d+$/.test(a));
	if (roblox.length === 0) return null;
	const why = await notAsked();
	if (why) return why;
	const unique = [...new Set(roblox)];
	let told = false;
	const tell = () => {
		if (told) return;
		told = true;
		kept?.();
	};
	await ensure(unique, async (ready, from) => {
		// The first download means the kept ones are all shown.
		if (from === "downloaded") tell();
		for (const id of ready) {
			const got = await bytesOf(id);
			if (!got || (got.assetTypeId !== undefined && got.assetTypeId !== MESH_TYPE)) continue;
			try {
				show(id, readMesh(got.bytes));
			} catch {
				// Not a mesh Roswaal reads, as one compressed with Draco: it stays a box.
			}
		}
		if (from === "held") tell();
	});
	return null;
}
