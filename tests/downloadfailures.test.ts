/**
 * Why downloads failed, kept for the asset card: each asset's reason without
 * its id, grouped commonest first, and a batch the host refuses failing only
 * its own ids.
 */

import { describe, expect, it, vi } from "vitest";

const fetchAssets = vi.fn();
vi.mock("../src/extensions/placeEditor/app/robloxApi.js", () => ({
	robloxApi: { fetchAssets: (ids: string[]) => fetchAssets(ids) },
}));

const { downloadFailures, ensure, generalReason } = await import(
	"../src/extensions/placeEditor/app/viewport/images.js"
);
const { assetWords } = await import("../src/extensions/placeEditor/app/viewport/assetProgress.js");

describe("why downloads failed", () => {
	it("drops the asset's id from a reason, and nothing else", () => {
		expect(generalReason("Roblox would not hand over asset 431039918 (429).")).toBe(
			"Roblox would not hand over an asset (429).",
		);
		expect(generalReason("Asset 12's download address is not Roblox's (https://x.com).")).toBe(
			"an asset's download address is not Roblox's (https://x.com).",
		);
		expect(generalReason("Failed to fetch")).toBe("Failed to fetch");
	});

	it("groups reasons commonest first, and a refused batch fails only its own ids", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const ids = Array.from({ length: 70 }, (_, i) => String(1000 + i));
		fetchAssets.mockImplementationOnce(async (batch: string[]) => ({
			assets: Object.fromEntries(
				batch.map((id, i) => [
					id,
					i < 2
						? { state: "ready" }
						: { state: "failed", reason: `Roblox would not hand over asset ${id} (429).` },
				]),
			),
		}));
		fetchAssets.mockImplementationOnce(async () => {
			throw new Error("Sign in with Roblox first.");
		});
		const ready = await ensure(ids);
		expect([...ready]).toEqual(["1000", "1001"]);
		expect(downloadFailures()).toEqual([
			{ reason: "Roblox would not hand over an asset (429).", count: 62, example: "1002" },
			{ reason: "Sign in with Roblox first.", count: 6, example: "1064" },
		]);
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("puts the commonest reason on the asset card", () => {
		const p = { needed: 122, arrived: 5, uploaded: 5, failed: 117, signIn: 0, unavailable: 0 };
		expect(assetWords(p, { reason: "Failed to fetch", count: 110, others: 2 }).notes).toEqual([
			"117 failed",
			"110: Failed to fetch (and 2 other reasons)",
		]);
		expect(assetWords(p).notes).toEqual(["117 failed"]);
	});
});
