/**
 * Settings › Scene view's Shaders: whether an update changed them, and
 * building them for every quality level ahead, so changing level later waits
 * for none. See shaderEvent.ts.
 */

import { useEffect, useState } from "react";

import { Group, Row } from "../../../app/settingsParts.jsx";
import {
	askBuildShaders,
	autoBuildWanted,
	readShaderRecord,
	SHADER_STATUS_EVENT,
	type ShaderProgress,
	setAutoBuild,
} from "../shaderEvent.js";

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} s`;

/** What the record says, in a line. */
function recordText(): string {
	const r = readShaderRecord();
	if (!r) return "Not started in this browser yet.";
	const changed = r.previous ? "changed by the last update" : "first seen in this browser";
	const built =
		r.built === r.current
			? `built for every quality level${r.builtMs ? ` in ${seconds(r.builtMs)}` : ""}`
			: "not yet built for every quality level";
	return `${r.current}, ${changed}; ${built}.`;
}

function progressText(p: ShaderProgress): string {
	switch (p.state) {
		case "building":
			return `Building: ${p.done ?? 0} of ${p.of ?? 0}`;
		case "built":
			return `Built ${p.of ?? 0} pipelines in ${seconds(p.ms ?? 0)}.`;
		case "failed":
			return `The build stopped: ${p.message ?? "no reason given"}.`;
		case "no-view":
			return "Open a place to build its shaders.";
		case "webgl2":
			return "WebGL2 builds its shaders as it draws: there is nothing to build ahead.";
	}
}

export function ShaderSection() {
	const [auto, setAuto] = useState(autoBuildWanted);
	const [progress, setProgress] = useState<ShaderProgress | null>(null);
	const [record, setRecord] = useState(recordText);
	useEffect(() => {
		const heard = (e: Event) => {
			const p = (e as CustomEvent<ShaderProgress>).detail;
			setProgress(p);
			if (p.state === "built") setRecord(recordText());
		};
		window.addEventListener(SHADER_STATUS_EVENT, heard);
		return () => window.removeEventListener(SHADER_STATUS_EVENT, heard);
	}, []);
	const building = progress?.state === "building";
	return (
		<Group title="Shaders">
			<Row
				label="Shaders"
				help="The browser keeps the shaders it builds, so only the first start after an update that changes them is slower. Build now builds every quality level's for the open place, so changing level waits for none. WebGPU only."
			>
				<span className="settings-note">{progress ? progressText(progress) : record}</span>
				<button type="button" className="tb" disabled={building} onClick={() => askBuildShaders()}>
					{building ? "Building…" : "Build now"}
				</button>
			</Row>
			<Row
				label="Build after an update"
				help="After an update that changed them, builds every quality level's shaders in the background a few seconds after a place opens. Off, each is built when first needed."
			>
				<button
					type="button"
					className={auto ? "tb primary" : "tb"}
					aria-pressed={auto}
					onClick={() => {
						setAutoBuild(!auto);
						setAuto(!auto);
					}}
				>
					{auto ? "On" : "Off"}
				</button>
			</Row>
		</Group>
	);
}
