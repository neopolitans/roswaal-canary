/**
 * Settings › Scene view's Benchmark: Roswaal Benchmark 1, run at the view's
 * settings or at every quality level. Actions rather than settings, so drawn
 * here rather than declared.
 */

import { Group, Row } from "../../../app/settingsParts.jsx";
import { startBenchmark } from "../benchmarkEvent.js";

export function BenchmarkSection() {
	return (
		<Group title="Benchmark">
			<Row
				label="Roswaal Benchmark 1"
				help="Draws thirteen test scenes made by Roswaal, the same on every device, and times each on the GPU and the CPU. The editor is hidden while it runs; the Roswaal logo or Esc stops it. Current settings takes about 2 minutes; Full sweep runs every quality level, about 40 minutes."
			>
				<button type="button" className="tb" onClick={() => startBenchmark("current")}>
					Current settings
				</button>
				<button type="button" className="tb" onClick={() => startBenchmark("sweep")}>
					Full sweep
				</button>
			</Row>
		</Group>
	);
}
