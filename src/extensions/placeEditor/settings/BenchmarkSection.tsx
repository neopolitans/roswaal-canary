/**
 * Settings › Benchmark, a page of its own since 1.1.0-canary.119: Roswaal
 * Benchmark 5, run at the view's settings, every quality level, a switch on
 * and off or each render scale, and two results compared. Actions rather
 * than settings, so drawn here rather than declared.
 */

import { useState } from "react";

import { useExtension, writeExtension } from "../../../app/extensionSettings.js";
import { Group, Row } from "../../../app/settingsParts.jsx";
import { RELEASES } from "../../../core/docs/releases.js";
import { CompareView, readResultFiles } from "../app/benchmark/CompareView.jsx";
import type { BenchmarkResult } from "../app/benchmark/result.js";
import { saveFile } from "../app/saveFile.js";
import { FEATURES } from "../app/viewport/renderFeatures.js";
import { setTwiceWanted, startBenchmark, twiceWanted } from "../benchmarkEvent.js";
import { PLACE_EDITOR } from "../manifest.js";
import { applyProfile, profileFileName, profileOf } from "../settingsProfile.js";

export function BenchmarkSection() {
	const [twice, setTwice] = useState(twiceWanted);
	const [abKey, setAbKey] = useState("occlusionCulling");
	const [pair, setPair] = useState<[BenchmarkResult, BenchmarkResult] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const ext = useExtension(PLACE_EDITOR);
	const [profileSaid, setProfileSaid] = useState<string | null>(null);
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
			<Group title="Settings profile">
				<Row
					label="Import a profile"
					help="Graphics set from a profile file, as a test asks."
					detail="A profile file, such as one sent for a test, sets the Graphics settings it names; the rest stay as they are. A setting this version does not have, or a value it does not offer, is left out and said."
				>
					<label className="tb benchmark-file">
						Choose a file…
						<input
							type="file"
							accept=".json,application/json"
							onChange={async (e) => {
								const input = e.currentTarget;
								const file = input.files?.[0];
								input.value = "";
								if (!file) return;
								const read = applyProfile(PLACE_EDITOR, ext, await file.text());
								if (!read.ok) {
									setProfileSaid(read.error);
									return;
								}
								writeExtension(PLACE_EDITOR, read.state);
								const named = read.name ? `“${read.name}”` : "the profile";
								const count = `${read.applied.length} setting${read.applied.length === 1 ? "" : "s"}`;
								setProfileSaid(
									`Imported ${named}: ${count}.${read.left.length > 0 ? ` Left out, as this version does not offer them: ${read.left.join(", ")}.` : ""}`,
								);
							}}
						/>
					</label>
				</Row>
				<Row label="Export a profile" help="These Graphics settings, as a file to keep or send.">
					<button
						type="button"
						className="tb"
						onClick={() => {
							const profile = profileOf(
								PLACE_EDITOR,
								ext,
								RELEASES[0]?.version ?? "",
								new Date().toISOString(),
							);
							void saveFile(profileFileName(profile), `${JSON.stringify(profile, null, "\t")}\n`);
						}}
					>
						Export
					</button>
				</Row>
				{profileSaid && <p className="settings-note">{profileSaid}</p>}
			</Group>
		</>
	);
}
