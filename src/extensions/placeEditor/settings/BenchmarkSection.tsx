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
					help="What each of seventeen test scenes costs the GPU and the CPU."
					detail="The scenes are made by Roswaal, the same on every device. With WebGPU the GPU is kept busy, two frames in flight, so it runs at full speed; WebGL2, which has no GPU timers, waits for each frame. The editor is hidden while it runs; the Roswaal logo or Esc stops it. Current settings takes about 2 minutes. Full sweep runs every quality level at Native, then every render scale at the level the view was at, about 45 minutes."
				>
					<button type="button" className="tb" onClick={() => startBenchmark("current")}>
						Current settings
					</button>
					<button type="button" className="tb" onClick={() => startBenchmark("sweep")}>
						Full sweep
					</button>
				</Row>
				<Row
					label="Smoothness"
					help="How smooth the same scenes look: the frames that reach the screen."
					detail="The same scenes and movements, paced by the display as in use, with nothing on the GPU timed. Each says the frames shown a second, the longest gap between two, and the refreshes that showed no new frame, against the display's own refresh. Where the benchmark says what a frame costs, this says how it looks. Its results compare only with another Smoothness run's. About 2 minutes."
				>
					<button type="button" className="tb" onClick={() => startBenchmark("smooth", 1)}>
						Run Smoothness
					</button>
				</Row>
				<Row
					label="A/B a switch"
					help="What one Rendering panel switch saves or costs."
					detail="Every station is measured with the switch on, off, on and off, back to back, so a warming device slows both alike, and each says what the switch saves or costs there. About 3 minutes."
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
					help="What a frame costs at each render scale, and what each pixel adds."
					detail="Every station is measured at each render scale this screen has, from 50% to Native, shaded and as the parts' depth alone. Each says what a frame costs however few pixels it has and what each pixel adds, by GPU stage. About 10 minutes."
				>
					<button type="button" className="tb" onClick={() => startBenchmark("pixels", 1)}>
						Run Pixel cost
					</button>
				</Row>
				<Row
					label="Warm pass"
					help="Every station again once the device has warmed up."
					detail="After the whole first pass, every station is measured again and shows how much slower it is warm. Scores and comparisons stay the first pass's. A run takes twice as long."
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
					help="Two downloaded results files, side by side, station by station."
					detail="The earlier file is taken as before. The change across all stations, as a warmer or cooler device makes it, is taken out of each, and what is within the noise is said. A Smoothness run compares only with another."
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
