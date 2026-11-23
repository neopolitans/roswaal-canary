/** Settings › Scene view's actions, below its settings: the shaders, then the benchmark. */

import { BenchmarkSection } from "./BenchmarkSection.jsx";
import { ShaderSection } from "./ShaderSection.jsx";

export function SceneViewSections() {
	return (
		<>
			<ShaderSection />
			<BenchmarkSection />
		</>
	);
}
