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
import {
	type BenchmarkResult,
	benchmarkFileName,
	benchmarkJson,
	benchmarkReport,
	runScore,
} from "./benchmark/result.js";
import { BENCHMARK_SEED, BENCHMARK_VERSION, STATIONS } from "./benchmark/stations.js";
import {
	type BenchmarkProgress,
	ViewportController,
	type ViewportOptions,
} from "./viewport/controller.js";
import { msText } from "./viewport/profile.js";

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

export function Benchmark({ kind, options }: { kind: BenchmarkKind; options: ViewportOptions }) {
	const holder = useRef<HTMLDivElement>(null);
	const text = useRef<HTMLTextAreaElement>(null);
	// As they were when the run began: Settings changed meanwhile do not restart it.
	const [settings] = useState(options);
	const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
	const [result, setResult] = useState<BenchmarkResult | null>(null);
	const [failed, setFailed] = useState<string | null>(null);
	const [copied, setCopied] = useState<"yes" | "select" | null>(null);

	useEffect(() => {
		const el = holder.current;
		if (!el) return;
		let stopped = false;
		const controller = new ViewportController(() => {});
		controller.setOptions({ ...settings, editable: false });
		const unmount = controller.mount({ holder: el });
		controller.setPlace(STATIONS[0].variants[0].place());
		let shown = 0;
		void (async () => {
			if (!(await controller.whenReady())) {
				if (!stopped) setFailed("The view did not start.");
				return;
			}
			try {
				const done = await controller.runBenchmark({
					stations: STATIONS,
					kind,
					benchmark: BENCHMARK_VERSION,
					seed: BENCHMARK_SEED,
					cancelled: () => stopped,
					onProgress: (p) => {
						const now = performance.now();
						if (p.phase !== "Building" && now - shown < 250) return;
						shown = now;
						setProgress(p);
					},
				});
				if (!stopped && done) setResult(done);
			} catch (err) {
				if (!stopped) setFailed(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			stopped = true;
			unmount();
		};
	}, [kind, settings]);

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
						<strong>Roswaal Benchmark {BENCHMARK_VERSION}</strong>
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
					<span className="benchmark-score">
						{score(total.gpu)} <small>by the GPU's time</small> · {score(total.waited)}{" "}
						<small>by the waited frame</small>
					</span>
					<div className="benchmark-actions">
						<button type="button" className="tb primary" onClick={() => void copy()}>
							{copied === "yes" ? "Copied" : "Copy report"}
						</button>
						<button type="button" className="tb" onClick={() => void saveResults(result)}>
							Download results
						</button>
					</div>
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
