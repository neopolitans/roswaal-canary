/**
 * What Roswaal carries for its benchmark: sixteen tank models and twelve
 * prototype textures, each fetched once, when a station first needs it, and
 * never part of the editor's own bundle.
 *
 * The tanks are Teensy Tiny Tankery models by MayLizbeth ("extraclear"),
 * CC BY 4.0: see `tanks/README.md` and `notices/upstream/teensy-tiny-tankery.txt`.
 * The textures are Kenney's Prototype Textures, CC0: see
 * `notices/upstream/kenney-prototype-textures.txt`.
 */

import { type GlbPart, readGlb } from "../../core/glb.js";

/** The tanks, by file: their own names, in the order a station lays them out. */
const TANK_FILES: Record<string, string> = {
	Challenger_2: new URL("./tanks/Challenger_2.glb", import.meta.url).href,
	Charioteer_VII_B: new URL("./tanks/Charioteer_VII_B.glb", import.meta.url).href,
	Chieftain: new URL("./tanks/Chieftain.glb", import.meta.url).href,
	Churchill_VII: new URL("./tanks/Churchill_VII.glb", import.meta.url).href,
	CometI: new URL("./tanks/CometI.glb", import.meta.url).href,
	CromwellV: new URL("./tanks/CromwellV.glb", import.meta.url).href,
	M103: new URL("./tanks/M103.glb", import.meta.url).href,
	M18: new URL("./tanks/M18.glb", import.meta.url).href,
	M26_Medium_Tank: new URL("./tanks/M26_Medium_Tank.glb", import.meta.url).href,
	PanzerIV_F2: new URL("./tanks/PanzerIV_F2.glb", import.meta.url).href,
	PanzerIV_H: new URL("./tanks/PanzerIV_H.glb", import.meta.url).href,
	"T-34_76": new URL("./tanks/T-34_76.glb", import.meta.url).href,
	"T-34_85": new URL("./tanks/T-34_85.glb", import.meta.url).href,
	TigerI: new URL("./tanks/TigerI.glb", import.meta.url).href,
	TigerII: new URL("./tanks/TigerII.glb", import.meta.url).href,
	VK_4501_H: new URL("./tanks/VK_4501_H.glb", import.meta.url).href,
};

export const TANK_NAMES = Object.keys(TANK_FILES);

/** Kenney's grid (01) and checker (08) patterns, in each of their six colours. */
const TEXTURE_FILES: Record<string, string> = {
	Dark_01: new URL("./textures/Dark_01.png", import.meta.url).href,
	Dark_08: new URL("./textures/Dark_08.png", import.meta.url).href,
	Green_01: new URL("./textures/Green_01.png", import.meta.url).href,
	Green_08: new URL("./textures/Green_08.png", import.meta.url).href,
	Light_01: new URL("./textures/Light_01.png", import.meta.url).href,
	Light_08: new URL("./textures/Light_08.png", import.meta.url).href,
	Orange_01: new URL("./textures/Orange_01.png", import.meta.url).href,
	Orange_08: new URL("./textures/Orange_08.png", import.meta.url).href,
	Purple_01: new URL("./textures/Purple_01.png", import.meta.url).href,
	Purple_08: new URL("./textures/Purple_08.png", import.meta.url).href,
	Red_01: new URL("./textures/Red_01.png", import.meta.url).href,
	Red_08: new URL("./textures/Red_08.png", import.meta.url).href,
};

export const TEXTURE_NAMES = Object.keys(TEXTURE_FILES);

async function bytesAt(url: string): Promise<Uint8Array> {
	// A small file the build inlined: read from its URL, since the page's
	// policy (connect-src 'self') refuses a fetch of a data: URL.
	const inline = /^data:[^,]*;base64,(.*)$/s.exec(url);
	if (inline) return Uint8Array.from(atob(inline[1]), (c) => c.charCodeAt(0));
	const answer = await fetch(url);
	if (!answer.ok) throw new Error(`${url}: ${answer.status}`);
	return new Uint8Array(await answer.arrayBuffer());
}

let tanks: Promise<Map<string, GlbPart[]>> | null = null;

/** Every tank's parts, in metres with Y up, as their files have them. Fetched once. */
export function loadTanks(): Promise<Map<string, GlbPart[]>> {
	tanks ??= Promise.all(
		TANK_NAMES.map(async (name) => [name, readGlb(await bytesAt(TANK_FILES[name]))] as const),
	)
		.then((read) => new Map(read))
		.catch((error) => {
			// Asked for again next time, rather than failing every run after one bad fetch.
			tanks = null;
			throw error;
		});
	return tanks;
}

let textures: Promise<Map<string, ImageBitmap>> | null = null;

/**
 * Every texture, decoded as the viewer's own images are (colours not
 * multiplied by alpha). One that cannot be decoded is left out: its faces
 * are then drawn without it.
 */
export function loadTextures(): Promise<Map<string, ImageBitmap>> {
	textures ??= Promise.all(
		TEXTURE_NAMES.map(async (name) => {
			try {
				const bytes = await bytesAt(TEXTURE_FILES[name]);
				const image = await createImageBitmap(new Blob([bytes as BlobPart]), {
					premultiplyAlpha: "none",
				});
				return [name, image] as const;
			} catch {
				return null;
			}
		}),
	).then((read) => new Map(read.filter((r) => r !== null)));
	return textures;
}
