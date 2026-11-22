/**
 * Highlight instances as the renderers take them: which parts each covers,
 * by row, split by whether Studio would leave them out, and the fully
 * transparent ones kept for Roswaal's "Transparent parts show Highlight".
 */

import { describe, expect, it } from "vitest";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import {
	buildPlaceScene,
	HIGHLIGHT_LIMIT,
	SCENE_STRIDE,
	workspaceHighlights,
} from "../src/extensions/placeEditor/core/scene.js";

function inst(
	className: string,
	props: Record<string, [PropType, unknown]>,
	children: RbxInstance[] = [],
	name = className,
): RbxInstance {
	const made: RbxInstance = {
		className,
		name,
		parent: null,
		children,
		props: new Map<string, Prop>(
			Object.entries(props).map(([k, [type, value]]) => [k, { type, value }]),
		),
		service: false,
	};
	for (const child of children) child.parent = made;
	return made;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const part = (name: string, transparency = 0, ...kids: RbxInstance[]) =>
	inst(
		"Part",
		{
			CFrame: ["CFrame", { position: [0, 0, 0], rotation: IDENTITY }],
			size: ["Vector3", [4, 4, 4]],
			Transparency: ["Float32", transparency],
		},
		kids,
		name,
	);

/** Ids by instance, in the order they are reached, as the DataModel browser's rows. */
function ids(root: RbxInstance): (i: RbxInstance) => number | undefined {
	const order = new Map<RbxInstance, number>();
	const walk = (at: RbxInstance) => {
		order.set(at, order.size);
		for (const c of at.children) walk(c);
	};
	walk(root);
	return (i) => order.get(i);
}

describe("Highlight instances", () => {
	it("cover their parent and every part in it, by row, with Studio's defaults", () => {
		const a = part("A");
		const b = part("B");
		const model = inst("Model", {}, [a, b, inst("Highlight", {})]);
		const workspace = inst("Workspace", {}, [model, part("Plain")]);
		const idOf = ids(workspace);
		const scene = buildPlaceScene(workspace, idOf);
		expect(scene.highlights).toEqual([
			{
				parts: [idOf(a), idOf(b)],
				seeThrough: [],
				fill: [1, 0, 0],
				fillTransparency: 0.5,
				outline: [1, 1, 1],
				outlineTransparency: 0,
				onTop: true,
			},
		]);
	});

	it("cover their Adornee rather than their parent, and read DepthMode Occluded", () => {
		const target = part("Target");
		const holder = part(
			"Holder",
			0,
			inst("Highlight", { Adornee: ["Ref", target], DepthMode: ["Enum", 1] }),
		);
		const workspace = inst("Workspace", {}, [holder, target]);
		const idOf = ids(workspace);
		const [h] = buildPlaceScene(workspace, idOf).highlights ?? [];
		expect(h.parts).toEqual([idOf(target)]);
		expect(h.onTop).toBe(false);
	});

	it("leave out parts with any Transparency, as Studio does, and keep the fully transparent for Roswaal's switch", () => {
		const solid = part("Solid");
		const faint = part("Faint", 0.02);
		const gone = part("Gone", 1);
		const model = inst("Model", {}, [solid, faint, gone, inst("Highlight", {})]);
		const workspace = inst("Workspace", {}, [model]);
		const idOf = ids(workspace);
		const scene = buildPlaceScene(workspace, idOf);
		const [h] = scene.highlights ?? [];
		expect(h.parts).toEqual([idOf(solid)]);
		expect(h.seeThrough).toEqual([idOf(faint), idOf(gone)]);
		// The fully transparent part: not drawn, kept as a ghost for the mask alone.
		expect(scene.kinds.block.count).toBe(1);
		expect(scene.translucent.block.count).toBe(1);
		expect(scene.ghosts?.block.count).toBe(1);
		const words = new Uint32Array(scene.ghosts!.block.data.buffer);
		expect(words[13]).toBe(idOf(gone));
		expect(scene.ghosts!.block.data.length).toBe(SCENE_STRIDE);
	});

	it("skip those turned off, those outside Workspace, and any past the 31 Roblox draws", () => {
		const outside = part("Outside");
		const off = part("Off", 0, inst("Highlight", { Enabled: ["Bool", false] }));
		const elsewhere = part("Elsewhere", 0, inst("Highlight", { Adornee: ["Ref", outside] }));
		const many = Array.from({ length: 40 }, (_, i) => part(`P${i}`, 0, inst("Highlight", {})));
		const workspace = inst("Workspace", {}, [off, elsewhere, ...many]);
		inst("ReplicatedStorage", {}, [outside]);
		expect(workspaceHighlights(workspace)).toHaveLength(HIGHLIGHT_LIMIT);
		const scene = buildPlaceScene(inst("Workspace", {}, [off, elsewhere]), ids(off));
		expect(scene.highlights).toBeUndefined();
	});
});
