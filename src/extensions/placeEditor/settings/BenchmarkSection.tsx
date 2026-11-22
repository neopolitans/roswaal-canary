/**
 * Settings › Scene view's Benchmark: Roswaal Benchmark 1, run at the view's
 * settings or at every quality level. Actions rather than settings, so drawn
 * here rather than declared.
 */

import { useState } from "react";

import { Group, Row } from "../../../app/settingsParts.jsx";
import { CompareView, readResultFiles } from "../app/benchmark/CompareView.jsx";
import type { BenchmarkResult } from "../app/benchmark/result.js";
import { setTwiceWanted, startBenchmark, twiceWanted } from "../benchmarkEvent.js";

export function BenchmarkSection() {
	const [twice, setTwice] = useState(twiceWanted);
	const [pair, setPair] = useState<[BenchmarkResult, BenchmarkResult] | null>(null);
	const [error, setError] = useState<string | null>(null);
	return (
		<Group title="Benchmark">
			<Row
				label="Roswaal Benchmark 2"
				help="Draws thirteen test scenes made by Roswaal, the same on every device, and times each on the GPU and the CPU, with the GPU kept busy so it runs at full speed. The editor is hidden while it runs; the Roswaal logo or Esc stops it. Current settings takes about 2 minutes; Full sweep runs every quality level, about 40 minutes."
			>
				<button type="button" className="tb" onClick={() => startBenchmark("current")}>
					Current settings
				</button>
				<button type="button" className="tb" onClick={() => startBenchmark("sweep")}>
					Full sweep
				</button>
			</Row>
			<Row
				label="Each station twice"
				help="Measures every station again in a second pass, so a comparison can tell a station's own noise from a change. Steadier; twice as long."
			>
				<button
					type="button"
					className={twice ? "tb primary" : "tb"}
					aria-pressed={twice}
					onClick={() => {
						setTwiceWanted(!twice);
						setTwice(!twice);
					}}
				>
					{twice ? "On" : "Off"}
				</button>
			</Row>
			<Row
				label="Compare two results"
				help="Two downloaded results files, the earlier as before. The change across all stations, as a warmer or cooler device makes it, is taken out of each, and what is within the noise is said."
			>
				<label className="tb benchmark-file">
					Choose two files…
					<input
						type="file"
						multiple
						accept=".json,application/json"
						onChange={async (e) => {
							const read = await readResultFiles(e.currentTarget.files);
							if (read.error) {
								setError(read.error);
								return;
							}
							if (read.runs.length !== 2) {
								setError("Choose two results files.");
								return;
							}
							setError(null);
							setPair([read.runs[0], read.runs[1]]);
						}}
					/>
				</label>
			</Row>
			{error && <p className="settings-note">{error}</p>}
			{pair && <CompareView before={pair[0]} after={pair[1]} />}
		</Group>
	);
}
