/**
 * Roswaal Benchmark, running: a view of its own over the whole window, the
 * station and level it is on in one quiet line, and at the end the score,
 * Copy report and Download results. App draws the Roswaal logo beside it,
 * which stops the run and brings the editor back.
 *
 * The line updates a few times a second rather than every frame, and sits
 * over the canvas, never in the frame being measured.
 */

import { useEffect, useRef, useState } from "react";

import type { BenchmarkKind } from "../benchmarkEvent.js";
import { CompareView, readResultFiles } from "./benchmark/CompareView.jsx";
import { keepRun, runBefore } from "./benchmark/history.js";
import {
	type BenchmarkResult,
	benchmarkFileName,
	benchmarkJson,
	benchmarkReport,
	runScore,
	shownScore,
} from "./benchmark/result.js";
import {
	BENCHMARK_MEASURE,
	BENCHMARK_SEED,
	BENCHMARK_VERSION,
	STATIONS,
} from "./benchmark/stations.js";
import {
	type BenchmarkProgress,
	ViewportController,
	type ViewportOptions,
} from "./viewport/controller.js";
import { msText } from "./viewport/profile.js";
import { isFeatureKey, type RenderFeatures } from "./viewport/renderFeatures.js";

const score = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString("en") : "–");

/** The run's JSON to the downloads; where a download is not offered (iPad, iPhone), the share sheet. */
async function saveResults(result: BenchmarkResult): Promise<void> {
	const name = benchmarkFileName(result);
	const file = new File([benchmarkJson(result)], name, { type: "application/json" });
	const touch = typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
	if (touch && navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title: name });
			return;
		} catch {
			// Dismissed, or refused: the download below.
		}
	}
	const url = URL.createObjectURL(file);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function Benchmark({
	kind,
	passes = 1,
	ab,
	features,
	options,
}: {
	kind: BenchmarkKind;
	passes?: 1 | 2;
	/** For an A/B run: the switch measured on and off. */
	ab?: string;
	/** The editor's render switches, which the run draws with; every one on where absent. */
	features?: RenderFeatures;
	options: ViewportOptions;
}) {
	const holder = useRef<HTMLDivElement>(null);
	const text = useRef<HTMLTextAreaElement>(null);
	// As they were when the run began: Settings changed meanwhile do not restart it.
	const [settings] = useState(options);
	const [switches] = useState(features);
	const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
	const [result, setResult] = useState<BenchmarkResult | null>(null);
	const [failed, setFailed] = useState<string | null>(null);
	const [copied, setCopied] = useState<"yes" | "select" | null>(null);
	// What this run is compared with: the last kept run, or a file.
	const [against, setAgainst] = useState<BenchmarkResult | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);

	useEffect(() => {
		const el = holder.current;
		if (!el) return;
		let stopped = false;
		const controller = new ViewportController(() => {});
		controller.setOptions({ ...settings, editable: false, buildShaders: false });
		const unmount = controller.mount({ holder: el });
		void Promise.resolve(STATIONS[0].variants[0].place()).then((place) => {
			if (!stopped) controller.setPlace(place);
		});
		let shown = 0;
		let lastPhase = "";
		void (async () => {
			if (!(await controller.whenReady())) {
				if (!stopped)
					setFailed(
						controller.getState().error ??
							"The view did not start in time. Run it again: a second try starts faster, as the browser keeps the shaders it built.",
					);
				return;
			}
			try {
				const done = await controller.runBenchmark({
					stations: STATIONS,
					kind,
					passes,
					...(switches ? { features: switches } : {}),
					...(ab && isFeatureKey(ab) ? { ab } : {}),
					measure: BENCHMARK_MEASURE,
					benchmark: BENCHMARK_VERSION,
					seed: BENCHMARK_SEED,
					cancelled: () => stopped,
					onProgress: (p) => {
						const now = performance.now();
						// A new phase always shows, so a time never stays beside another phase's name.
						if (p.phase === lastPhase && now - shown < 250) return;
						shown = now;
						lastPhase = p.phase;
						setProgress(p);
					},
				});
				if (!stopped && done) {
					setResult(done);
					keepRun(done);
				}
			} catch (err) {
				if (!stopped) setFailed(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			stopped = true;
			unmount();
		};
	}, [kind, passes, ab, settings, switches]);

	const report = result ? benchmarkReport(result) : "";
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(report);
			setCopied("yes");
		} catch {
			text.current?.select();
			setCopied("select");
		}
	};
	const total = result ? runScore(result) : null;
	const previous = result ? runBefore(result) : null;

	return (
		<>
			<div className="benchmark-view" ref={holder} />
			{!result && !failed && (
				<div className="benchmark-status" role="status">
					{progress ? (
						<>
							<strong>{progress.station}</strong>
							<span>{progress.level}</span>
							<span>{progress.phase}</span>
							{Number.isFinite(progress.frameMs) && <span>{msText(progress.frameMs)}</span>}
							<span>
								{progress.done + 1} of {progress.of}
							</span>
						</>
					) : (
						<>
							<strong>Roswaal Benchmark {BENCHMARK_VERSION}</strong>
							<span>
								Starting the view: after an update, building its shaders can take a minute
							</span>
						</>
					)}
				</div>
			)}
			{failed && (
				<div className="benchmark-end" role="alert">
					<strong>The benchmark stopped</strong>
					<span>{failed}</span>
				</div>
			)}
			{result && total && (
				<div className="benchmark-end">
					<strong>Roswaal Benchmark {BENCHMARK_VERSION}</strong>
					{result.measure === "shown" ? (
						<span className="benchmark-score">
							{Number.isFinite(shownScore(result)) ? shownScore(result).toFixed(1) : "–"}{" "}
							<small>frames a second shown</small>
						</span>
					) : (
						<span className="benchmark-score">
							{score(total.gpu)} <small>by the GPU's time</small> · {score(total.waited)}{" "}
							<small>by the waited frame</small>
						</span>
					)}
					{result.fellBack && (
						<span>
							Drawn by WebGL2: WebGPU did not start ({result.fellBack}). These times do not compare
							with WebGPU's.
						</span>
					)}
					<div className="benchmark-actions">
						<button type="button" className="tb primary" onClick={() => void copy()}>
							{copied === "yes" ? "Copied" : "Copy report"}
						</button>
						<button type="button" className="tb" onClick={() => void saveResults(result)}>
							Download results
						</button>
					</div>
					<div className="benchmark-actions">
						{previous && (
							<button type="button" className="tb" onClick={() => setAgainst(previous)}>
								Compare with last run
							</button>
						)}
						<label className="tb benchmark-file">
							Compare with a file…
							<input
								type="file"
								accept=".json,application/json"
								onChange={async (e) => {
									const read = await readResultFiles(e.currentTarget.files);
									setFileError(read.error ?? null);
									if (read.runs[0]) setAgainst(read.runs[0]);
								}}
							/>
						</label>
					</div>
					{fileError && <span className="benchmark-error">{fileError}</span>}
					{against && <CompareView before={against} after={result} />}
					{copied === "select" && (
						<textarea
							ref={text}
							className="benchmark-text"
							readOnly
							value={report}
							aria-label="The report, to copy"
						/>
					)}
				</div>
			)}
		</>
	);
}
