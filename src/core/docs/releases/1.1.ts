/**
 * Release notes for 1.1: 1.1.0, its patches, and the canary builds leading to
 * each, newest first.
 *
 * One of the files `../releases.ts` puts together, a minor version each.
 */

import type { Release } from "../releases.js";

export const RELEASES_1_1: Release[] = [
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
