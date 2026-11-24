/** Settings › Scene view's actions, below its settings: downloads, the shaders, then the benchmark. */

import { BenchmarkSection } from "./BenchmarkSection.jsx";
import { DownloadedAssetsSection } from "./DownloadedAssets.jsx";
import { ShaderSection } from "./ShaderSection.jsx";

export function SceneViewSections() {
	return (
		<>
			<DownloadedAssetsSection />
			<ShaderSection />
			<BenchmarkSection />
		</>
	);
}
