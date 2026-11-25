/**
 * The `settings` page of the documentation. `buildSite` places it.
 */

import { defaultConfig } from "../../schema.js";
import { CODE_ROLES, ROLES } from "../../theme.js";
import { BUILTIN_THEMES } from "../../themeData.js";
import type { DocPage } from "../site.js";

/**
 * Settings and themes.
 *
 * Half of this page is generated, for the reason the node reference is: the
 * lists it carries are the real ones. The `roswaal.json` defaults come from
 * `defaultConfig()`, the theme roles from `ROLES`, and the table of shipped
 * schemes from the schemes themselves — so a default that changes, a role that
 * is added, or a palette that is dropped from a fork cannot leave this page
 * quietly describing the version before.
 */
export function settingsPage(): DocPage {
	const defaults = defaultConfig();

	return {
		slug: "settings",
		narrow: true,
		title: "Settings and themes",
		summary: "What is a project setting, what is yours, and how a colour scheme is written.",
		blocks: [
			{
				t: "p",
				text:
					"There are two kinds of setting and they behave differently, which is worth " +
					"getting straight before changing either. **Project settings** are " +
					"`roswaal.json`: committed, shared by everyone working on the repository, and " +
					"they change what the compiler does. **Preferences** are yours — stored in " +
					"your browser, never written to the project, and invisible to everybody else.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"Both are edited from **Settings**, which lists its pages under where they are kept, " +
					"so a personal colour scheme stays out of pull requests.",
			},
			{
				t: "table",
				head: ["Page", "Kept in", "What is on it"],
				rows: [
					[
						"**Compiling**",
						"`roswaal.json`",
						"Where graphs and Luau live, how a graph compiles, indentation, where Wally's packages are kept synced, scripts with children, and Studio betas the Luau can use",
					],
					["**Node packs**", "`roswaal.json`", "The directories scanned for node packs"],
					[
						"**Roblox account**",
						"This computer, or this browser on the website",
						"Sign in with Roblox, for what Roswaal fetches from Roblox: today the meshes and images the Place Editor draws, kept in the project with `roswaal serve` or in this browser on the website",
					],
					["**Canvas**", "This browser", "The grid, wires, node corners, and what scrolling does"],
					[
						"**Nodes**",
						"This browser",
						"Long names, class icons on nodes, and what a new logic, cast or concatenate node starts as",
					],
					[
						"**Workspace**",
						"This browser",
						"Writing a graph, the Variables panel, function tabs, the action row, and what opens first",
					],
					["**Themes**", "This browser", "The colour scheme"],
					["**Docs**", "This browser", "The docs' font and the size of their pictures"],
					[
						"**Place Editor**",
						"This browser",
						"An extension: its version, its switch, what it adds and its release notes. Its pages are listed under it while it is on",
					],
					[
						"**Scene view**",
						"This browser",
						"Under Place Editor. How a place is drawn in 3D: the renderer, the selection outline, Alt-click, Glass and post effects, the shaders, the benchmark, and what Sign in with Roblox downloaded into the project",
					],
				],
			},
			{
				t: "p",
				text:
					"**Search settings**, at the top of the list, finds a setting on any page by its name " +
					"or by what it does; Esc clears it, and Esc again closes Settings. Node Design has no " +
					"project to change, so its Settings has no project pages; the docs' has only Themes " +
					"and Docs, and says the rest is in the editor.",
			},

			{ t: "h", level: 2, text: "Project settings" },
			{
				t: "p",
				text:
					"Written to `roswaal.json` in the project root. `roswaal init` writes the " +
					"defaults out; every one of them is optional in a hand-written file.",
			},
			{
				t: "table",
				head: ["Key", "Default", "What it does"],
				rows: [
					[
						"`target`",
						`\`${defaults.target}\``,
						"Which flavour of Luau new graphs compile for. `lune` is **experimental**, and not yet tested by an experienced Lune developer; it drops the Roblox globals and nodes.",
					],
					[
						"`sourceDir`",
						`\`${defaults.sourceDir}\``,
						"Where `.nodescript` and `.nodemap` files are read from.",
					],
					[
						"`outDir`",
						`\`${defaults.outDir}\``,
						"Where generated `.luau` is written. This is the directory Rojo syncs.",
					],
					[
						"`compileMode`",
						`\`${defaults.compileMode}\``,
						"`hot` recompiles a graph every time it is written, which is every edit; `manual` waits to be asked. The editor shows these as **Dynamic** and **Manual** — the stored name is `hot` for the sake of every `roswaal.json` already written.",
					],
					[
						"`nodePaths`",
						`\`${JSON.stringify(defaults.nodePaths)}\``,
						"Directories scanned for `.nodedef.json` node packs.",
					],
					[
						"`format`",
						`\`${defaults.format}\``,
						"Run stylua over generated files when it is on PATH. When it is not, the file is written unformatted rather than not written.",
					],
					[
						"`comments`",
						"`true`",
						"Write each comment's header into the generated Luau, above the code of the nodes it is drawn around. A header of one line is written `-- like this`, one of several as a `--[[ ]]` block. Off keeps them in the editor, which is what other visual scripting tools do — see [Coming from Blueprints](coming-from-blueprints) if that is the habit you have.",
					],
					[
						"`castsByHierarchy`",
						"`false`",
						"An Implicit Cast inside an **Is A** branch is always left out when the branch proved exactly its classes. On, it is also left out when the branch proved a class derived from the one it casts to — **Is A** `Part` covering a cast to `BasePart`.",
					],
					[
						"`conditionalBindings`",
						"`false`",
						"**Settings › Compiling**, under Studio betas. On, a Branch or While Loop with Bind on writes `if local`, `elseif local` and `while local`. They need Studio's If Local/Const Bindings beta. Off, Bind writes plain Luau that runs everywhere: the value in a local, then the test.",
					],
					[
						"`indentStyle`",
						`\`${defaults.indentStyle}\``,
						"What one level of indentation is in the generated Luau: `tab`, or `space`. Handed to stylua as well when `format` is on, so this decides rather than whatever `stylua.toml` says.",
					],
					[
						"`indentWidth`",
						`\`${defaults.indentWidth}\``,
						"How many spaces one level is, when `indentStyle` is `space`. Ignored otherwise, except that stylua is told it so a tab still counts the right amount against its column limit.",
					],
					[
						"`rojoProject`",
						"unset",
						"No longer read. An older `roswaal.json` may carry it, and it still loads. The Rojo project file is written by a node map, at the map's own **Output** — `default.project.json` unless it says otherwise — and only over a file Roswaal wrote, or one you hand over with force.",
					],
					[
						"`place`",
						"unset",
						"The project's place file, set by `roswaal import`. Unset, a `.rbxl` or `.rbxlx` in the project root, `place.rbxl` first.",
					],
					[
						"`schemaVersion`",
						"set for you",
						"Which schema the file was written against. `migrate.ts` reads it.",
					],
				],
			},

			{ t: "h", level: 2, text: "Preferences" },
			{
				t: "p",
				text:
					"Stored in this browser under one key, and nowhere else. They do not follow " +
					"you to another machine, which is the right thing to give up: the " +
					"alternative is a per-developer file in a shared checkout.",
			},
			{
				t: "table",
				head: ["Preference", "What it does"],
				rows: [
					[
						"Theme",
						"The colour scheme, or **Follow the system** — which is the absence of a theme rather than a scheme of its own, so the app keeps changing with your OS.",
					],
					[
						"Wires",
						"**Curved** is a bezier out of each pin, and the default. **Rigid** turns at right angles only. **Angular** leaves the pin level, takes one straight run to the other end, and arrives level — a diagonal rather than a cut corner. Where the input is *behind* the output there is no straight line to take, so angular borrows rigid's lane out and back, with its corners cut.",
					],
					[
						"Node corners",
						"Rounded or square. Capsule getters and reroute knots keep their shapes either way — a pill and a circle are what say *this is a value* and *this is a bend in the wire*, and neither has a title to say it instead.",
					],
					[
						"Grid",
						"The pattern behind a graph, on the canvas, in Node Design and on the start page. **Dots**, the default, puts a dot at every point Shift-drag snaps a node to, and leaves the nodes and wires the strongest thing on the canvas. **Lines** rules the canvas as Roswaal did before 0.150.0, every fifth line heavier, for anyone who lines nodes up by eye. Zoomed far out either keeps only every fifth.",
					],
					[
						"Grid contrast",
						"How strongly the grid draws. **Auto**, the default, is light, and strong when your system asks for more contrast. **Light** is faint, there when you look for it; **Standard** is easier to see on a bright screen; **Strong** is clearly visible, with larger dots, for low vision or a washed-out display. The grid only decorates: nothing about a graph is shown by it alone.",
					],
					[
						"Long names",
						"**Truncate** cuts a header too long for its node short, with the whole of it in the tooltip — what nodes have always done. **Widen** draws the node wide enough for its header instead. It is the one of these looks that moves *pins*, so the wire router and the pictures on these pages are computed from the same width: a node and its own picture are never two different sizes.",
					],
					[
						"New concatenate nodes",
						"What a new **Concatenate** writes: a **join** with `..`, or an **interpolated string**, where a part typed into the node is text and a part wired in is a hole in braces. The same string either way, and both are Luau, so the choice is about how the line reads. Stored **on the node**, as the brackets are — this only decides what one you drop today starts as, and **Concatenation Type** in the Inspector changes any of them.",
					],
					[
						"New logic nodes",
						"Whether a new **And**, **Or**, **Not**, comparison or arithmetic pill starts out bracketing its expression. Only the starting point: whether a node brackets is stored **on the node**, so it travels with the graph and reads the same on everybody's machine. Precedence is handled either way — this is about how the line reads, never about what it means. The casts are pills too and are not offered it: `(value :: T)` brackets itself already.",
					],
					[
						"Column buttons",
						"The Project and Inspector buttons in the top bar. **Hidden** by default: **Left column** and **Right column** are in the Panels menu either way. On a tablet they open the columns' drawers, and Hidden holds there too. A phone keeps its own at the ends of the bottom bar.",
					],
					[
						"Shorten function tabs",
						"What a function's tab says. **None** keeps `ƒ hide (Occupancy)`; **Function name** and **Script name** keep one of the two. The tooltip has both.",
					],
					[
						"Class icons",
						"Every engine class and Roblox datatype has an icon in the colour of its purpose, in the type picker and the DataModel panel. **Filled**, the default, or **Outline**.",
					],
					[
						"Class icons on nodes",
						"A node that names a class shows its icon in the header, in the header's text colour: Get Service and Service Function show the service, New Instance and the Find Firsts the class. A class read off a wire shows none. **Shown** by default. A wide node keeps the icon's room either way, so turning it off moves no pin.",
					],
					[
						"Class icons in class pickers",
						"A node's class picker shows the class's icon before its name, in its purpose's colour. **Hidden** by default, as it shortens the name.",
					],
					[
						"Group classes",
						"How a list of classes is headed. **By purpose**, the default, puts every sound class together and every interface class together. **By family** puts each under its ancestor just below `Instance`, as before 0.221.0.",
					],
					[
						"Write a graph",
						"How long after your last edit a graph is written. A delay, not a switch — there is no unsaved copy of a graph, so switching it off would give you a document that quietly stops matching itself rather than a buffer.",
					],
					[
						"Exporting",
						"What the Export menu starts with: zip or place, compile first, Modify RBXL, and the place's format. Kept in `roswaal.json`.",
					],
					[
						"Modify DataModel Instances",
						"Off by default. On, **Properties** changes values in the place file and **DataModel** adds, moves and deletes instances, after a backup. See Places and Rojo.",
					],
					[
						"Renderer",
						"What draws the place in 3D: **Automatic**, WebGPU where the browser has it and WebGL2 where it does not; **WebGPU**, falling back to WebGL2 where there is none; or **WebGL2**. The place's Properties has it too.",
					],
					[
						"Quality",
						"As Studio's quality levels: **Automatic**, the default, or **Level 1** to **Level 21**. A level sets how far parts are drawn, how far the sun's shadows reach, which effects are on, and the render scale and antialiasing where those are Automatic. Automatic starts from the device (a phone at 5, a tablet at 10, a laptop's built-in GPU at 15, other computers at 21) and moves a level down or up with how fast frames are drawn. The Rendering panel has it too.",
					],
					[
						"Frame rate",
						"The most the 3D view is drawn a second while it moves: 24 to 240, **VSync** to match the display, the default, **Steady**, VSync at half the display's rate while frames cannot keep up, or **Unlimited**. It is drawn only when something changes either way. The place's Properties has it too.",
					],
					[
						"Render scale",
						"How many pixels the place is drawn at, across and down, as a share of the page's own: **Automatic**, the default, is the quality level's (50% at Levels 1–2, 75% at 3–9, 100% at 10–17, 150% at 18, Native from 19); **Dynamic**, fewer pixels while frames do not fit the display and more once they fit, from Native down to half of it, a still view gathered back up to Native on WebGPU; **Native**, every pixel the screen has, with what that comes to on your screen beside it (200% on a Retina screen, 100% on an ordinary one; browser zoom counts too); or **150%**, **100%**, **75%** or **50%**. A share past the screen's own pixels draws Native, and says so. Fewer is faster where filling pixels is the cost, as it is on a tablet.",
					],
					[
						"Shaders",
						"The browser keeps the shaders it builds, so only the first start after an update that changes them is slower; the view says so while it starts. **Build now** builds every quality level's shaders for the open place, so changing level, or Automatic doing so, waits for none. **Build after an update**, on by default, does that in the background a few seconds after a place opens. WebGPU only.",
					],
					[
						"Upscaling",
						"Where the render scale draws fewer pixels than the screen has, the view brings them up itself rather than the browser stretching them. **Off**, the default; **When still**: once the view stops moving, 16 frames drawn a fraction of a pixel apart are gathered into the screen's own pixels, about the detail Native draws, at the render scale's cost, and a moving view is stretched; or **Always**, which sharpens moving frames as well. WebGPU only; WebGL2 stretches as before.",
					],
					[
						"Light objects resolution",
						"How many pixels the light of PointLights, SpotLights and SurfaceLights is worked out at. **Automatic**, the default, measures as the view moves whether half the pixels is faster in this place, and keeps it only if so; it pays where many lights reach the same pixels. **Full**, **Half** or **Quarter** set it. Above 100% render scale, Half works it out at no fewer pixels than the screen has points, so surfaces stay sharp. WebGPU.",
					],
					[
						"Light object grid",
						"Light objects worked out once into three grids round the camera, of cells **8**, **16** or **32 studs** and twice and four times that, again only when the lights change or the camera moves on, rather than by each pixel each frame. Each pixel blends the cells round it and turns the light to its own face, so edges stay sharp; the light's fall softens to the cells' size, and it costs the same however many lights there are. **Automatic**, the default, follows the place's LightingStyle: **Soft**, 4-stud cells with the light flat, a face lit whichever way it turns, as Studio draws it; **Realistic**, every pixel works out its own. **Off** has every pixel work out its own. WebGPU.",
					],
					[
						"Sky light resolution",
						"How many pixels the sky's light and shadow, Sky shadows' work, are worked out at. **Full**, the default, is every pixel; **Half** or **Quarter** works it out at fewer, in the same pass as Light objects resolution's, and reads it back where each pixel's distance agrees. It saves most on a tablet at a high render scale. WebGPU.",
					],
					[
						"Bloom resolution",
						"How many pixels Neon's glow and the place's BloomEffect are worked out at. **Automatic**, the default, is the quality level's: half the pixels at Level 12 and below, and a quarter where the view has more pixels than the screen has points. **Full**, **Half** or **Quarter** set it; fewer pixels are a little softer.",
					],
					[
						"Shadow map size",
						"How many texels a side the maps the sun's shadows are drawn into have. **Automatic**, the default, is the quality level's: 512 to Level 9, 1,024 to 12, then 2,048. **512** to **4,096** set it: bigger is sharper and costs time and memory, 64 MB a map at 4,096.",
					],
					[
						"Particle animation rate",
						"How often moving particles and beams are drawn while the camera is still: every display frame (**Full**), or one in two, three or four (**Half**, **Third**, **Quarter**). Each of those frames draws the whole place, so fewer let a tablet rest between them and stay cool; moving the camera draws at full rate at once. **Automatic**, the default, is Half on a touch screen and Full on a computer.",
					],
					[
						"Particle resolution",
						"Pixels particles and beams are drawn at. **Half** draws them at half the pixels across and down, a quarter as many, into a layer laid over the place, smoothed: smoke and sparks that cover much of the view cost far less, and their edges against the parts in front soften a little. Where the place has no Neon glow, bloom or post effects, they are drawn at **Full**, the default. WebGPU.",
					],
					[
						"Surface reflection accuracy",
						"How closely reflections follow the camera. **Exact** draws the place round the camera again each 8 studs it moves, a cost while it moves; a **32**, **64** or **128-stud grid** draws one the first time the camera enters each cell, keeps the last eight and reads the one for where the camera is, which costs nothing once drawn and is less exact. **Automatic**, the default, is Exact on a computer and a 64-stud grid on a touch screen. WebGPU.",
					],
					[
						"Texture resolution",
						"The detail the material textures are read at. **Full**, the default, is their own size; **Half** and **Quarter** read their smaller copies, which a GPU short of memory bandwidth reads faster. On WebGPU, Decals and Textures too.",
					],
					[
						"Dynamic optimization",
						"Off by default. On, while frames do not fit the display, the view takes savings whatever the quality level, the least visible first: light objects at half the pixels, the sky's light at half, bloom at half and then a quarter, light objects at a quarter. It gives them back, the last first, once frames fit with room. With Render scale **Dynamic**, the savings go first. WebGPU. The Rendering panel offers it too, with Frame rate, Render scale, Upscaling and Renderer.",
					],
					[
						"Antialiasing",
						"Smooths parts' edges. **Automatic**, the default, is the quality level's: off below Level 10, FXAA to 12, then SMAA; no level multisamples, so MSAA is chosen here. Or **Off**; **FXAA** or **SMAA**, a pass over the finished frame, cheap on a tablet; **MSAA 2×**, **4×** or **8×**, samples a pixel, as far as the renderer goes (WebGPU has 4× only); or **Still-frame TAA**, which averages 16 frames a fraction of a pixel apart once the view is still. The Rendering panel has it too. The view is made again when it changes.",
					],
					[
						"Selection outline",
						"How wide the outline round what is picked is drawn: **Thin**, **Medium** or **Thick**.",
					],
					[
						"Hidden edges",
						"Whether the outline shows through the parts in front of it, as Studio's does, or is hidden by them.",
					],
					[
						"Alt-click",
						"Off by default: `Alt` + click picks the part, as in Studio. On, each `Alt` + click, or long press, picks one Model further in, down to the part. `Shift` + click still picks the part.",
					],
					[
						"Glass",
						"On by default. See-through Glass hides the see-through parts behind it, as Studio's does, and places are often built around that. Off, they show through it.",
					],
					["On opening Roswaal", "Reopen the last project, or start at the picker."],
					[
						"Docs font",
						"The face the docs are read in: **System**, **Serif**, **Wide** or **Monospace**. Code keeps its own.",
					],
					[
						"Preview size",
						"How large node and graph pictures are drawn in the docs, from 50% to 300%. A graph bigger than its frame can be dragged around.",
					],
				],
			},

			{
				t: "note",
				kind: "info",
				text: "**Wires, node corners and the grid change how a graph looks, never what it compiles to.**",
			},

			{ t: "h", level: 2, text: "Themes" },
			{
				t: "p",
				text:
					"One JSON file per scheme, in `themes/` at the repository root, naming every " +
					"colour the scheme sets.",
			},
			{
				t: "table",
				head: ["Scheme", "Credit", "Licence"],
				rows: BUILTIN_THEMES.filter((t) => !t.hidden)
					.sort((a, b) => a.order - b.order)
					.map((t) => [
						t.name,
						t.credit ?? "—",
						t.licence
							? `${t.licence.spdx}, in full under Settings → Licences`
							: "0BSD, with the repository",
					]),
			},
			{
				t: "h",
				level: 3,
				text: "Adding one",
			},
			{
				t: "p",
				text:
					"Copy the closest scheme, rename it after the slug of its new name, and edit. " +
					"Every field is required — there is deliberately no inheritance, because a " +
					"half-defined palette silently borrowing another one's colours is far harder " +
					"to debug than a missing-key error.",
			},
			{
				t: "code",
				lang: "json",
				text: JSON.stringify(
					{
						name: "My Theme",
						order: 7,
						dark: true,
						credit: "You",
						colors: { app: "#16181d", panel: "#1b1e24", "…": "…" },
						code: { keyword: "#c98fd0", string: "#8fce9b", "…": "…" },
					},
					null,
					2,
				),
			},
			{
				t: "p",
				text:
					"`npm run build:themes` compiles `themes/` into the bundle and refuses to " +
					"build a scheme that would not work. What it checks is worth knowing before " +
					"you hit it:",
			},
			{
				t: "ul",
				items: [
					"Every role is present, and every colour is a full `#rrggbb`. No short form, no names, no alpha.",
					"`dark` agrees with the actual brightness of `app`. It is not a description — every overlay is derived from it — so a scheme claiming `true` on a light ground would paint white onto white and make every hover state invisible.",
					"A node is distinguishable from the canvas it sits on.",
					"Body text clears 4.5:1 against both `app` and `panel`, and the quieter text roles clear their own lower bars.",
					"Syntax colours are visible on the surface code is shown on. `comment` is held to a lower bar than the rest on purpose — every serious syntax theme mutes its comments, and that is the author's decision rather than a mistake to correct for them.",
				],
			},

			{ t: "h", level: 3, text: "What a theme sets" },
			{
				t: "table",
				head: ["Role", "What it colours"],
				rows: [
					...ROLES.map((r) => [`\`${r.role}\``, r.what]),
					...CODE_ROLES.map((r) => [`\`code.${r.role}\``, r.what]),
				],
			},

			{ t: "h", level: 3, text: "What it does not" },
			{
				t: "p",
				text:
					"**Node category colours and pin type colours are fixed.** Red is a boolean, " +
					"green is a number, gold is a vector — that mapping is most of what makes a " +
					"Roswaal graph readable at a glance, and a scheme " +
					"that moved it would be trading the one thing the colours are for against a " +
					"matter of taste. They live in `palette.ts` and stay there.",
			},
			{
				t: "p",
				text:
					"**Hover, the grid, the watermark and the node shadow are not authored " +
					"either.** They are overlays — a translucent white or black over whatever is " +
					"underneath — and an overlay is the one kind of token an author gets wrong " +
					"without seeing it, because the mistake is invisible on the surface they " +
					"happened to be looking at. They are computed from `dark` instead, so a " +
					"palette cannot ship a hover state that does not show.",
			},
			{
				t: "note",
				kind: "warn",
				text: "A data wire takes its pin's colour, not a theme's. Themes have no data-wire role.",
			},
		],
	};
}
