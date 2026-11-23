/**
 * AssetContentMap (binary type 0x23): the map Roblox keeps Expanded Terrain's
 * voxels in, read and written as rbx-dom's published format description has
 * it (docs/binary.md, docs/xml.md), so converting a place keeps its terrain.
 * The examples are that description's own.
 */

import { describe, expect, it } from "vitest";
import type { AssetContentMapValue } from "../src/core/rbx/dom.js";
import { readRbx } from "../src/core/rbx/index.js";
import { convertPlace, writeBinaryPlace } from "../src/core/rbx/serialize.js";
import { buildPlace, service } from "./rbxfixture.js";

const utf8 = new TextEncoder();

/** A u32-length-prefixed string, as the binary format writes one. */
function str(s: string | Uint8Array): number[] {
	const b = typeof s === "string" ? utf8.encode(s) : s;
	return [b.length & 255, (b.length >> 8) & 255, (b.length >> 16) & 255, b.length >>> 24, ...b];
}

/** One value: entries (flag bit 1, an i64 count), a bundle (bit 0), or both. */
function value(entries?: [string, string][], bundle?: string, flags?: number): Uint8Array {
	const f = flags ?? (bundle !== undefined ? 1 : 0) | (entries ? 2 : 0);
	const out = [f];
	if (bundle !== undefined) out.push(...str(bundle));
	if (entries) {
		out.push(entries.length, 0, 0, 0, 0, 0, 0, 0);
		for (const [key, data] of entries) out.push(...str(key), ...str(data));
	}
	return Uint8Array.from(out);
}

/** A place whose Terrain holds `maps`, one Terrain each. */
function placeWith(...maps: Uint8Array[]): Uint8Array {
	return buildPlace([
		service(
			"Workspace",
			maps.map((map, i) => ({
				className: "Terrain",
				name: `Terrain${i}`,
				props: { VoxelGridAssetContentMap: { type: 35, value: map } },
			})),
		),
	]);
}

const mapOf = (bytes: Uint8Array, name = "Terrain0") =>
	readRbx(bytes)
		.instances.find((i) => i.name === name)
		?.props.get("VoxelGridAssetContentMap");

const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data);

describe("an AssetContentMap in a binary place", () => {
	it("reads the empty map as the format describes it: 02 then eight zero bytes", () => {
		expect(Array.from(value([]))).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(mapOf(placeWith(value([])))).toEqual({
			type: "AssetContentMap",
			value: { entries: [] },
		});
	});

	it("reads entries, a bundle, and several values stored one after another", () => {
		const bytes = placeWith(value([["example", "Rojo is cool!"]]), value(undefined, "12345"));
		const first = mapOf(bytes)?.value as AssetContentMapValue;
		expect(first.entries?.map(([k, d]) => [k, text(d)])).toEqual([["example", "Rojo is cool!"]]);
		expect(first.bundle).toBeUndefined();
		expect(mapOf(bytes, "Terrain1")?.value).toEqual({ bundle: "12345" });
		expect(readRbx(bytes).undecoded.size).toBe(0);
	});

	it("leaves one with a flag it does not know undecoded, named, rather than read wrong", () => {
		const doc = readRbx(placeWith(value([], undefined, 6)));
		expect(doc.undecoded.get("AssetContentMap")).toBe(1);
		expect(
			doc.instances.find((i) => i.name === "Terrain0")?.props.has("VoxelGridAssetContentMap"),
		).toBe(false);
	});

	it("leaves a damaged one undecoded, and still opens the place", () => {
		// A bundle whose string says it runs far past the chunk.
		const doc = readRbx(placeWith(Uint8Array.of(1, 2, 3, 4)));
		expect(doc.undecoded.get("AssetContentMap")).toBe(1);
		expect(doc.instances.some((i) => i.name === "Terrain0")).toBe(true);
	});

	it("is written back as it was read", () => {
		const bytes = placeWith(
			value([
				["a", "1"],
				["b", "\u0000ÿ"],
			]),
			value(undefined, "777"),
		);
		const again = writeBinaryPlace(readRbx(bytes));
		expect(mapOf(again)).toEqual(mapOf(bytes));
		expect(mapOf(again, "Terrain1")).toEqual(mapOf(bytes, "Terrain1"));
	});
});

describe("an AssetContentMap converted between .rbxl and .rbxlx", () => {
	it("keeps the voxels: a JSON array of keys and Base64 data in XML, and back", () => {
		const bytes = placeWith(value([["example", "Rojo is cool!"]]));
		const xml = convertPlace(bytes, "rbxlx");
		const written = new TextDecoder().decode(xml.bytes);
		expect(written).toContain(
			'<AssetContentMap name="VoxelGridAssetContentMap">[{&quot;key&quot;:&quot;example&quot;,&quot;data&quot;:&quot;Um9qbyBpcyBjb29sIQ==&quot;}]</AssetContentMap>',
		);
		expect(xml.leftOut).toEqual([]);
		const back = convertPlace(xml.bytes, "rbxl");
		expect(back.leftOut).toEqual([]);
		const entries = (mapOf(back.bytes)?.value as AssetContentMapValue).entries;
		expect(entries?.map(([k, d]) => [k, text(d)])).toEqual([["example", "Rojo is cool!"]]);
	});

	it("reads Base64 with whitespace in it, and the empty array", () => {
		const xml = new TextDecoder()
			.decode(convertPlace(placeWith(value([]), value([["k", "Rojo is cool!"]])), "rbxlx").bytes)
			// A line break and spaces in the Base64, as JSON escapes them.
			.replace("Um9qbyBpcyBjb29sIQ==", "Um9qbyBp\\n  cyBjb29sIQ==");
		const back = convertPlace(new TextEncoder().encode(xml), "rbxl").bytes;
		expect(mapOf(back)?.value).toEqual({ entries: [] });
		expect(text((mapOf(back, "Terrain1")?.value as AssetContentMapValue).entries?.[0][1])).toBe(
			"Rojo is cool!",
		);
	});

	it("leaves a map only in an uploaded bundle out of XML, and says so, never writing it as empty", () => {
		const xml = convertPlace(placeWith(value(undefined, "12345")), "rbxlx");
		const written = new TextDecoder().decode(xml.bytes);
		expect(written).not.toContain("<AssetContentMap");
		expect(written).toContain("AssetContentMap in uploaded bundle 12345");
		expect(xml.leftOut).toEqual([["AssetContentMap in an uploaded bundle", 1]]);
	});

	it("keeps the first of a repeated key in XML, as Roblox does", () => {
		const written = new TextDecoder().decode(
			convertPlace(
				placeWith(
					value([
						["k", "first"],
						["k", "second"],
					]),
				),
				"rbxlx",
			).bytes,
		);
		expect(written.match(/&quot;key&quot;:&quot;k&quot;/g)).toHaveLength(1);
		expect(written).toContain(Buffer.from("first").toString("base64"));
	});
});
