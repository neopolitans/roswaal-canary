/**
 * A comparison of two benchmark runs as text, with a way to copy it, and
 * reading results files for one: shared by the benchmark's end and
 * Settings › Benchmark.
 */

import { useRef, useState } from "react";

import { compareRuns, comparisonReport, readResults } from "./compare.js";
import type { BenchmarkResult } from "./result.js";

/** Results files read: each run, or why one could not be. */
export async function readResultFiles(
	files: FileList | null,
): Promise<{ runs: BenchmarkResult[]; error?: string }> {
	const runs: BenchmarkResult[] = [];
	for (const file of Array.from(files ?? [])) {
		const read = readResults(await file.text());
		if ("error" in read) return { runs, error: `${file.name}: ${read.error}` };
		runs.push(read.result);
	}
	// Oldest first: the earlier run is "before".
	runs.sort((a, b) => a.date.localeCompare(b.date));
	return { runs };
}

export function CompareView({
	before,
	after,
}: {
	before: BenchmarkResult;
	after: BenchmarkResult;
}) {
	const text = compareRuns(before, after);
	const report = comparisonReport(text);
	const area = useRef<HTMLTextAreaElement>(null);
	const [copied, setCopied] = useState<"yes" | "select" | null>(null);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(report);
			setCopied("yes");
		} catch {
			area.current?.select();
			setCopied("select");
		}
	};
	return (
		<div className="benchmark-compare">
			<textarea
				ref={area}
				className="benchmark-text"
				readOnly
				value={report}
				aria-label="The comparison"
			/>
			<button type="button" className="tb" onClick={() => void copy()}>
				{copied === "yes"
					? "Copied"
					: copied === "select"
						? "Selected: copy it"
						: "Copy comparison"}
			</button>
		</div>
	);
}
