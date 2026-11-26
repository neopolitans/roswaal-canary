/**
 * Settings › Benchmark, a page of its own since 1.1.0-canary.119: Roswaal
 * Benchmark 5, run at the view's settings, every quality level, a switch on
 * and off or each render scale, and two results compared. Actions rather
 * than settings, so drawn here rather than declared.
 */

import { useState } from "react";

import { Group, Row } from "../../../app/settingsParts.jsx";
import { CompareView, readResultFiles } from "../app/benchmark/CompareView.jsx";
import type { BenchmarkResult } from "../app/benchmark/result.js";
import { FEATURES } from "../app/viewport/renderFeatures.js";
import { setTwiceWanted, startBenchmark, twiceWanted } from "../benchmarkEvent.js";

export function BenchmarkSection() {
	const [twice, setTwice] = useState(twiceWanted);
	const [abKey, setAbKey] = useState("occlusionCulling");
	const [pair, setPair] = useState<[BenchmarkResult, BenchmarkResult] | null>(null);
	const [error, setError] = useState<string | null>(null);
	return (
		<>
			<Group title="Run">
				<Row
					label="Roswaal Benchmark 5"
					help="Draws seventeen test scenes made by Roswaal, the same on every device, and times each on the GPU and the CPU, with the GPU kept busy so it runs at full speed. The editor is hidden while it runs; the Roswaal logo or Esc stops it. Current settings takes about 2 minutes; Full sweep runs every quality level at Native, then every render scale at the level the view was at, about 45 minutes."
				>
					<button type="button" className="tb" onClick={() => startBenchmark("current")}>
						Current settings
					</button>
					<button type="button" className="tb" onClick={() => startBenchmark("sweep")}>
						Full sweep
					</button>
				</Row>
				<Row
					label="A/B a switch"
					help="Measures every station with one Rendering panel switch on, off, on and off, back to back, so a warming device slows both alike, and says what the switch saves or costs at each. About 3 minutes."
				>
					<select
						className="tb"
						value={abKey}
						aria-label="The switch to measure"
						onChange={(e) => setAbKey(e.target.value)}
					>
						{FEATURES.map((f) => (
							<option key={f.key} value={f.key}>
								{f.label}
							</option>
						))}
					</select>
					<button type="button" className="tb" onClick={() => startBenchmark("ab", 1, abKey)}>
						Run A/B
					</button>
				</Row>
				<Row
					label="Pixel cost"
					help="Measures every station at each render scale this screen has, from 50% to Native, shaded and as the parts' depth alone, and says what a frame costs however few pixels it has and what each pixel adds, by GPU stage. About 10 minutes."
				>
					<button type="button" className="tb" onClick={() => startBenchmark("pixels", 1)}>
						Run Pixel cost
					</button>
				</Row>
				<Row
					label="Warm pass"
					help="Measures every station again after the whole first pass, when the device has warmed up, and shows how much slower each is warm. Scores and comparisons stay the first pass's. Twice as long."
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
			</Group>
			<Group title="Results">
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
		</>
	);
}
