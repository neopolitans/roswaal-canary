/**
 * Release notes for 1.1: 1.1.0, its patches, and the canary builds leading to
 * each, newest first.
 *
 * One of the files `../releases.ts` puts together, a minor version each.
 */

import type { Release } from "../releases.js";

export const RELEASES_1_1: Release[] = [
	{
		version: "1.1.0-canary.10",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.7.0: antialiasing by FXAA, SMAA, MSAA 2×, 4× or 8×, or still-frame TAA, chosen in the Rendering panel.",
		added: [
			"**Antialiasing modes**: Off, FXAA, SMAA, MSAA 2×, 4× and 8×, and Still-frame TAA, in Settings › Scene view and in the Rendering panel. Each renderer offers what it draws: WebGPU has MSAA 4× only, WebGL2 as many samples as the GPU has.",
			"**Still-frame TAA**: once the view is still it draws 16 frames a fraction of a pixel apart and averages them. While beams or particles move, it keeps a running average.",
			"**The profile's antialiasing rows** time every mode this device draws.",
		],
		changed: [
			"**Quality levels antialias by a pass first**: FXAA at Levels 10 to 12, SMAA at 13 to 17, MSAA 4× from 18, as a tablet pays most for MSAA.",
			"**SMAA uses the reference implementation's tables**, under its MIT licence, now in Settings › Licences and the attributions.",
			"**The Place Editor is 0.7.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.9",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.6.0: Metal, Glass and Reflectance reflect the place round them, and a dark Sky dims what is in its shade less.",
		added: [
			"**Scene reflections**, a Rendering switch under Sky reflections, on from Quality Level 19: Metal, Glass and Reflectance show the place round the camera, drawn into a small cube again as the camera moves. A metal shows it blurred, in its own colour.",
		],
		changed: [
			"**Metal is lit as Studio's is**: less of its colour's own light, and more of what it reflects, fitted to Studio's captures of a Metal block on a lit floor.",
			"**Reflections show a Sky's own images** where it has them, so a dark space Sky is dark in a metal too.",
			"**Under a Sky of six images, the shade is darker**, as Studio's captures of a floor in shadow under open sky show.",
			"**The Place Editor is 0.6.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.8",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.5.0: the sun's shadows reach as far as Studio's at each quality level, and the profile measures every level.",
		added: [
			"**The profile's quality levels**: one frame at each level, 1 to 21, with the level's own render scale and antialiasing. The view goes back to its own level after.",
		],
		changed: [
			"**The sun's sharp shadows reach as far as Studio's at each quality level**, from about 90 studs at Level 10 to 578 from Level 19, as measured in Studio. Parts far above still cast them, as they do in Studio.",
			"**Below Level 10 the blurred shadows reach further**, as Studio's soft shadows do without a shadow map.",
			"**Level 15 is named Level 15** in the Rendering panel's View.",
			"**The Place Editor is 0.5.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.7",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.4.0: quality levels, Automatic and Level 1 to 21, as Studio's.",
		added: [
			"**Quality** in Settings › Scene view and at the top of the Rendering panel's View: Automatic, or Level 1 to Level 21. A level sets the switches, how far parts are drawn, how far the sun's shadows reach and their maps' size, and the render scale and antialiasing where those are Automatic.",
			"**Render distance**: parts past a level's distance are not drawn, from 500 studs at Level 1 to every part from Level 17, as measured in Studio.",
			"**Automatic** starts from the device, a phone at Level 5, a tablet at 10, a laptop's built-in GPU at 15 and other computers at 21, then moves a level down after two seconds of slow frames and up after five of fast ones.",
			"**Soft sun shadows below Level 10**, from a small blurred map, where Studio draws soft shadows without a shadow map.",
		],
		changed: [
			"**The Rendering panel's performance presets are the quality levels.** Level 15 has Fast (iPad)'s switches, and Level 21 is As Studio. A switch changed by hand shows Custom (from Level N).",
			"**Render scale and Antialiasing are Automatic by default**, the quality level's. Antialiasing is a new setting, so a choice made in canary.6 is not kept.",
			"**The Place Editor is 0.4.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.6",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.3.0: antialiasing can be turned off, and the profile measures it.",
		added: [
			"**Antialiasing** in Settings › Scene view: 4×, the default, or Off, one sample a pixel. The view is made again when it changes.",
			"**The profile's antialiasing rows**: one frame with the view built at one sample a pixel and at four.",
		],
		changed: [
			"**The sky's shadow is read in one loop over its sixteen maps**, and materials' grain and patterns are left out of a place with none, as one of Plastic and SmoothPlastic is. The picture is unchanged.",
			"**The Place Editor is 0.3.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.5",
		date: "2026-11-21",
		headline: "The Place Editor's shader is smaller on WebGPU, for a tablet's GPU.",
		changed: [
			"**The parts' shader leaves out what the place has none of**: the lights' code where it has no PointLight, SpotLight or SurfaceLight, and Neon's and CrackedLava's where it has neither. The picture is unchanged.",
			"**The sun's shadow is read in one place** rather than once a cascade, and the far shadow's four taps in a loop. The picture is unchanged.",
			"**The Place Editor is 0.2.2.**",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.4",
		date: "2026-11-21",
		headline:
			"The Place Editor draws faster on a tablet: a shader for the switches in use, and cheaper sky shadows.",
		changed: [
			"**The parts are shaded by a shader built for the Rendering panel's switches as they are**, with the code for what is off left out. It is built the first time a set of switches is used, and kept; the picture is unchanged.",
			"**Sky shadows** read the lighting cells first, and the sky's maps only where the cells' edge needs them. The picture is unchanged.",
			"**The Place Editor is 0.2.1.**",
		],
		fixed: ["**The profile's report** rounds the pixel ratio."],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.3",
		date: "2026-11-21",
		headline: "The Place Editor is 0.2.0: a deeper profile, and a render scale.",
		added: [
			"**Render scale** in Settings › Scene view: the place drawn at 100%, 75% or 50% of the screen's pixels across and down. Automatic is 75% on a touch screen and 100% elsewhere.",
			"**The profile's base**: with every feature off, the frame with nothing drawn, the parts' depth alone (WebGPU), and the parts shaded.",
			"**Light and Shadows, each off alone**: each switch of those groups turned off by itself, and what the frame saves without it.",
		],
		changed: [
			"**The Place Editor is 0.2.0.**",
			"**The profile's report** names the render scale, and a GPU whose browser gives one word for its vendor, architecture and description once.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.2",
		date: "2026-11-21",
		headline: "Rendering, Performance and Mesh Debug open on a tablet.",
		fixed: [
			"**Rendering, Performance and Mesh Debug** open in the right-hand drawer on an iPad or a phone. Opened from the Panels menu there, they dimmed the view and showed nothing.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.1",
		date: "2026-11-21",
		headline: "The Performance panel profiles the frame stage by stage, on any device.",
		added: [
			"**Profile this view**, in the Place Editor's Performance panel: the frame rate on screen, one frame waited for, each stage of the frame timed with the GPU waited for at its end, the Rendering panel's steps added one at a time, and the frame at a half and a quarter of the pixels. It works where the browser cannot time the GPU, as Safari on an iPad cannot.",
			"**Copy report** puts the whole profile, with the renderer, the GPU's name and the canvas size, on the clipboard as text.",
		],
		affects: ["editor", "docs"],
	},
];
