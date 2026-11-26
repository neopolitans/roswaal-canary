/**
 * A settings profile: the Place Editor's Graphics settings as a file, to keep
 * or to send, and to import on another device, as a test asks for exact
 * settings (1.1.0-canary.131). Imported through the same checks a stored
 * value goes through: a setting this version does not have, or a value it
 * does not offer, is left out and said, never kept.
 */

import {
	declaredSettings,
	type ExtensionState,
	type SettingValue,
	validValue,
} from "../../app/extensionSettings.js";
import type { ExtensionManifest, SettingDecl } from "../manifest.js";

/** What a profile file says it is. */
export const PROFILE_KIND = "roswaal-settings-profile";

export interface SettingsProfile {
	kind: typeof PROFILE_KIND;
	/** The extension the settings are for: `placeEditor`. */
	extension: string;
	/** What the profile is for, as whoever made it named it. */
	name?: string;
	/** The Roswaal release it was made in. */
	release?: string;
	date?: string;
	values: Record<string, SettingValue>;
}

/** Every setting the extension declares, as it is now. */
export function profileOf(
	manifest: ExtensionManifest,
	state: ExtensionState,
	release: string,
	date: string,
	name?: string,
): SettingsProfile {
	const values: Record<string, SettingValue> = {};
	for (const decl of declaredSettings(manifest))
		values[decl.key] = state.values[decl.key] ?? decl.default;
	return {
		kind: PROFILE_KIND,
		extension: manifest.id,
		...(name ? { name } : {}),
		release,
		date,
		values,
	};
}

/** The profile as a file's name: roswaal-settings-ipad-grid-2026-11-26T09-30.json. */
export function profileFileName(profile: SettingsProfile): string {
	const name = (profile.name ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const date = (profile.date ?? "").slice(0, 16).replace(/:/g, "-");
	return `roswaal-settings-${[name, date].filter(Boolean).join("-") || "profile"}.json`;
}

export type ProfileRead =
	| {
			ok: true;
			state: ExtensionState;
			/** The settings set from the file. */
			applied: string[];
			/** The file's own, left out: a setting not here, or a value not offered. */
			left: string[];
			name?: string;
			release?: string;
	  }
	| { ok: false; error: string };

/** Whether a setting offers the value, rather than validValue's falling back to its default. */
function offers(decl: SettingDecl, value: unknown): boolean {
	return decl.type === "boolean"
		? typeof value === "boolean"
		: typeof value === "string" && decl.choices.some((c) => c.value === value);
}

/**
 * The extension's state with a profile file's settings in it. Settings the
 * file does not name stay as they are.
 */
export function applyProfile(
	manifest: ExtensionManifest,
	current: ExtensionState,
	text: string,
): ProfileRead {
	let file: unknown;
	try {
		file = JSON.parse(text);
	} catch {
		return { ok: false, error: "This file is not a settings profile: it is not JSON." };
	}
	if (!file || typeof file !== "object" || (file as { kind?: unknown }).kind !== PROFILE_KIND)
		return { ok: false, error: "This file is not a Roswaal settings profile." };
	const profile = file as Partial<SettingsProfile>;
	const ids = [manifest.id, ...(manifest.formerIds ?? [])];
	if (typeof profile.extension !== "string" || !ids.includes(profile.extension))
		return {
			ok: false,
			error: `This profile is for ${String(profile.extension)}, not ${manifest.name}.`,
		};
	const values = profile.values;
	if (!values || typeof values !== "object" || Array.isArray(values))
		return { ok: false, error: "This profile holds no settings." };
	const decls = new Map(declaredSettings(manifest).map((d) => [d.key, d]));
	const next: Record<string, SettingValue> = { ...current.values };
	const applied: string[] = [];
	const left: string[] = [];
	for (const [key, value] of Object.entries(values)) {
		const decl = decls.get(key);
		if (!decl || !offers(decl, value)) {
			left.push(key);
			continue;
		}
		next[key] = validValue(decl, value);
		applied.push(key);
	}
	return {
		ok: true,
		state: { ...current, values: next },
		applied,
		left,
		...(typeof profile.name === "string" && profile.name ? { name: profile.name } : {}),
		...(typeof profile.release === "string" ? { release: profile.release } : {}),
	};
}
