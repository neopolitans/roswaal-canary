/**
 * The view's shaders, as Settings sees them: whether an update changed them,
 * whether they have been built for every quality level, and the ask to build
 * them. Small, so Settings carries it without the Place Editor's bundle.
 *
 * WebGPU gives a page no way to keep the pipelines it compiled: each visit
 * asks the browser for them again, and the browser answers from its own
 * cache where the shader's text is unchanged. So only an update that
 * changes the text costs a full build, and only the first time.
 */

/** What this browser last saw of the shaders: see noteShaders. */
export interface ShaderRecord {
	/** The shaders' fingerprint at the last start (shaderFingerprint, webgpu.ts). */
	current: string;
	/** The one before, where an update changed them. */
	previous: string | null;
	/** The fingerprint they were last built for every quality level at, if they were. */
	built: string | null;
	/** How long that build took, and how many pipelines it made. */
	builtMs?: number;
	pipelines?: number;
}

/** A build's progress, as the view reports it. */
export interface ShaderProgress {
	state: "building" | "built" | "failed" | "no-view" | "webgl2";
	done?: number;
	of?: number;
	ms?: number;
	message?: string;
}

export const SHADER_EVENT = "roswaal:shaders";
export const SHADER_STATUS_EVENT = "roswaal:shader-status";

const RECORD = "roswaal.shaders";
const AUTO = "roswaal.shaders.auto";

/** FNV-1a, 32 bits, as eight hex digits: a fingerprint, not a secret. */
export function shaderHash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

export function readShaderRecord(): ShaderRecord | null {
	try {
		const raw = localStorage.getItem(RECORD);
		const r = raw ? (JSON.parse(raw) as ShaderRecord) : null;
		return r && typeof r.current === "string" ? r : null;
	} catch {
		return null;
	}
}

function keep(record: ShaderRecord): void {
	try {
		localStorage.setItem(RECORD, JSON.stringify(record));
	} catch {
		// Not kept: the next start says so again.
	}
}

/**
 * The shaders as this start finds them, against what the browser last saw.
 * `changed`: new to this browser, so its cache has none of them.
 */
export function noteShaders(fingerprint: string): { record: ShaderRecord; changed: boolean } {
	const was = readShaderRecord();
	if (was && was.current === fingerprint) return { record: was, changed: false };
	const record: ShaderRecord = {
		current: fingerprint,
		previous: was?.current ?? null,
		built: null,
	};
	keep(record);
	return { record, changed: true };
}

/** Whether this start's shaders are new to the browser, before noteShaders records them. */
export function shadersNew(fingerprint: string): boolean {
	return readShaderRecord()?.current !== fingerprint;
}

export function markShadersBuilt(fingerprint: string, ms: number, pipelines: number): void {
	const was = readShaderRecord();
	keep({
		current: fingerprint,
		previous: was?.current === fingerprint ? was.previous : (was?.current ?? null),
		built: fingerprint,
		builtMs: Math.round(ms),
		pipelines,
	});
}

/** Settings' "Build after an update": on unless turned off. */
export function autoBuildWanted(): boolean {
	try {
		return localStorage.getItem(AUTO) !== "0";
	} catch {
		return true;
	}
}

export function setAutoBuild(on: boolean): void {
	try {
		localStorage.setItem(AUTO, on ? "1" : "0");
	} catch {
		// Not kept: this visit only.
	}
}

export function askBuildShaders(): void {
	window.dispatchEvent(new CustomEvent(SHADER_EVENT, { detail: { action: "build" } }));
}

export function reportShaders(progress: ShaderProgress): void {
	window.dispatchEvent(new CustomEvent<ShaderProgress>(SHADER_STATUS_EVENT, { detail: progress }));
}
