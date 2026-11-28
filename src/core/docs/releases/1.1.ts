/**
 * Release notes for 1.1: 1.1.0, its patches, and the canary builds leading to
 * each, newest first.
 *
 * One of the files `../releases.ts` puts together, a minor version each.
 */

import type { Release } from "../releases.js";

export const RELEASES_1_1: Release[] = [
	{
		version: "1.1.0-canary.146",
		date: "2026-11-28",
		headline: "The light grid works out only cells near parts.",
		changed: [
			"**The light grid works out light only in cells near parts**, the ones a surface reads, not in the open air.",
			"**The light grid fills again over a few frames**, not one, after the camera jumps or parts change.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.145",
		date: "2026-11-28",
		headline: "Highlights on WebGL2 on iPad.",
		fixed: [
			"**Highlights draw on iPad with WebGL2.** Their fill and outline never showed there.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.144",
		date: "2026-11-28",
		headline: "Highlights draw only where their parts are on the screen.",
		changed: [
			"**Highlights' fill and outline are worked out only where their parts are on the screen**, not across the whole frame, and not at all when none is in view.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.143",
		date: "2026-11-26",
		headline: "A self-test where WebGL2's Highlights draw nothing.",
		added: [
			"**Where Highlights draw nothing on WebGL2, a benchmark says which step fails**, from a self-test run once.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.142",
		date: "2026-11-26",
		headline: "A WebGL2 benchmark says how it keeps depth.",
		added: [
			"**A WebGL2 benchmark or profile says how depth is kept**: reversed, as on WebGPU, or written by each pixel where the browser cannot reverse it.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.141",
		date: "2026-11-26",
		headline: "A benchmark says where Highlights stop.",
		added: [
			"**A benchmark or profile reports GPU errors from before it began** as well, and on WebGL2 whether Highlights drew nothing, checked once when a place's Highlights are first drawn.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.140",
		date: "2026-11-26",
		headline: "WebGL2 errors in a benchmark's results.",
		added: [
			"**A benchmark or profile on WebGL2 says what it could not draw**, as on WebGPU: a shader that did not build, a target not complete, an error WebGL kept, with the station it was first seen at.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.139",
		date: "2026-11-26",
		headline: "Ambient lighting's coarse cells over four frames, and a Smoothness run names its slowest frames.",
		changed: [
			"**Ambient lighting's coarse cells are worked out again over four frames** as the camera moves on, not in one, the old cells read until the new are done.",
		],
		added: [
			"**Smoothness names its slowest frames**: each over three refreshes, with the page's time and what was drawn again in it, in the report and the results file.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.138",
		date: "2026-11-26",
		headline: "The light grid at 4 studs on a tablet.",
		changed: [
			"**On a touch screen, Light object grid Automatic is 4-stud cells**, not 8: an iPad Mini holds 60 Hz at Native with them, and a SpotLight's or SurfaceLight's light spreads half as far past its cone.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.137",
		date: "2026-11-26",
		headline: "The light grid keeps a light off what faces away from it.",
		fixed: [
			"**The light grid no longer lights what is behind a SurfaceLight**, or round a SpotLight outside its cone, within half a cell of it: a light on a wall lit the wall it was on.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.136",
		date: "2026-11-26",
		headline: "Ambient lighting's cells worked out only near parts.",
		changed: [
			"**Ambient lighting's cells are worked out only near parts** as the camera moves: the open air over a place and empty ground are left as open sky, about half the work in a dense town and more in open places, for the same picture.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.135",
		date: "2026-11-26",
		headline: "A profile goes on where shaders never finish.",
		fixed: [
			"**A profile or benchmark no longer stops for good** where the browser never finishes the view's shaders, as an iPad's profile did at Antialiasing FXAA: after 45 seconds it measures what is drawn, and a profile says so, with any GPU errors.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.134",
		date: "2026-11-26",
		headline: "Ambient lighting's Grid shaders leave Realtime out.",
		fixed: [
			"**Ambient lighting on Grid** draws with shaders that hold only Grid's work, not Realtime's as well, which a tablet's GPU paid for though it never ran.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.133",
		date: "2026-11-26",
		headline: "A benchmark says the GPU errors it met.",
		added: [
			"**GPU errors in a benchmark's results**: with WebGPU, anything the browser refused to draw is listed in the report, the results file and on the end screen, with the station it was first seen at.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.132",
		date: "2026-11-26",
		headline: "File buttons that look like buttons.",
		fixed: [
			"**The Benchmark page's file buttons** (Choose two files, Choose a file, Compare with a file) look and size as every other button, a touch screen's too.",
			"**A note written into a Settings box**, such as what a profile import set, lines up with the rows above it.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.131",
		date: "2026-11-26",
		headline: "Graphics settings as a file, to send or import.",
		added: [
			"**Settings profile, on the Benchmark page**: Export saves the Graphics settings as a file; Import sets them from one, such as a profile sent for a test, and says anything this version does not offer.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.130",
		date: "2026-11-26",
		headline: "Ambient lighting's Grid reaches 768 studs.",
		changed: [
			"**Ambient lighting on Grid** reads coarser 16-stud cells past the 4-stud ones, out to 768 studs round the camera, in place of the sky's maps; they are worked out again only when parts move or the camera moves on 128 studs.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.129",
		date: "2026-11-26",
		headline: "Ambient lighting from the lighting cells, on a tablet.",
		added: [
			"**Ambient lighting in Graphics**: Grid reads where the sky's light reaches from the lighting cells round the camera, and past them far fewer of the sky's maps; Realtime works it out at every pixel, as before. Automatic is Grid on a touch screen and Realtime elsewhere.",
		],
		changed: [
			"**Sky shadows is Ambient lighting** in the Rendering panel: rooms closed from the sky get Ambient, not OutdoorAmbient.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.128",
		date: "2026-11-26",
		headline: "Open Luau wears the Luau logo.",
		changed: [
			"**Open Luau** on a graph's menu shows the Luau logo, as a Luau file does in the Project panel.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.127",
		date: "2026-11-26",
		headline: "Benchmark results save as one file on an iPad.",
		fixed: [
			"**Benchmark results saved to Files on an iPad or iPhone** are the results file alone, without a text file of its name beside it.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.126",
		date: "2026-11-26",
		headline: "Compile mode in a list, and a deprecation that says what to use.",
		changed: [
			"**Compile mode, Interpreted or Native**, in a graph's settings and a function's Inspector, in place of the Native code box. A function in a script that is Native as a whole says so.",
		],
		added: [
			"**Use instead and Reason on a deprecated function**: written as `@[deprecated {use = …, reason = …}]`, so the Luau linter's warning says them. Import as graph reads them back, with `@native` in the same brackets.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.125",
		date: "2026-11-26",
		headline: "Benchmark files named for what they measured.",
		changed: [
			"**A benchmark's results file says what kind of run it was** and the renderer: roswaal-benchmark-5-smoothness-webgl2-2026-11-26T08-09.json, or pixel-cost, full-sweep, current, and ab with the switch's name.",
		],
		fixed: [
			"**A benchmark no longer stops when the site fails to send a model for a moment**: it asks again.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.124",
		date: "2026-11-26",
		headline: "Highlights on WebGL2.",
		fixed: [
			"**Highlights draw with WebGL2**, as with WebGPU: fill, outline, AlwaysOnTop and Occluded.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.123",
		date: "2026-11-26",
		headline: "Benchmark settings in a line each, and room on an iPad Mini.",
		changed: [
			"**Settings, Benchmark** says each run in a line, as Graphics does, with an i for the rest.",
			"**Settings on an iPad Mini** puts each control under its name, so the words have the page's width.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.122",
		date: "2026-11-26",
		headline: "WebGL2 benchmark times as the screen shows them.",
		fixed: [
			"**A WebGL2 benchmark times each frame until the GPU is done with it**, one at a time: since canary.117 it took Safari's word that a frame was done before it was, and read an iPad's frames at less than half what they took. Its times from canary.117 to .121 are too low.",
			"**Smoothness counts the refreshes missed against the display's own refresh**, measured with nothing drawn: where nearly every frame was late, it counted none missed.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.121",
		date: "2026-11-26",
		headline: "Smoothness: a benchmark of the frames that reach the screen.",
		added: [
			"**Smoothness, on the Benchmark page**: the same scenes and movements, paced by the display as in use, with nothing on the GPU timed. Each station says the frames that reached the screen each second, the longest gap between two, and the refreshes that showed no new frame: how smooth it looks, where the benchmark says what it costs. Its results compare with another Smoothness run's.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.120",
		date: "2026-11-26",
		headline: "Less measuring while you move: light objects are set, and the depth path is measured once.",
		changed: [
			"**Light objects resolution is Full, Half or Quarter**, Full by default; Automatic is gone, and a saved Automatic reads as Full. It measured as the view moved, afresh for every place and size, and cost more than it saved. Dynamic optimization still takes it to half, then a quarter, while frames do not fit.",
			"**The depth path is measured once on each device and kept**, rather than again for every place, size and benchmark station (WebGPU).",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.119",
		date: "2026-11-26",
		headline: "Settings: Graphics, and the benchmark on a page of its own.",
		changed: [
			"**Settings › Scene view is now Graphics.**",
			"**The benchmark has its own page in Settings**, under Place Editor beside Graphics: its runs, and comparing two results.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.118",
		date: "2026-11-26",
		headline: "Moving through a busy place hitches far less: reflections and the sky's light are spread out and cheaper.",
		changed: [
			"**Each face of the reflection cube draws only what it sees**, not the whole place six times over.",
			"**WebGL2 draws a new reflection cube a face a frame**, as WebGPU does, the last one shown until it is done, rather than all six in one frame.",
			"**WebGL2 works out the sky's light through thin walls in two steps**, as WebGPU does, with a 27th of the work it took each time the camera moved on.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.117",
		date: "2026-11-25",
		headline: "A WebGL2 benchmark shows its frames as it times them.",
		fixed: [
			"**A benchmark on WebGL2 shows each frame it draws**, rather than one in the middle of each motion and one near its end, and keeps two frames in flight as WebGPU's does: it waited for the GPU by reading a pixel back, which gave the page no turn to show anything and emptied the GPU each frame.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.116",
		date: "2026-11-25",
		headline: "WebGL2 benchmarks no longer stall on every moving frame.",
		fixed: [
			"**A benchmark on WebGL2 no longer stalls each moving frame**: it waited for the GPU to finish at every stage of every frame, which on an iPad took 60 to 137 ms a frame and skipped the camera to the end of each movement. Nothing it measured that way was kept.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.115",
		date: "2026-11-25",
		headline: "A tablet keeps up at Native with light objects: a coarser grid by default, filled more cheaply as you move.",
		changed: [
			"**On a touch screen, Light object grid Automatic is 8-stud cells** for Soft and Realistic places alike: an iPad Mini kept 60 Hz at Native with it. On a computer, Automatic stays 4-stud cells for Soft and light at every pixel for Realistic.",
			"**Moving fills the light grid's new cells over a few frames** rather than all in one, so crossing a cell does not cost a frame; until they are filled, the grid is read where it was.",
			"**Light objects' paths through the parts skip empty space** 8 studs at a time, so filling the grid costs less where the place is open.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.114",
		date: "2026-11-25",
		headline: "WebGL2 leaves out what is switched off, and draws the place without copying it.",
		changed: [
			"**WebGL2 builds its shaders for the switches that are on**, as WebGPU does, leaving out the code for what is off: the light grid, lights in a place with none, and the rest. Until one is built, the shader for every switch draws.",
			"**WebGL2 without multisampling draws the place straight into the texture the glow and post effects read**, rather than copying it there once or twice a frame, and leaves depth it no longer reads in the GPU's tile memory.",
			"**A benchmark run records the depth path and light objects resolution Automatic measured**, which it runs with too, so a comparison says when they differ.",
		],
		fixed: [
			"**Hovering a reroute knot shows the ring that moves it**, not the middle that starts a wire.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.113",
		date: "2026-11-25",
		headline: "Knots and wildcard pins are easier to drag a wire from, and show where.",
		changed: [
			"**Most of a reroute knot starts a wire**, not only its middle; the ring round it, now wider, moves the knot.",
			"**A wildcard pin can be grabbed further out**, off the node's edge, without reaching into the next row.",
			"**Hovering a knot or a wildcard pin shows where a drag starts**: its grab area, behind the dot, in the pin's colour.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.112",
		date: "2026-11-25",
		headline: "Shadow maps draw only what they cover, and moving a light refills only round it.",
		changed: [
			"**The sun's shadow maps and the sky's maps draw only the parts within their sides**, not the whole place each time (WebGPU and WebGL2).",
			"**Moving, adding or removing a light fills the light grid again only where that light reaches**, not all of it (WebGPU and WebGL2).",
			"**Occlusion culling draws its own depth pass only on frames it reads back**: while the camera moves, the place's pass draws its depth itself.",
			"**The light grid fills in rows of 32 cells**, so a thin strip of new cells leaves no part of the GPU idle.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.111",
		date: "2026-11-25",
		headline: "Less work for the GPU each frame, with the same picture.",
		added: [
			"**A benchmark run records the Scene view settings it ran with**: the quality level, render scale and each effect's resolution. Comparing two runs says which settings differ.",
		],
		changed: [
			"**The GPU's passes are timed only as often as something reads the times**: every frame for a benchmark, a profile or the Performance panel's graph, one frame in four for Automatic quality, and otherwise not at all. Reading the times makes Safari wait for the GPU.",
			"**The frame's depth stays on the GPU's chip** when nothing reads it after the glow, instead of being written out and read back each frame.",
			"**Light objects cost less on the light grid**: under Soft, each pixel reads one grid texture rather than two; the grid's cells inside parts and lights too faint to show are not worked out; and its wrapping costs no division (WebGPU and WebGL2).",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.110",
		date: "2026-11-25",
		headline: "WebGL2 catches up with WebGPU's savings: half-size lights and particles, and the reflection grid.",
		added: [
			"**Light object resolution on WebGL2**: light objects worked out at half or a quarter of the pixels, as on WebGPU, where the light grid is off. Automatic measures which one the device keeps up with.",
			"**Reflection grid on WebGL2**: scene reflections drawn once a cell and kept, as on WebGPU.",
			"**Particle resolution on WebGL2**: beams and particles at half size, where antialiasing is not MSAA.",
		],
		fixed: [
			"**Thin Neon parts no longer flicker in the glow on WebGL2**, as on WebGPU.",
			"**Reflections on WebGL2 are read from where they were drawn**, not from the camera.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.109",
		date: "2026-11-25",
		headline: "A canary's version stays inside its box on the landing page.",
		fixed: [
			"**A long version no longer breaks out of its box** beside the name on the landing page, as a canary's did in Safari on an iPad. Where there is no room beside the name, it goes under it.",
		],
		affects: ["docs"],
	},
	{
		version: "1.1.0-canary.108",
		date: "2026-11-25",
		headline: "The light object grid on WebGL2, with Soft.",
		added: [
			"**Light object grid on WebGL2**, as on WebGPU: cascades of cells round the camera, parts blocking light in the finest, and Soft's light where the place is Soft. Where the device cannot draw to float textures, light objects are worked out per pixel as before.",
		],
		fixed: [
			"**A place whose light objects are all removed no longer keeps their light** on the light grid (WebGPU).",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.107",
		date: "2026-11-25",
		headline: "Hand-written Luau is edited in its tab, and a hand-edited generated file can come back into its graph.",
		added: [
			"**A hand-written Luau file is edited in its tab**, saved as you type, on leaving it and on Ctrl+S, with completion and hover: on a tablet there is no other editor to hand it to. Generated Luau stays read-only.",
			"**Syncback: bring into graph.** Where a compile skips a generated file edited since it was written, the compile results offer to rebuild its graph from the file, as Import as graph builds one, and compile it over the file. Undo puts the graph back.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.106",
		date: "2026-11-25",
		headline: "Render scale is its own setting, and a Full sweep measures each one.",
		added: [
			"**A Full sweep ends with every render scale**, from 50% to Native, at the level the view was at: what a pixel costs at each station. It is left out of the sweep's score.",
		],
		changed: [
			"**The quality level no longer sets the render scale.** Render scale is Native by default; a saved Automatic reads as Native. Dynamic still draws fewer pixels while frames do not fit.",
			"**A Full sweep runs every quality level at Native**, so its levels differ only in what each level sets.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.105",
		date: "2026-11-25",
		headline: "The light grid catches up going up and down as it does going across.",
		changed: [
			"**Going up or down fills only the light grid's new layers**, as going across does: about half the cells on a long descent, and no cascade filled whole again.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.104",
		date: "2026-11-25",
		headline: "Native code and optimization, for a graph and for its functions.",
		added: [
			"**Optimization and Native code in a graph's settings**, beside Type checking: they write `--!optimize` with its level and `--!native` at the top of the file.",
			"**Native code and Deprecated on a function**, in the Inspector: they write `@native` and `@deprecated` above it.",
			"**Import as graph reads them back**: the file's `--!native` and `--!optimize`, and a function's `@native` and `@deprecated`. A function with any other attribute stays as code.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.103",
		date: "2026-11-25",
		headline: "Cast To on an output pin, a wider drop to grow a pin, and fixes.",
		added: [
			"**Cast To on an output pin's menu**: the palette opens on its casts, and the one picked arrives wired to the pin.",
			"**A wire can be let go just outside a node to grow it a pin**, and while it is dragged, the node it would join is outlined with what it would add.",
		],
		changed: [
			"**Random BrickColor and Now are values**, as Random is: each wire they feed reads its own. A graph with execution wires through them has those wires joined when it opens.",
		],
		fixed: [
			"**A Luau file's tab shows the file as it is now** when you go back to it, and when a compile rewrites it: it showed the file as it was when its tab was opened.",
			"**A CylinderMesh is round**, as wide as the narrower of its part's X and Z, as Studio draws it: it was drawn oval.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.102",
		date: "2026-11-25",
		headline: "Reaching a new area spreads its catching up over frames.",
		changed: [
			"**Reaching a new area no longer stacks its catching up into the same frames**: a share of the near sky maps, a face of the reflection cube and a whole light object grid each draw the whole place, and now at most one goes in a frame, the rest the frames after.",
		],
		added: [
			"**Light object grid and Reflection cube** have their own rows in the Performance panel's stages, apart from the sun's shadows.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.101",
		date: "2026-11-25",
		headline: "The 4-stud light grid no longer darkens MeshParts and turned parts.",
		fixed: [
			"**The 4-stud light object grid no longer darkens MeshParts and turned parts**: each part counted as the whole box round it, so a mesh's hull or a part turned at an angle darkened and blocked the air round it. Turned parts now count as what they fill, wedges, balls and cylinders by their shape, and MeshParts not at all.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.100",
		date: "2026-11-25",
		headline: "Parts block light objects on the light object grid, and darken the cells they fill.",
		added: [
			"**Parts block light objects on the light object grid** near the camera, and the cells they partly fill keep only the light of the air round them, as Studio's Soft voxels do: a room's corners darker, walls between a light and what is behind them. A surface takes its light from the air in front of it.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.99",
		date: "2026-11-25",
		headline: "The light object grid fills only what the camera newly reaches.",
		changed: [
			"**The light object grid fills only the cells the camera newly reaches** as it goes across, rather than a whole grid each time it moved on: walking costs a sliver of what it did, and the grid no longer hitches when it catches up.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.98",
		date: "2026-11-25",
		headline: "SpotLights in a Soft place light as Studio's do.",
		fixed: [
			"**SpotLights in a Soft place light as Studio's do**: their light goes every way, as a PointLight's, dimmed by how much of the sphere their cone covers, so the parts beside one are lit and the floor under a narrow one hardly is. Fitted to Studio's screen captures at 60, 120 and 180 degrees.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.97",
		date: "2026-11-25",
		headline: "Soft light objects as bright as Studio's, and falling off as theirs do.",
		fixed: [
			"**Light objects in a Soft place are as bright as Studio's and fall off as theirs do**: they were brighter, and kept their strength out to most of their Range. Fitted to Studio's screen captures of a PointLight's walls under Soft.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.96",
		date: "2026-11-25",
		headline: "The view takes the place's Camera field of view.",
		added: [
			"**The view takes the place's Camera field of view**, as Studio's does: FieldOfView, and the angle FieldOfViewMode holds as the view is resized, Vertical, Diagonal or MaxAxis. A place without a Camera is 70 degrees vertical, as before.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.95",
		date: "2026-11-25",
		headline: "Light objects follow the place's LightingStyle: Soft or Realistic.",
		added: [
			"**Light objects follow the place's LightingStyle**, which replaced Technology: Soft, the default for a new place in Studio, lights them flat in 4-stud cells, a face lit whichever way it turns, as Studio draws it; Realistic, each pixel works out its own. A place from before LightingStyle follows its Technology: Voxel and Compatibility as Soft, ShadowMap and Future as Realistic.",
			"**Light object grid** has Automatic, now the default, which follows LightingStyle, and 4 studs.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.94",
		date: "2026-11-25",
		headline: "Properties leaves out deprecated properties; the place's panel shows what it draws.",
		changed: [
			"**Properties leaves out deprecated properties**, as Studio's does: Lighting's Technology, which LightingStyle replaced, Outlines and the like. The place keeps them as they are.",
			"**The place's own panel shows what it draws**: Renderer, Frame rate and the lighting notes are gone from it. Renderer and Frame rate are in Settings › Scene view and the Rendering panel.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.93",
		date: "2026-11-25",
		headline: "Particle resolution: beams and particles at half size.",
		added: [
			"**Particle resolution**, in Settings › Scene view and the Rendering panel: Half draws beams and particles at half the pixels across and down, a quarter as many, into a layer laid over the place, so smoke and sparks that cover much of the view cost far less. Where the place has no Neon glow, bloom or post effects, they stay at Full, the default. WebGPU.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.92",
		date: "2026-11-25",
		headline: "Light object grid: light objects worked out once round the camera.",
		added: [
			"**Light object grid**, in Settings › Scene view and the Rendering panel: light objects worked out into three grids round the camera, of cells 8, 16 or 32 studs and twice and four times that, again only when the lights change or the camera moves on. Each pixel blends the cells round it and turns the light to its own face, so edges stay sharp; the light's fall softens to the cells' size, and the cost no longer grows with the lights. Off by default. WebGPU.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.91",
		date: "2026-11-25",
		headline: "Thin Neon's glow flickers less as the camera moves.",
		fixed: [
			"**Neon thinner than a pixel glows more steadily as the camera moves**: in the glow's pass it is drawn at least a pixel and a half wide across the screen and dimmed to match, so it is no longer caught on some frames and missed on others. Neon panels and the Textures over them are as before.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.90",
		date: "2026-11-25",
		headline: "Light objects and Sky light at Half or Quarter keep edges and corners sharp.",
		fixed: [
			"**Light objects and Sky light at Half or Quarter no longer step along edges and corners**: where two faces met, a pixel took light worked out for the other face. Each pixel now takes only light worked out for a face turned its way, and works out its own along the line where faces meet.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.89",
		date: "2026-11-25",
		headline: "Particle animation rate, and Surface reflection accuracy.",
		changed: [
			"**Effects while still is now Particle animation rate**, with Third and Quarter beside Full and Half: particles and beams drawn every display frame, or one in two, three or four, while the camera is still. Automatic is Half on a touch screen and Full on a computer.",
			"**Reflection updates is now Surface reflection accuracy**, and its Following choice is Exact.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.88",
		date: "2026-11-25",
		headline: "A tablet stays cooler: fewer frames with the camera still, and sun shadow maps drawn only when needed.",
		added: [
			"**Effects while still**, in Settings › Scene view and the Rendering panel: moving particles and beams drawn at half rate while the camera is still, so a tablet rests between frames. Automatic halves them on a touch screen; moving the camera draws at full rate at once.",
		],
		changed: [
			"**Sun shadow maps are drawn again only when the view moves past them**: each is drawn a little wider than it needs and kept while the camera stays inside it, rather than redrawn as the camera moves. Shadow texels are an eighth wider.",
		],
		fixed: [
			"**Decals and Textures on see-through parts sit behind see-through parts in front of them**: they showed over every see-through part, and Glass in front cut them off.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.87",
		date: "2026-11-25",
		headline: "Light objects at Half stay sharp above 100% render scale.",
		fixed: [
			"**Light objects and Sky light at Half no longer soften surfaces above 100% render scale**: at 150% they were worked out at fewer pixels than the screen has. Half now never goes below the screen's own detail; at Native and at 100% and below it is as before.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.86",
		date: "2026-11-25",
		headline: "Roswaal Benchmark 5: Reflections and Bloom stations.",
		added: [
			"**Roswaal Benchmark 5** adds two stations: **Reflections**, Metal blocks, Glass panes and reflective balls over a reflective floor; and **Bloom**, a BloomEffect over bright parts with no Neon. Scores compare with Benchmark 5 runs only.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.85",
		date: "2026-11-25",
		headline: "Only what reflects reads reflections, and reflections can be kept on a grid.",
		fixed: [
			"**Parts that reflect nothing no longer read the sky and the reflection cube**: every pixel read them to mix in none of it, a large share of a frame on a tablet at Native. Reflective parts, Glass and Metal look as before.",
		],
		added: [
			"**Reflection updates**, in Settings › Scene view and the Rendering panel: the place round the camera drawn again as the camera moves, or kept on a 32, 64 or 128-stud grid, drawn once for each cell the camera enters and read while it stays. Automatic keeps a 64-stud grid on a touch screen and follows on a computer. WebGPU.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.84",
		date: "2026-11-25",
		headline: "The sky's light at half or a quarter of the pixels.",
		added: [
			"**Sky light resolution**, in Settings › Scene view and the Rendering panel: how much of the sky each surface sees, Sky shadows' work, at every pixel or at Half or Quarter, in the same pass as Light objects resolution's. It saves most on a tablet at a high render scale.",
		],
		changed: [
			"**Dynamic optimization takes the sky's light at half second**, after light objects at half and before bloom.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.83",
		date: "2026-11-25",
		headline: "Hiding one panel from the Panels menu hides only it.",
		fixed: [
			"**Hiding a docked panel from the Panels menu closes only that panel** where others share its side. It hid the whole side, so panels merged into one card and taken apart again hid and showed together. A panel alone on its side still takes the side with it, as before.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.82",
		date: "2026-11-25",
		headline: "Neon glows the same with MSAA, and the corner says where the camera is.",
		fixed: [
			"**With MSAA, Neon's glow is as tight as with every other antialiasing mode, and costs less**: its source is drawn one sample a pixel, and at half size where the quality level or Bloom resolution asks. WebGPU.",
		],
		added: [
			"**Where the camera is, under its rotation in the view's corner**, as Roblox writes a Position, and in Inspect's Copy report: a view in a report can be put back exactly.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.81",
		date: "2026-11-25",
		headline: "Dynamic optimization takes bloom and light objects down a step at a time.",
		changed: [
			"**Dynamic optimization takes four savings in turn while frames do not fit**: light objects at half the pixels, bloom at half, bloom at a quarter, then light objects at a quarter. It gives them back, the last first, once frames fit with room, and never raises a resolution set lower in Settings.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.80",
		date: "2026-11-25",
		headline: "Bloom, shadow maps and textures each have a resolution of their own.",
		added: [
			"**Bloom resolution**, in Settings › Scene view and the Rendering panel: Neon's glow and BloomEffect at the quality level's pixels, or at Full, Half or Quarter.",
			"**Shadow map size**: the sun's maps at the quality level's size, or at 512 to 4,096 texels a side.",
			"**Texture resolution**: the material textures read at their own size, or at Half or Quarter, which a GPU short of memory bandwidth reads faster.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.79",
		date: "2026-11-25",
		headline: "Occlusion culling costs nothing where it cannot help, and Auto where Automatic does not fit.",
		changed: [
			"**Occlusion culling tests only meshes**, where leaving out what is hidden saves work; parts keep being drawn together, and a place without meshes pays nothing for the switch.",
			"**Occlusion culling does no work while the camera moves**, when what it measured could not be used.",
			"**Automatic reads Auto in the Rendering panel where a dropdown or a choice has not the room**, and in full where it has.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.78",
		date: "2026-11-25",
		headline: "Occlusion culling is off at every level.",
		changed: [
			"**Occlusion culling is off at every quality level, on every GPU**: the depth pass it needs measured slower than what it saved on an iPad Mini and on an RTX 40. It stays in Rendering › Switches › Performance, for a place that hides much behind walls.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.77",
		date: "2026-11-25",
		headline: "Probe a spot in the view, and find what is costly at this view.",
		added: [
			"**Probe, in the Rendering panel's Inspect tab**: armed, a tap on the view says which part and material is there, how many light objects reach it and of which kinds, whether the sun reaches it, how much of the sky it sees, and what it costs to shade, and marks the spot.",
			"**What's costly here**: each switch that is on, turned off alone at this view, and the three that save most, each with Turn off.",
		],
		changed: [
			"**The view is no longer dimmed under the Rendering panel on a touch screen**, and still takes a touch to move the camera or probe a spot; its button or the sheet's grab puts the panel away.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.76",
		date: "2026-11-25",
		headline: "Inspect shows what Automatic chose, this frame's time, and a held comparison.",
		added: [
			"**Automatic's choices, in the Rendering panel's Inspect tab**: the renderer, the quality level, the depth path, light objects' resolution and Dynamic, each with what was measured in this place.",
			"**Hold to compare**: pressed and held, it turns back the switch changed last, and lets it go on release.",
			"**This frame**, the frame's time stage by stage, and **Views** as tiles with their legends, in Inspect.",
			"**Copy report**: the version, the browser, Automatic's choices and the start log, to paste into an issue.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.75",
		date: "2026-11-25",
		headline: "A start log says where opening a place stopped, after a freeze.",
		added: [
			"**Start log, in the Rendering panel's Inspect tab**: each step of opening a place or starting the view, with its time, kept in this browser for the last three starts. A start that never finished, because the page froze or was closed, is named at the next start with the step it stopped after. **Copy log** copies it for a report.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.74",
		date: "2026-11-25",
		headline: "The Rendering panel has three tabs, and comes up from the bottom on a tablet held upright.",
		added: [
			"**Picture, Switches and Inspect tabs in the Rendering panel**: the quality level and Scene view settings, the switches and steps, and the gizmos and tools.",
			"**On a touch screen held upright, the Rendering panel is a sheet from the bottom**, so the view stays in sight above it. Drag or tap its grab for Peek, which shows the three switches changed last, Half or Full.",
			"**A search over the switches**, by name or by what they do, and **a group's count turns the whole group on or off**.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.73",
		date: "2026-11-25",
		headline: "The Rendering panel fits a finger, and says what each switch does on a tap.",
		changed: [
			"**Every setting and switch in the Rendering panel has an i** that opens what it does in full, where the panel said it only under a pointer. Scene view's settings say what they are in one line, in Settings and the panel, with the rest behind the same i.",
			"**On a touch screen, every row, choice and button in the Rendering panel is 44 points**, and a tap anywhere on a switch's row turns it on or off.",
			"**Upscaling, Light objects resolution and Renderer show all their choices side by side**, and Dynamic optimization is a switch.",
			"**A switch held off by another says which**: Needs Sky reflections.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.72",
		date: "2026-11-25",
		headline: "Other sites cannot load the daemon's pages.",
		changed: [
			"**The daemon refuses a page that another site embeds or fetches**, as an image, a script or a fetch, before reading any file. Following a link to the editor from anywhere still opens it.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.71",
		date: "2026-11-25",
		headline: "The daemon holds up against unusual requests.",
		fixed: [
			"**The daemon answers a request for a route it does not have with No such route, whatever the name**, and reads an Origin header in time that grows with its length, where a long run of slashes took far longer.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.70",
		date: "2026-11-25",
		headline: "Reports go to Roswaal's own issues.",
		changed: [
			"**Report this, Report something and every docs page's edit button open an issue on Roswaal**, where they opened one on the separate feedback repository.",
		],
		added: [
			"**A Code of Conduct and a security policy**, linked from Contributing: security problems are reported privately through GitHub.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.69",
		date: "2026-11-25",
		headline: "Light objects resolution: measured per place, or Full, Half or Quarter.",
		added: [
			"**Light objects resolution**, in Settings › Scene view and the Rendering panel. Automatic, the default, measures as the view moves whether working out the light of PointLights, SpotLights and SurfaceLights at half the pixels is faster in this place, and keeps it only if so; Full, Half or Quarter set it.",
		],
		changed: [
			"**Levels 1 to 17 no longer halve the light of light objects whatever the place**: half pays only where many lights reach the same pixels, and costs a little elsewhere, so Automatic measures it.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.68",
		date: "2026-11-25",
		headline: "The Rendering panel's light groups say which light they mean.",
		changed: [
			"**The Rendering panel's Light and Lights groups are Environment light and Light objects**: the sun, the sky and Ambient in one, PointLights, SpotLights and SurfaceLights in the other. The step through a frame that adds the second is Light objects too.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.67",
		date: "2026-11-24",
		headline: "The GPU holds only the material textures a place uses.",
		changed: [
			"**Material textures take room on the GPU only for the materials the place uses**, where all forty were kept: a place with three textured materials holds 4 MB of them where it held 54 MB on a computer (14 MB on a touch screen).",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.66",
		date: "2026-11-24",
		headline: "Automatic's depth path is measured in use, and the faster kept.",
		changed: [
			"**The depth path is measured rather than assumed**: the first moving frames in a place alternate drawing the parts' depth first and drawing them in one pass, and the faster is kept, measured again for another place, size or view. Which is faster depends on the GPU and the place. WebGPU.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.65",
		date: "2026-11-24",
		headline: "The sun's far shadows are drawn less often while only the camera moves.",
		changed: [
			"**While only the camera moves, the sun's shadow maps are drawn on a cadence**: the near one every frame, the middle one every second frame, the far one every third, each read as it was drawn. Once the camera stops, the next frame brings them all up to date; the place or the sun changing draws them all at once.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.64",
		date: "2026-11-24",
		headline:
			"Benchmarks measure Dynamic render scale and Dynamic optimization as they work in use.",
		fixed: [
			"**A benchmark with Render scale Dynamic or Dynamic optimization on measures them**: each station starts at Native with no savings, its motions let them settle for three seconds before they are timed, and the report says where each station settled. They had no say in a benchmark, which measured Native.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.63",
		date: "2026-11-24",
		headline: "Neon's glow costs at 150% and Native what it does at 100%.",
		changed: [
			"**Neon's glow and bloom are worked out at the screen's own size, not the render scale's**: where the view draws more pixels than the screen has points, as at 150% or Native on a Retina screen, the glow is found at half the view's size and blurred at a quarter and an eighth. It looks the same, a little softer, for about a quarter of the cost.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.62",
		date: "2026-11-24",
		headline: "Dynamic optimization, and the Scene view settings in the Rendering panel.",
		added: [
			"**Dynamic optimization**, in Settings › Scene view. Off by default. On, while frames do not fit the display, the view takes savings whatever the quality level, the least visible first: today, the lights worked out at half the pixels. It gives them back once frames fit with room. With Render scale Dynamic, the savings go first. WebGPU.",
			"**The Rendering panel offers Frame rate, Render scale, Upscaling, Renderer and Dynamic optimization** beside Quality and Antialiasing, each saved as Settings saves it.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.61",
		date: "2026-11-24",
		headline: "Lamp light at half the pixels at Levels 1 to 17, for speed at high render scales.",
		added: [
			"**Full-resolution light**, a Rendering switch under Lights, on from Level 18. Off, the light of PointLights, SpotLights and SurfaceLights is worked out at half the pixels across and down and filled in, with each edge worked out at full size, so it costs about a quarter as much. WebGPU.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.60",
		date: "2026-11-24",
		headline: "Render scale: Dynamic, fewer pixels while frames do not fit and more once they do.",
		added: [
			"**Render scale: Dynamic.** While the view moves, the place is drawn at fewer pixels when frames do not fit the display's refresh and at more once they fit with room, from Native down to half of it, in five steps and at most twice a second. A still view keeps its step, and on WebGPU the upscaler gathers it back up to Native, so stopping costs no detail. Upscaling comes on, when still, if it was off.",
			"**With Automatic quality, Dynamic moves first**: the level changes only once Dynamic is at Native or at its least.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.59",
		date: "2026-11-24",
		headline: "Steady frame rate: VSync at half the display's rate while frames cannot keep up.",
		added: [
			"**Frame rate: Steady.** VSync, halved while frames miss the display's refresh, so a view the GPU draws at 40 a second shows a smooth 30 rather than stuttering between 60 and 30. It comes back to full rate once frames fit with room to spare.",
		],
		fixed: [
			"**A frame rate the display's refresh does not divide keeps its average**: 24 on a 60 Hz display draws 24 a second, two refreshes and three in turn, where it drew 20.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.58",
		date: "2026-11-24",
		headline: "The Performance panel estimates the GPU memory the view holds.",
		added: [
			"**GPU memory (estimate) in the Performance panel**: the total, and what it is for: frame targets, shadow and sky maps, reflections, images and materials, meshes and parts, other buffers, and the canvas's own. Counted from every texture and buffer the view makes; the browser's own use is not seen, so it is a floor.",
			"**Benchmark and profile reports give it too**, for each station.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.57",
		date: "2026-11-24",
		headline: "Reflections show Decals, Textures and material textures.",
		fixed: [
			"**Scene reflections show the Decals and Textures on solid parts.** The reflections drew the parts alone, as though their images were not there.",
			"**Reflections take on a material's texture once it has loaded, and an image once it has downloaded.** They kept the plain pattern or the bare face until the camera moved on.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.56",
		date: "2026-11-24",
		headline:
			"Settings change the view without sending every asset to the GPU again; panels keep their scroll; downloads keep Roblox's pace.",
		fixed: [
			"**Changing antialiasing between Off, FXAA, SMAA and TAA, or the quality level, keeps the view.** It built the view again, and every mesh and image went to the GPU once more. Only a change to or from MSAA, or of renderer, still does that.",
			"**Two or more panels open in one column no longer jump back to the top** when anything in them changes, such as Performance's numbers.",
		],
		changed: [
			"**Downloads keep to Roblox's pace**: at most four calls at once, and when Roblox says to slow down, every download waits as long as it asks, up to 30 seconds, then tries again, three times at most.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.55",
		date: "2026-11-24",
		headline:
			"The website may download from contentdelivery.roblox.com, where Roblox sends some meshes.",
		fixed: [
			"**Meshes Roblox serves from contentdelivery.roblox.com download on the website.** Its security policy allowed only Roblox's API and CDN, so the browser stopped these before they started.",
		],
		affects: ["editor", "designer", "docs"],
	},
	{
		version: "1.1.0-canary.54",
		date: "2026-11-24",
		headline: "Assets kept already draw first; only the missing ones download.",
		changed: [
			"**A place draws the meshes and images it already has before downloading any.** Roswaal asks which are kept, without asking Roblox, and draws those at once; only the rest download.",
			"**Downloads arrive in small batches, each drawn as it lands**, rather than once all have.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.53",
		date: "2026-11-24",
		headline: "A download that never got an answer says which step and which host.",
		fixed: [
			'**A download the browser or the network stopped names the step and the host**, such as "The download could not be reached (https://…)", where it said only "Failed to fetch". One that timed out says so.',
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.52",
		date: "2026-11-24",
		headline: "Meshes and images download on the website, as canary.50 meant.",
		fixed: [
			'**Downloads on the website no longer fail with "Illegal invocation".** The browser refused how the downloader called its own fetch, which the daemon never minds.',
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.51",
		date: "2026-11-24",
		headline: "Failed downloads say why, and occlusion culling is off on Apple's GPUs as meant.",
		fixed: [
			"**The asset card says why downloads failed**: the commonest reason and how many it stopped, beside the count. The browser's console lists every reason with an asset it happened to.",
			"**A batch of downloads Roswaal refuses as a whole no longer stops the batches after it.**",
			"**Occlusion culling is off on Apple's GPUs unless turned on by hand**, as 1.1.0-canary.28 meant. A mistyped word test matched no GPU, so iPads and Macs had it on.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.50",
		date: "2026-11-24",
		headline: "Meshes and images download on the website too.",
		added: [
			"**Signed in with Roblox on the website, a place's meshes and images are downloaded and drawn**, as with the daemon. Copies are kept in the browser's own storage for the site, shared by the projects you open there, and never written into a project folder. Signing out deletes them all.",
		],
		changed: [
			"**The Privacy Policy says where the website keeps downloads**, and that Settings › Scene view clears them.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.49",
		date: "2026-11-24",
		headline: "The Privacy Policy is right about Cloudflare, and a failed sign-in says why.",
		fixed: [
			"**The Privacy Policy says Cloudflare passes roswaal.app's traffic on**, adding its security headers, and so receives each visit's IP address and request, as GitHub does. It said Cloudflare only answered the domain's DNS.",
			'**A sign-in Roswaal could not finish for lack of a connection to Roblox says so**, where it said only "Failed to fetch".',
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.48",
		date: "2026-11-24",
		headline: "Sign in with Roblox on the website.",
		added: [
			"**Sign in with Roblox works on the website**, from Settings › Roblox account: Roblox's page opens in a new tab, which comes back to roswaal.app's own sign-in page and closes. The sign-in is kept in the browser's own storage for the site; Roswaal has no server that sees it. Downloading a place's meshes and images on the website comes next.",
		],
		changed: [
			"**The Privacy Policy says where the website keeps the sign-in**, beside where the daemon keeps it.",
			"**Render scale's help says browser zoom counts too**, as Native follows it.",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.47",
		date: "2026-11-24",
		headline: "The Roblox account is Roswaal's own, and Render scale says what Native is here.",
		changed: [
			"**Settings › Roblox account is first under This browser**, Roswaal's own rather than the Place Editor's, so whatever fetches from Roblox can use it. What it downloaded for the Place Editor is listed on Scene view.",
			"**Render scale says what Native comes to on your screen**: Native (200%) on a Retina screen, Native (100%) on an ordinary one. A share your screen cannot reach says it draws Native.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.46",
		date: "2026-11-24",
		headline: 'No false "Roswaal stopped while starting" when coming from the docs.',
		fixed: [
			'**Opening the editor from the docs no longer flashes "Roswaal stopped while starting".** The browser sometimes gives up on the crossfade between the pages and says so, which the start-up check took for a failure while the editor was still opening.',
		],
		affects: ["editor", "designer"],
	},
	{
		version: "1.1.0-canary.45",
		date: "2026-11-24",
		headline: "Fewer and smaller hitches while the camera flies.",
		changed: [
			"**The sky's maps round the camera are drawn again less often, and in smaller pieces.** They move once the camera is 64 studs from their middle, to a place ahead of where it is going, about every 120 studs where it was every 48; and WebGPU draws them one map a frame, where it was two.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.44",
		date: "2026-11-24",
		headline: "Neon's glow costs less, and an A/B run's status line is right.",
		changed: [
			"**Neon's glow and bloom cost less**: their wide blur is worked out at a quarter of the view's size, where it was half. It looks the same.",
		],
		fixed: [
			"**An A/B run's status line shows each time beside the switch it was measured with.** It showed the last time beside the next switch's name.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.43",
		date: "2026-11-24",
		headline: "Sun shadows cost less where they are plain.",
		changed: [
			"**The sun's sharp shadows read the shadow map less**: a face turned from the sun does not look its shadow up at all, and a point plainly in sun or shade takes four of the eight samples, the soft edges of shadows all eight. The pictures are the same.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.42",
		date: "2026-11-24",
		headline: "Particles' quads are built on the GPU.",
		changed: [
			"**Particles take less of the page's time each frame**: each is sent to the GPU once, and the GPU builds its quad, turned by its Orientation and rotation, in both renderers. 20,000 particles went from 3.4 to 2.6 ms on a desktop, and send less to the GPU.",
			"**Particles with LightEmission 1 are no longer sorted**: drawn added, they look the same in any order.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.41",
		date: "2026-11-24",
		headline: "The open place's 3D view lets go of the GPU while a benchmark runs.",
		fixed: [
			"**A benchmark run beside a large open place no longer runs a tablet out of memory.** The place's 3D view is let go while the run draws and built again after it; on an iPad, the two together had kept WebGPU from starting and the tab crashed.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.40",
		date: "2026-11-24",
		headline: "A benchmark run says when it was drawn by WebGL2 instead of WebGPU.",
		added: [
			"**A benchmark run drawn by WebGL2 because WebGPU did not start says so**, with the reason, on its end screen and in its report. Its times do not compare with a WebGPU run's.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.39",
		date: "2026-11-24",
		headline: "Profiles and benchmark runs say when a place's meshes were not drawn.",
		added: [
			"**A profile and a benchmark station say how many meshes, unions and images were not loaded.** Those parts are drawn as boxes, so the times leave their cost out: on the website, which has no Sign in with Roblox, that is every mesh.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.38",
		date: "2026-11-24",
		headline: "Particles sorted faster, and the benchmark splits their CPU time.",
		changed: [
			"**Particles take less of the page's time each frame**: they are put in drawing order by one number each, which the browser sorts much faster. 20,000 particles went from 4.6 to 3.4 ms on a desktop.",
		],
		added: [
			"**The benchmark's report splits the effects' CPU time** into stepping the particles, sorting them, laying out their quads and sending them to the GPU.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.37",
		date: "2026-11-23",
		headline: "Shaders built ahead after an update, and a start that says why it is slow.",
		added: [
			"**Shaders**, in Settings › Scene view: whether the last update changed them, and **Build now**, which builds every quality level's shaders for the open place, so changing level waits for none.",
			"**Build after an update**, on by default, builds them in the background a few seconds after a place opens, once after each update that changed them.",
		],
		changed: [
			'**The 3D view\'s start says "new in this update"** while it builds shaders the browser does not have yet.',
		],
		fixed: [
			"**Pixel cost's depth-only times no longer include the glow and post pass**, which made the parts' depth look twice as costly at stations with Neon or post effects.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.36",
		date: "2026-11-23",
		headline: "The benchmark waits for its view to start after an update.",
		fixed: [
			'**A benchmark run no longer stops with "The view did not start" after an update.** On an iPad the browser builds every shader afresh, which took longer than the 20 seconds the run waited. It now waits while the view is starting, says so, and names the reason if the view fails.',
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.35",
		date: "2026-11-23",
		headline: "Upscaling: a still view at the screen's own detail, drawn at a lower render scale.",
		added: [
			"**Upscaling**, in Settings › Scene view: where the render scale draws fewer pixels than the screen has, the view brings them up itself. **When still** gathers 16 frames, each a fraction of a pixel aside, into the screen's own pixels once the view stops, close to Native's detail at the render scale's cost; a moving view is stretched. **Always** also sharpens moving frames. WebGPU only; off by default.",
			"**Upscaling** is a stage of its own in the profile and the benchmark's GPU times.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.34",
		date: "2026-11-23",
		headline: "Quality Level 18 draws at 150%, and the benchmark measures what a pixel costs.",
		changed: [
			"**Quality Level 18 draws at 150%** of the page's pixels, Native from Level 19. On a Retina screen Native is four times 100%'s pixels, and an iPad's frame time quadrupled at Level 18.",
			"**Render scale** has 150%.",
		],
		added: [
			"**Pixel cost**, in Settings › Scene view › Benchmark, times every station at each render scale the screen has, shaded and as the parts' depth alone, and reports what a frame costs however few pixels it has and what each pixel adds, by GPU stage.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.33",
		date: "2026-11-23",
		headline: "Converting a place keeps its Expanded Terrain.",
		fixed: [
			"**Converting a place between .rbxl and .rbxlx keeps its Expanded Terrain.** Roswaal now reads and writes AssetContentMap, where Roblox keeps the terrain's voxels; a converted place lost them. A map only in an uploaded bundle cannot be written to .rbxlx, and the export says so.",
		],
		changed: ["**Properties** shows an AssetContentMap as its number of entries and their size."],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.32",
		date: "2026-11-23",
		headline: "A place's AssetContentMap properties are named in what Roswaal leaves out.",
		fixed: [
			"**A place file's AssetContentMap properties** are named as such where Roswaal lists what it left out, rather than as type 35.",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.31",
		date: "2026-11-23",
		headline: "A web page that fails to start says so, rather than staying blank.",
		changed: [
			"**The editor, the designer and the docs show what went wrong when they fail to start**: an error, a file that did not load, or a start that has not finished 10 seconds after the page loaded. The screen gives the details to copy, a reload and, for a stuck start, a way to forget the folders remembered from earlier visits.",
		],
		affects: ["editor", "designer", "docs"],
	},
	{
		version: "1.1.0-canary.30",
		date: "2026-11-23",
		headline:
			"The web editor starts again in Edge 158 with a folder remembered from an earlier visit.",
		changed: [
			"**The web editor no longer waits on a remembered folder the browser does not answer for.** Edge 158 stopped answering for a folder kept from an earlier session, and try.html and the designer stayed blank. After two seconds the editor starts, and the folder is offered by name to open with a click.",
		],
		affects: ["editor", "designer"],
	},
	{
		version: "1.1.0-canary.29",
		date: "2026-11-22",
		headline: "The Place Editor is 0.22.0: DoubleSided MeshParts, and Roswaal Benchmark 4.",
		changed: [
			"**A MeshPart with DoubleSided on is drawn from behind too**, in both renderers, as Studio draws it: a single sheet, such as a tank's side skirt, no longer disappears when seen from its back.",
			"**Roswaal Benchmark 4** is Benchmark 3 with the tanks' skirts and tracks DoubleSided, as their models have them. Its scores do not compare with Benchmark 3's.",
			"**The Place Editor is 0.22.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.28",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.21.0: Occlusion culling starts off on Apple's GPUs, and a benchmark's second pass is its warm pass.",
		changed: [
			"**Occlusion culling starts off on Apple's GPUs** at every quality level. Measured on an iPad, it cost 0.7 to 2.6 ms at almost every benchmark station and saved nothing at any. It can still be turned on in the Rendering panel.",
			"**Each station twice is now Warm pass.** Scores and comparisons come from the first pass, and the report shows how much slower each station was once the device had warmed up.",
			"**The Place Editor is 0.21.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.27",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.20.0: a benchmark A/B of one render switch, and mipmapped Decals and Textures.",
		changed: [
			"**A/B a switch**, in Settings › Scene view, measures every benchmark station with one Rendering panel switch on, off, on and off, back to back, and says what the switch saves or costs at each.",
			"**The benchmark draws with the Rendering panel's switches**, where it drew with every switch on. Its report names any that are off.",
			"**Decals and Textures are mipmapped in WebGPU**, as in WebGL2: a far face no longer sparkles, and its image costs less to draw.",
			"**The Place Editor is 0.20.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.26",
		date: "2026-11-22",
		headline: "The Place Editor is 0.19.0: Roswaal Benchmark 3, with real models and textures.",
		changed: [
			"**Roswaal Benchmark 3** adds two stations. Meshes draws 96 tanks as 1,788 MeshParts, Teensy Tiny Tankery models by MayLizbeth (\"extraclear\") under CC BY 4.0. Textures puts Kenney's prototype textures, CC0, on every face of a wall of blocks. Its scores do not compare with Benchmark 2's.",
			"**The benchmark carries its own models and textures**, fetched when a run first needs them. They are never asked of Roblox, and no sign-in is needed.",
			"**Roswaal reads binary glTF (.glb) files**: their meshes, with positions, normals and texture coordinates, for the benchmark's tanks.",
			"**The Place Editor is 0.19.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.25",
		date: "2026-11-22",
		headline: "The Place Editor is 0.18.1: Benchmark 2 reads times between a coarse clock's steps.",
		changed: [
			"**Benchmark 2's times are the mean of each set's middle 80%**, not its median, so they fall between a clock's steps: Safari counts in whole milliseconds, and a fast GPU's timer in steps of about 0.067 ms.",
			"**Comparing runs of two different benchmarks** now says they cannot be compared, rather than giving a drift and noise for scenes measured differently.",
			"**The Place Editor is 0.18.1.**",
		],
		affects: ["editor"],
	},
	{
		version: "1.1.0-canary.24",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.18.0: Roswaal Benchmark 2, which times its scenes with the GPU kept busy.",
		changed: [
			"**Roswaal Benchmark 2** draws Benchmark 1's scenes with two frames in flight, the next always queued, rather than one at a time. An iPad's GPU slowed itself in the gaps, so 1 light and 100 took the same time, and an empty scene 7.7 ms in one pass and 13.8 ms in the next. Its scores do not compare with Benchmark 1's.",
			"**Its report gives the time between frames**, rather than a frame waited for, beside the GPU's own time.",
			"**The camera moves by the clock in a benchmark and a profile**: each motion runs for one second at the same speed on every device. It moved a set step each frame, so a GPU drawing 280 frames a second spun it four times as fast as an iPad.",
			"**The Place Editor is 0.18.0.**",
		],
		affects: ["editor", "docs"],
	},
	{
		version: "1.1.0-canary.23",
		date: "2026-11-22",
		headline:
			"The Place Editor is 0.17.1: a benchmark comparison calls a change only past three deviations of the noise.",
		changed: [
			"**A benchmark comparison's noise band is three deviations, not two**, and a run measured once is taken to be as noisy as the other run's two passes, the two noises added. Comparing two iPad runs where nothing drawn had changed, two of eighteen stations were called changed; now none are.",
			"**The Place Editor is 0.17.1.**",
		],
		affects: ["editor"],
	},
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
