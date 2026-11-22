/** The Place Editor: a place drawn in 3D, in a tab of its own. */

import type { ExtensionManifest } from "../manifest.js";
import type { RobloxStatus } from "./app/robloxApi.js";
import { setRobloxStatus } from "./settings/robloxAccount.js";
import { SCENE_VIEW } from "./settings.js";

export type PlaceEditorModule = typeof import("./app/placeEditorModule.js");

export const PLACE_EDITOR: ExtensionManifest<PlaceEditorModule> = {
	id: "placeEditor",
	// The Place Viewer until 1.0.0-canary.10.
	formerIds: ["placeViewer"],
	name: "Place Editor",
	version: "0.17.0",
	maturity: "preview",
	description: "Draws your place in 3D, in a tab of its own.",
	offNote:
		"Off, it is not loaded, which saves memory in the browser. Its settings are kept for when it is back on.",
	defaultOn: true,
	legacyOn: "placeViewer",
	adds: [
		{
			title: "A place tab",
			what: "Your place in 3D, beside your graphs, with the place toolbar.",
			kind: "Tab",
		},
		{
			title: "Rendering, Performance, Meshes",
			what: "Panels from the place toolbar.",
			kind: "Panels",
		},
		{ title: "Scene view, Roblox account", what: "Its pages in Settings.", kind: "Settings" },
	],
	pages: [
		{
			id: "scene",
			title: "Scene view",
			note: "How a place is drawn in 3D. Part of the Place Editor, kept in this browser.",
			groups: SCENE_VIEW,
			component: () =>
				import("./settings/BenchmarkSection.jsx").then((m) => ({ default: m.BenchmarkSection })),
		},
		{
			id: "roblox",
			title: "Roblox account",
			note: "Fetches the meshes and images a place uses. Part of the Place Editor; the sign-in stays on this computer.",
			component: () =>
				import("./settings/RobloxAccountPage.jsx").then((m) => ({ default: m.RobloxAccountPage })),
		},
	],
	releases: [
		{
			version: "0.17.0",
			roswaal: "1.1.0-canary.22",
			date: "2026-11-22",
			text: "Benchmark runs compared: with the last run, a file, or two files in Settings, the drift between them taken out and the noise said; each station twice on request.",
		},
		{
			version: "0.16.1",
			roswaal: "1.1.0-canary.21",
			date: "2026-11-22",
			text: "A Highlight's outline found in two short passes: the same outline, 18 reads a pixel on a Retina screen rather than 81.",
		},
		{
			version: "0.16.0",
			roswaal: "1.1.0-canary.20",
			date: "2026-11-22",
			text: "Roswaal Benchmark 1: thirteen generated test scenes timed on the GPU and the CPU, at the view's settings or every level, with the editor hidden; and the CPU's part of a frame in the profile.",
		},
		{
			version: "0.15.0",
			roswaal: "1.1.0-canary.19",
			date: "2026-11-22",
			text: "Highlight instances are drawn as Studio draws them, with WebGPU; a Rendering panel switch for them, and a Roswaal fix that keeps transparent parts' Highlights.",
		},
		{
			version: "0.14.0",
			roswaal: "1.1.0-canary.18",
			date: "2026-11-22",
			text: "The near sky maps follow a moving camera a share a frame, into a second set read once complete; Apple's GPUs take their thin parts out in render passes again.",
		},
		{
			version: "0.13.0",
			roswaal: "1.1.0-canary.17",
			date: "2026-11-22",
			text: "No quality level multisamples: SMAA from Level 13 to 21, MSAA in Settings. The near sky maps' thin parts are taken out in compute.",
		},
		{
			version: "0.12.0",
			roswaal: "1.1.0-canary.16",
			date: "2026-11-22",
			text: "The profile times MSAA 4× with the parts shaded and depth-tested in one draw, and splits a sky map redraw into the maps, the thin parts and the lighting cells.",
		},
		{
			version: "0.11.0",
			roswaal: "1.1.0-canary.15",
			date: "2026-11-22",
			text: "Lighter camera drags at the higher levels: the reflection cube a face a frame, the lighting cells with a 27th of the samples. GPU times that hold on Safari, beside every profile row, and the profile's Camera moving rows.",
		},
		{
			version: "0.10.0",
			roswaal: "1.1.0-canary.14",
			date: "2026-11-22",
			text: "The profile records each quality level's stages, by the GPU's own timers where it has them, and what the level drew at; its head names the level, antialiasing and camera it began from.",
		},
		{
			version: "0.9.1",
			roswaal: "1.1.0-canary.13",
			date: "2026-11-22",
			text: "Apple's GPUs draw the parts' depth first again: on an iPad the one-draw path measured slower. The profile still times both.",
		},
		{
			version: "0.9.0",
			roswaal: "1.1.0-canary.12",
			date: "2026-11-22",
			text: "Lighter work for Apple's GPUs: the parts shaded and depth-tested in one draw. Neon's glow at half size at Levels 6 to 12, half precision colour arithmetic where the device has it, and the profile's Depth path and Shader precision rows.",
		},
		{
			version: "0.8.0",
			roswaal: "1.1.0-canary.11",
			date: "2026-11-22",
			text: "Render scale is a share of the page's own pixels, and Native draws every pixel of a Retina screen. Quality Levels 10 to 17 draw at 100%, Native from 18. The profile times still-frame TAA alone.",
		},
		{
			version: "0.7.0",
			roswaal: "1.1.0-canary.10",
			date: "2026-11-22",
			text: "Antialiasing modes: Off, FXAA, SMAA, MSAA 2×, 4× and 8× where the renderer has them, and still-frame TAA, in Settings and the Rendering panel. Quality levels use FXAA and SMAA before MSAA, and the profile times every mode the device draws.",
		},
		{
			version: "0.6.0",
			roswaal: "1.1.0-canary.9",
			date: "2026-11-22",
			text: "Scene reflections: Metal, Glass and Reflectance show the place round the camera, from Quality Level 19. Metal is refitted to Studio's, reflections show a Sky's own images, and the shade under a Sky of six images is darker, as Studio's is.",
		},
		{
			version: "0.5.0",
			roswaal: "1.1.0-canary.8",
			date: "2026-11-22",
			text: "The sun's sharp shadows reach as far as Studio's at each quality level, fitted to Studio's captures, and parts far above still cast them. The profile measures one frame at each level, 1 to 21.",
		},
		{
			version: "0.4.0",
			roswaal: "1.1.0-canary.7",
			date: "2026-11-22",
			text: "Quality levels, Automatic and Level 1 to 21, as Studio's: each sets the switches, how far parts are drawn, the sun's shadows, the render scale and antialiasing. Automatic starts from the device and moves with frame times. The Rendering panel's performance presets are the levels now.",
		},
		{
			version: "0.3.0",
			roswaal: "1.1.0-canary.6",
			date: "2026-11-22",
			text: "Antialiasing can be turned off in Settings › Scene view, and the profile measures the frame with it off and on. The shader is smaller again: the sky's shadow written once, and materials' grain and patterns left out of a place that has none. The picture is unchanged.",
		},
		{
			version: "0.2.2",
			roswaal: "1.1.0-canary.5",
			date: "2026-11-21",
			text: "A smaller shader on WebGPU: the lights' code left out where the place has no lights, Neon's and CrackedLava's where it has none, and the sun's shadow read once rather than once a cascade. The picture is unchanged.",
		},
		{
			version: "0.2.1",
			roswaal: "1.1.0-canary.4",
			date: "2026-11-21",
			text: "Faster on a tablet's GPU: the parts are shaded by a shader built for the Rendering switches in use, and sky shadows read the lighting cells first. The picture is unchanged.",
		},
		{
			version: "0.2.0",
			roswaal: "1.1.0-canary.3",
			date: "2026-11-21",
			text: "Performance profiles the frame stage by stage, step by step, at fewer pixels, with every feature off, and with each light and shadow switch off alone, and copies the report. Settings › Scene view has a render scale, 75% on a touch screen.",
		},
		{
			version: "0.1.0",
			roswaal: "1.0.0-canary.2",
			date: "2026-11-18",
			text: "The Place Editor is an extension, with its own version. Everything before it is in Roswaal's notes up to 0.265.0.",
		},
	],
	events: {
		roblox: (data) => setRobloxStatus(data as Omit<RobloxStatus, "available">),
	},
	load: () => import("./app/placeEditorModule.js"),
};
