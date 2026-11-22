/**
 * Release notes for 1.1: 1.1.0, its patches, and the canary builds leading to
 * each, newest first.
 *
 * One of the files `../releases.ts` puts together, a minor version each.
 */

import type { Release } from "../releases.js";

export const RELEASES_1_1: Release[] = [
	{
		version: "1.1.0-canary.22",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.17.0: benchmark runs compared, with the drift between them taken out and the noise said.",
		added: [
			"**Compare with last run** and **Compare with a file** at the end of a benchmark, and **Compare two results** in Settings › Scene view: each station's change before and after the run's drift, and whether it is past the noise.",
			"**Each station twice**, in Settings › Scene view: a second pass over the stations, so each has its own noise. Twice as long.",
			"**The last five runs are kept in this browser**, to compare a new run with.",
		],
		changed: ["**The Place Editor is 0.17.0.**"],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.21",
		date: "2026-11-22",
		headline: "The Place Editor is 0.16.1: a Highlight's outline costs a fraction of what it did.",
		changed: [
			"**A Highlight's outline is found in two short passes**, along each row and then up and down, rather than by every pixel searching the square round it. The same outline; on an iPad's screen, 18 reads a pixel rather than 81.",
			"**The Place Editor is 0.16.1.**",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.20",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.16.0: Roswaal Benchmark 1, and the CPU's part of a frame in the profile.",
		added: [
			"**Roswaal Benchmark 1**: thirteen test scenes Roswaal makes for itself, the same on every device, each timed on the GPU and the CPU, still and while the camera orbits. Current settings or a full sweep of every quality level. From Settings › Scene view, or the Rendering panel's Profile.",
			"**The editor hidden while it runs**: the Roswaal logo or Esc stops it; at the end, its score, Copy report and Download results.",
			"**The page's own work a frame in the profile**: effects, culling and the rest.",
		],
		changed: ["**The Place Editor is 0.16.0.**"],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.19",
		date: "2026-11-22",
		headline: "The Place Editor is 0.15.0: Highlight instances are drawn, as Studio draws them.",
		added: [
			"**Highlights**: a Highlight's FillColor over the parts it covers and a 2 pixel OutlineColor line round them, over what is in front with DepthMode AlwaysOnTop, where they are seen with Occluded. A Highlight covers its Adornee, or its parent, and every part in it; parts with a Transparency are left out, as in Studio. With WebGPU.",
			"**The Rendering panel's Highlights switch**, under Post effects.",
			"**Transparent parts show Highlight**, a Roswaal fix in the Rendering panel, off unless chosen: parts with a Transparency keep their Highlight, fully transparent ones too, for carousels and scene renders.",
		],
		changed: ["**The Place Editor is 0.15.0.**"],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.18",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.14.0: orbiting far out no longer redraws the near sky maps every frame.",
		changed: [
			"**The near sky maps follow a moving camera a share a frame**: two maps a frame with their thin parts, then the lighting cells in two halves, into a second set that is read once complete. A place or sun change still redraws them at once.",
			"**Apple's GPUs take the near maps' thin parts out in four render passes again**: in compute it measured slower on an iPad.",
			"**The Place Editor is 0.14.0.**",
		],
		fixed: [
			"**The reflection cube is drawn again once the near sky maps have moved**, so reflections are not left shaded by maps the camera has left.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.17",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.13.0: no quality level multisamples, and the near sky maps' thin parts are taken out in compute.",
		changed: [
			"**No quality level turns on MSAA**: SMAA from Level 13 to 21. MSAA is chosen in Settings' Antialiasing.",
			"**The near sky maps' thin parts are taken out in one compute pass a map**, rather than four render passes. The picture is the same.",
			"**The Place Editor is 0.13.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.16",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.12.0: the profile times multisampling with one draw, and says what a sky map redraw costs.",
		added: [
			"**The profile's MSAA 4×, one draw row**: multisampling with the parts shaded and depth-tested in one draw.",
			"**The sky maps' redraw in three stages**: the maps, the thin parts taken out of the near ones, and the lighting cells.",
		],
		changed: ["**The Place Editor is 0.12.0.**"],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.15",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.11.0: dragging the camera is lighter at the higher levels, and the profile's GPU times can be trusted on Safari.",
		added: [
			"**The profile's Camera moving rows**: an orbit, a pan, a pinch and each touch stick, with the GPU's stages and what was drawn again.",
			"**The GPU's own time beside every row of the profile**, where it has timers.",
		],
		changed: [
			"**The reflection cube is drawn a face a frame**, from one place, and read once all six are done. An orbit drew all six, and their smaller levels, every frame.",
			"**The lighting cells are found in two steps, eight slices a pass**: each cell's own share of the sky once, then the average round it. The same cells, with a 27th of the samples, where the browser allows it.",
			"**The reflection cube is no longer drawn again when only the near sky maps move.**",
			"**The Place Editor is 0.11.0.**",
		],
		fixed: [
			"**The GPU's timers no longer count overlapping passes twice**: on Safari, Glow, bloom and post read longer than the whole frame. Automatic reads the same times.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.14",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.10.0: the profile says what each quality level draws, and where its time goes.",
		added: [
			"**Each quality level's stages in the profile**, with what the level drew at: the canvas, antialiasing, the sun's map and reach, the glow's size, draw calls and the switches it adds.",
			"**The GPU's own time for each stage** where it has timers, beside the waited times.",
			"**The level, antialiasing and camera the profile began from**, at the top of the report, so two profiles can be taken from the same spot.",
		],
		changed: [
			"**The profile's steps add only the switches the view has on**, so the last step is the view as set.",
			"**The sun's maps are drawn every frame while the stages are profiled**, as when the camera moves.",
			"**The Place Editor is 0.10.0.**",
		],
		fixed: [
			"**The report's Antialiasing names the mode drawn** (FXAA, SMAA), not only its samples.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.13",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.9.1: Apple's GPUs draw the parts' depth first again, as it measured faster.",
		changed: [
			"**Every GPU draws the parts' depth first again.** On an iPad the one-draw path measured 9 ms a frame to the pre-pass's 6. The profile's Depth path rows still time both.",
			"**The Place Editor is 0.9.1.**",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.12",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.9.0: lighter work for Apple's GPUs, a half size glow at the lower levels, and half precision where the device has it.",
		added: [
			"**The profile's Depth path rows**: one frame with the parts' depth drawn first, and one with them shaded and depth-tested in one draw.",
			"**The profile's Shader precision rows**, where the device has half precision.",
		],
		changed: [
			"**On Apple's GPUs the parts are shaded and depth-tested in one draw**, and occlusion's depth is drawn small: a tile-based GPU hides what is behind before it shades. Other GPUs draw the parts' depth first, as before.",
			"**Neon's glow is found at half the view's size at Quality Levels 6 to 12**, where it is drawn at one sample a pixel.",
			"**The colour arithmetic runs in half precision with WebGPU where the device has it**: the tone curve and the lights' sums. The picture is the same.",
			"**A few powers in the shaders are multiplications**, and an image's tint is worked out once a corner rather than once a pixel.",
			"**The Place Editor is 0.9.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.11",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.8.0: render scale is a share of the page's own pixels, and Native draws a Retina screen's every pixel.",
		added: [
			"**Native** in Render scale: every pixel the screen has, twice as many each way on a Retina screen.",
		],
		changed: [
			"**Render scale is a share of the page's own pixels**, before a Retina screen doubles them. Quality Levels 10 to 17 draw at 100% of them, a quarter of an iPad's pixels, and Native from Level 18. A screen with one pixel to the page's draws as before.",
			"**The profile times still-frame TAA and moving beams and particles alone**: their own frames wait while it runs.",
			"**The Place Editor is 0.8.0.**",
		],
		affects: ["editor", "docs"],
	},
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
