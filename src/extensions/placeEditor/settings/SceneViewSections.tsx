/** Settings › Graphics' actions, below its settings: downloads, then the shaders. The benchmark has a page of its own. */

import { DownloadedAssetsSection } from "./DownloadedAssets.jsx";
import { ShaderSection } from "./ShaderSection.jsx";

export function SceneViewSections() {
	return (
		<>
			<DownloadedAssetsSection />
			<ShaderSection />
		</>
	);
}
