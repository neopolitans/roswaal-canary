/**
 * The editor asks which assets are kept before downloading any, hands the
 * loader those at once, and downloads only the rest, a batch at a time.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const heldAssets = vi.fn();
const fetchAssets = vi.fn();
vi.mock("../src/extensions/placeEditor/app/robloxApi.js", () => ({
	robloxApi: {
		heldAssets: (ids: string[]) => heldAssets(ids),
		fetchAssets: (ids: string[]) => fetchAssets(ids),
	},
}));

const { ensure } = await import("../src/extensions/placeEditor/app/viewport/images.js");

const ready = (ids: string[]) => ({
	assets: Object.fromEntries(ids.map((id) => [id, { state: "ready", assetTypeId: 4 }])),
});

beforeEach(() => {
	heldAssets.mockReset();
	fetchAssets.mockReset();
});

describe("kept assets first", () => {
	it("hands over kept ones before downloading, and downloads only the missing", async () => {
		heldAssets.mockResolvedValue({
			assets: {
				"1": { state: "ready", assetTypeId: 4 },
				"2": { state: "skipped", reason: "roblox-made" },
			},
		});
		fetchAssets.mockImplementation(async (ids: string[]) => ready(ids));
		const stages: [string[], string][] = [];
		const got = await ensure(["1", "2", "3", "4"], async (ids, from) => {
			stages.push([ids, from]);
		});
		expect(stages).toEqual([
			[["1"], "held"],
			[["3", "4"], "downloaded"],
		]);
		expect(fetchAssets).toHaveBeenCalledWith(["3", "4"]);
		expect([...got].sort()).toEqual(["1", "3", "4"]);
	});

	it("downloads in small batches, each handed over as it lands", async () => {
		heldAssets.mockResolvedValue({ assets: {} });
		fetchAssets.mockImplementation(async (ids: string[]) => ready(ids));
		const ids = Array.from({ length: 40 }, (_, i) => String(100 + i));
		const sizes: number[] = [];
		await ensure(ids, async (got) => {
			sizes.push(got.length);
		});
		expect(sizes).toEqual([16, 16, 8]);
	});

	it("asks for everything from a host that cannot say what it keeps", async () => {
		heldAssets.mockRejectedValue(new Error("Not found"));
		fetchAssets.mockImplementation(async (ids: string[]) => ready(ids));
		expect([...(await ensure(["7", "8"]))]).toEqual(["7", "8"]);
		expect(fetchAssets).toHaveBeenCalledWith(["7", "8"]);
	});
});
