/**
 * The Place Editor's settings, declared for Settings to draw, and typed for the
 * code that reads them.
 *
 * Each was a field of the editor's `Preferences` before the viewer was an
 * extension; `legacy` names it, so the first read carries it over.
 */

import type { SettingGroup } from "../manifest.js";
import type { AntialiasMode } from "./app/viewport/antialias.js";

/** The place's selection outline, by name, in CSS pixels. */
export const OUTLINE_WIDTHS = { thin: 2, medium: 3.5, thick: 5 } as const;
export type OutlineWidth = keyof typeof OUTLINE_WIDTHS;

/** What draws the place in 3D, by name. */
export const VIEWPORT_RENDERERS = [
	{ value: "auto", label: "Automatic" },
	{ value: "webgpu", label: "WebGPU" },
	{ value: "webgl2", label: "WebGL2" },
] as const;
export type ViewportRenderer = (typeof VIEWPORT_RENDERERS)[number]["value"];

/**
 * How often the place is drawn, at most, while it moves: frames a second, the
 * display's own rate, or as fast as it will go. It is drawn only when it
 * changes either way.
 */
export const VIEWPORT_FRAME_RATES = [
	{ value: "24", label: "24" },
	{ value: "30", label: "30" },
	{ value: "60", label: "60" },
	{ value: "120", label: "120" },
	{ value: "144", label: "144" },
	{ value: "165", label: "165" },
	{ value: "180", label: "180" },
	{ value: "240", label: "240" },
	{ value: "vsync", label: "VSync" },
	{ value: "steady", label: "Steady" },
	{ value: "unlimited", label: "Unlimited" },
] as const;
export type ViewportFrameRate = (typeof VIEWPORT_FRAME_RATES)[number]["value"];

/**
 * Quality: Automatic, or a level, as Studio's QualityLevel. Each level sets
 * the Rendering panel's switches, how far parts are drawn, the sun's shadows,
 * and, where those are Automatic, the render scale and antialiasing.
 */
export const VIEWPORT_QUALITIES = [
	{ value: "auto", label: "Automatic" },
	...Array.from({ length: 21 }, (_, i) => {
		const level = 21 - i;
		return { value: String(level), label: `Level ${level}` };
	}),
] as const;
export type ViewportQuality = "auto" | `${number}`;

/**
 * How many of the screen's pixels the place is drawn at, across and down:
 * 75% is a little over half the pixels. The quality level does not set it:
 * Automatic, which did, was taken out in 1.1.0, and a saved one reads as
 * Native, the default.
 */
export const VIEWPORT_RENDER_SCALES = [
	{ value: "dynamic", label: "Dynamic" },
	{ value: "native", label: "Native" },
	{ value: "150", label: "150%" },
	{ value: "100", label: "100%" },
	{ value: "75", label: "75%" },
	{ value: "50", label: "50%" },
] as const;
export type ViewportRenderScale = (typeof VIEWPORT_RENDER_SCALES)[number]["value"];

/**
 * Render scale's labels on a screen of `ratio` device pixels to the page's:
 * Native with what it comes to here (200% on a Retina screen, 100% on an
 * ordinary one; at most 200%, as the view draws no more), and a share past
 * it marked, as it draws Native. "Retina" only where `apple` says the screen
 * is Apple's, whose word it is.
 */
export function renderScaleLabels(ratio: number, apple: boolean): Record<string, string> {
	const native = Math.min(2, ratio > 0 ? ratio : 1);
	const percent = Math.round(native * 100);
	const out: Record<string, string> = {
		native: `Native (${percent}%${apple && native >= 2 ? ", Retina" : ""})`,
	};
	for (const choice of VIEWPORT_RENDER_SCALES) {
		const share = Number(choice.value) / 100;
		if (Number.isFinite(share) && share > native + 1e-6)
			out[choice.value] = `${choice.label} (draws Native here)`;
	}
	return out;
}

/** Upscaling: the frame brought up to the screen's own pixels by the renderer, or stretched by the browser. */
export const VIEWPORT_UPSCALES = [
	{ value: "off", label: "Off" },
	{ value: "still", label: "When still" },
	{ value: "always", label: "Always" },
] as const;
export type ViewportUpscale = (typeof VIEWPORT_UPSCALES)[number]["value"];
export const VIEWPORT_LAMP_RESOLUTIONS = [
	{ value: "full", label: "Full" },
	{ value: "half", label: "Half" },
	{ value: "quarter", label: "Quarter" },
] as const;

/** Light object grid: light objects from cascades of cells round the camera, the finest as set. */
export const VIEWPORT_LIGHT_GRIDS = [
	{ value: "auto", label: "Automatic" },
	{ value: "off", label: "Off" },
	{ value: "4", label: "4 studs" },
	{ value: "8", label: "8 studs" },
	{ value: "16", label: "16 studs" },
	{ value: "32", label: "32 studs" },
] as const;

/** Bloom resolution: Neon's glow and BloomEffect, the quality level's or as set. */
export const VIEWPORT_BLOOM_RESOLUTIONS = [
	{ value: "auto", label: "Automatic" },
	{ value: "full", label: "Full" },
	{ value: "half", label: "Half" },
	{ value: "quarter", label: "Quarter" },
] as const;

/** Shadow map size: the sun's maps, texels a side, the quality level's or as set. */
export const VIEWPORT_SHADOW_MAPS = [
	{ value: "auto", label: "Automatic" },
	{ value: "512", label: "512" },
	{ value: "1024", label: "1,024" },
	{ value: "2048", label: "2,048" },
	{ value: "4096", label: "4,096" },
] as const;

/** Sky light resolution: the sky's share worked out at every pixel, or at fewer. */
export const VIEWPORT_SKY_RESOLUTIONS = [
	{ value: "full", label: "Full" },
	{ value: "half", label: "Half" },
	{ value: "quarter", label: "Quarter" },
] as const;

/** Ambient lighting: the sky's share from the lighting cells, from the maps at every pixel, or the device's. */
export const VIEWPORT_AMBIENT_LIGHTING = [
	{ value: "auto", label: "Automatic" },
	{ value: "realtime", label: "Realtime" },
	{ value: "grid", label: "Grid" },
] as const;

/** Particle resolution: beams and particles at the frame's pixels or half across and down. */
export const VIEWPORT_PARTICLE_RESOLUTIONS = [
	{ value: "full", label: "Full" },
	{ value: "half", label: "Half" },
] as const;

/** Particle animation rate: the effects' frames with the camera still, every display frame or fewer. */
export const VIEWPORT_STILL_FRAMES = [
	{ value: "auto", label: "Automatic" },
	{ value: "full", label: "Full" },
	{ value: "half", label: "Half" },
	{ value: "third", label: "Third" },
	{ value: "quarter", label: "Quarter" },
] as const;

/** Surface reflection accuracy: the place round the camera drawn following it, or kept on a grid. */
export const VIEWPORT_REFLECTION_UPDATES = [
	{ value: "auto", label: "Automatic" },
	{ value: "follow", label: "Exact" },
	{ value: "32", label: "32-stud grid" },
	{ value: "64", label: "64-stud grid" },
	{ value: "128", label: "128-stud grid" },
] as const;

/** Texture resolution: the material textures read at their own size, or smaller. */
export const VIEWPORT_TEXTURE_RESOLUTIONS = [
	{ value: "full", label: "Full" },
	{ value: "half", label: "Half" },
	{ value: "quarter", label: "Quarter" },
] as const;

/**
 * Antialiasing: the quality level's, or a mode (see antialias.ts). MSAA's
 * values are its counts, as canary.7's 4× was stored.
 */
export const VIEWPORT_ANTIALIAS = [
	{ value: "auto", label: "Automatic" },
	{ value: "off", label: "Off" },
	{ value: "fxaa", label: "FXAA" },
	{ value: "smaa", label: "SMAA" },
	{ value: "2", label: "MSAA 2×" },
	{ value: "4", label: "MSAA 4×" },
	{ value: "8", label: "MSAA 8×" },
	{ value: "taa", label: "Still-frame TAA" },
] as const;

/** A setting's value as the view's mode; Automatic, none. */
export function antialiasSetting(value: string | undefined): AntialiasMode | undefined {
	if (value === "2" || value === "4" || value === "8") return `msaa${value}`;
	if (value === "off" || value === "fxaa" || value === "smaa" || value === "taa") return value;
	return undefined;
}
export type ViewportAntialias = (typeof VIEWPORT_ANTIALIAS)[number]["value"];

/** The settings as the viewer reads them. */
export interface PlaceEditorSettings {
	renderer: ViewportRenderer;
	quality: ViewportQuality;
	frameRate: ViewportFrameRate;
	renderScale: ViewportRenderScale;
	upscale: ViewportUpscale;
	/** Savings taken at any level while frames do not fit: see dynamicScale.ts's DynamicSavings. */
	dynamicOptimization: boolean;
	/** Light objects' resolution: see depthChoice.ts's lampMode. */
	lampResolution: "full" | "half" | "quarter";
	/** Light objects from a grid round the camera, its finest cell: see view.ts's lightGridCell. */
	lightGrid: "auto" | "off" | "4" | "8" | "16" | "32";
	/** Scene reflections following the camera, or kept on a grid: see view.ts's reflectionGrid. */
	reflectionUpdates: "auto" | "follow" | "32" | "64" | "128";
	/** Effects' frames with the camera still, every display frame or fewer: see view.ts's stillSkip. */
	stillFrames: "auto" | "full" | "half" | "third" | "quarter";
	/** Beams and particles at half size: see WebGpuView.drawHalfEffects. */
	particleResolution: "full" | "half";
	/** The sky's share at fewer pixels: see the controller's skyModeNow. */
	skyResolution: "full" | "half" | "quarter";
	/** The sky's share from the lighting cells or the maps: see view.ts's ambientGrid. */
	ambientLighting: "auto" | "realtime" | "grid";
	/** Neon's glow and BloomEffect: see ViewQuality.glowHalf and glowCoarse. */
	bloomResolution: "auto" | "full" | "half" | "quarter";
	/** The sun's shadow maps, texels a side, or the quality level's. */
	shadowMapSize: "auto" | "512" | "1024" | "2048" | "4096";
	/** The material textures read at their own size, or one or two mip levels smaller. */
	textureResolution: "full" | "half" | "quarter";
	/** Stored as `antialiasing`: 1.1.0-canary.6 saved `antialias` as "4" for everyone. */
	antialiasing: ViewportAntialias;
	outlineWidth: OutlineWidth;
	/** The outline shows through what is in front of it, as Studio's does. */
	outlineThrough: boolean;
	/** Alt and a click picks one Model further in each time, rather than the part. */
	altClickSteps: boolean;
	/** See-through Glass hides the see-through parts behind it, as Studio's does. */
	glassHides: boolean;
	/** The place's own post effects are drawn. */
	postEffects: boolean;
}

/** Settings › Graphics (Scene view until 1.1.0-canary.119). */
export const SCENE_VIEW: readonly SettingGroup[] = [
	{
		title: "Renderer",
		settings: [
			{
				key: "renderer",
				legacy: "viewportRenderer",
				title: "Renderer",
				help: "WebGPU where the browser has it, WebGL2 where it does not.",
				detail:
					"Automatic draws with WebGPU where the browser has it, and WebGL2 where it does not. WebGPU falls back to WebGL2 on a device that has none. Upscaling and the sky's light at fewer pixels are WebGPU's.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_RENDERERS,
			},
			{
				key: "quality",
				title: "Quality",
				help: "How much of Studio's picture is drawn, Level 1 to 21.",
				detail:
					"As Studio's quality levels: each sets how far parts are drawn, the sun's shadows, which effects are on, and the render scale and antialiasing where those are Automatic. Automatic starts from the device and moves a level down or up with how fast frames are drawn. Level 21 draws everything, as Studio does.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_QUALITIES,
			},
			{
				key: "frameRate",
				legacy: "viewportFrameRate",
				title: "Frame rate",
				help: "The most frames a second while the view moves.",
				detail:
					"VSync matches the display. Steady is VSync at half the display's rate while frames cannot keep up, smooth where VSync stutters. 24 to 240 cap it; on a 60 Hz display, 24 alternates two and three refreshes. Unlimited draws as fast as it can, which a variable-refresh display can follow. The view is drawn only when something changes.",
				type: "choice",
				default: "vsync",
				choices: VIEWPORT_FRAME_RATES,
			},
			{
				key: "renderScale",
				title: "Render scale",
				help: "Pixels drawn, as a share of the screen's.",
				detail:
					"Native, the default, is every pixel your screen has: the number beside it is what that comes to here, 200% on a Retina screen and 100% on an ordinary one; browser zoom counts too. The quality level leaves it as set. Dynamic draws fewer while frames do not fit and more once they do, from Native down to half of it. Fewer is faster where filling pixels is the cost, as on a tablet.",
				type: "choice",
				default: "native",
				choices: VIEWPORT_RENDER_SCALES,
				labels: () =>
					renderScaleLabels(
						typeof devicePixelRatio === "number" ? devicePixelRatio : 1,
						typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent),
					),
			},
			{
				key: "upscale",
				title: "Upscaling",
				help: "Brings a lower render scale up to the screen's detail.",
				detail:
					"Where the render scale draws fewer pixels than the screen has, the view brings them up itself rather than the browser stretching them. When still: once the view stops, frames a fraction of a pixel apart are gathered to about Native's detail, at the render scale's cost; moving, it is stretched. Always: moving frames are sharpened too. WebGPU.",
				type: "choice",
				default: "off",
				choices: VIEWPORT_UPSCALES,
			},
			{
				key: "dynamicOptimization",
				title: "Dynamic optimization",
				help: "Takes savings while frames do not fit.",
				detail:
					"Whatever the quality level, the view takes savings while frames do not fit the display, the least visible first: light objects at half the pixels, the sky's light at half, bloom at half and then a quarter, light objects at a quarter. It gives them back once frames fit with room. With Render scale Dynamic, the savings go first. WebGPU.",
				type: "boolean",
				default: false,
				on: "Takes savings while frames do not fit",
				off: "Draws as the quality level says",
			},
			{
				key: "lampResolution",
				title: "Light objects resolution",
				help: "Pixels the lights are worked out at.",
				detail:
					"The light of PointLights, SpotLights and SurfaceLights. Full, the default, Half or Quarter; fewer pixels pay where many lights reach the same pixels. Dynamic optimization takes it to half, then a quarter, while frames do not fit. Above 100% render scale, Half works it out at no fewer pixels than the screen has points, so surfaces stay sharp. WebGPU, and WebGL2 where the light grid is off.",
				type: "choice",
				default: "full",
				choices: VIEWPORT_LAMP_RESOLUTIONS,
			},
			{
				key: "lightGrid",
				title: "Light object grid",
				help: "Light objects worked out once in cells round the camera.",
				detail:
					"Rather than each pixel working out each light again every frame, the light is worked out into three grids round the camera, of cells 8, 16 or 32 studs as set and twice and four times that, again only when the lights change or the camera moves on. Each pixel blends the cells round it and turns the light to its own face, so edges stay sharp; the light's fall softens to the cells' size. It costs the same however many lights there are. Automatic follows the place's LightingStyle: Soft, 4-stud cells, flat as Studio draws it; Realistic, every pixel works out its own. On a touch screen, Automatic is 4-stud cells for either, which a tablet keeps up with at Native with Ambient lighting on Grid. Off, every pixel's own (Light objects resolution). WebGPU, and WebGL2 where it draws to float textures.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_LIGHT_GRIDS,
			},
			{
				key: "ambientLighting",
				title: "Ambient lighting",
				help: "Where the sky's light reaches, from cells or every pixel.",
				detail:
					"How much of the sky each surface sees: OutdoorAmbient and the sky's light reach what the sky does, and rooms closed from it get Ambient alone. Grid reads it from the lighting cells, 4 studs a side round the camera, as Studio holds its own, then from cells 16 studs a side out to 768 studs, and past those four of the sky's maps a tap each: far fewer reads a pixel, the saving largest on a tablet at Native. Realtime works it out at every pixel from eight of the sky's maps, sharper past the cells. Automatic is Grid on a touch screen and Realtime elsewhere.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_AMBIENT_LIGHTING,
			},
			{
				key: "skyResolution",
				title: "Sky light resolution",
				help: "Pixels the sky's light and shadow are worked out at.",
				detail:
					"How much of the sky each surface sees, which Ambient lighting works out from the sky's maps at every pixel: a tablet's costliest work at a high render scale. Half or Quarter works it out at fewer pixels, in the same pass as Light objects resolution's, and reads it back where each pixel's distance agrees. WebGPU.",
				type: "choice",
				default: "full",
				choices: VIEWPORT_SKY_RESOLUTIONS,
			},
			{
				key: "bloomResolution",
				title: "Bloom resolution",
				help: "Pixels Neon's glow and bloom are worked out at.",
				detail:
					"Neon's glow and the place's BloomEffect. Automatic is the quality level's: half the pixels at Level 12 and below, and a quarter where the view has more pixels than the screen has points. Full, Half or Quarter set it; fewer pixels are a little softer. WebGL2 draws Half as Full.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_BLOOM_RESOLUTIONS,
			},
			{
				key: "shadowMapSize",
				title: "Shadow map size",
				help: "Texels a side of the maps the sun's shadows are drawn into.",
				detail:
					"Bigger is sharper, and costs time and memory: each of the three maps takes 64 MB at 4,096. Automatic is the quality level's: 512 to Level 9, 1,024 to 12, then 2,048.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_SHADOW_MAPS,
			},
			{
				key: "stillFrames",
				title: "Particle animation rate",
				help: "How often moving effects are drawn with the camera still.",
				detail:
					"Particles and beams, drawn every display frame (Full), or one in two, three or four. Each of those frames draws the whole place, so fewer let a tablet rest between them and stay cool; moving the camera draws at full rate at once. Automatic is Half on a touch screen and Full on a computer.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_STILL_FRAMES,
			},
			{
				key: "particleResolution",
				title: "Particle resolution",
				help: "Pixels particles and beams are drawn at.",
				detail:
					"Half draws them at half the pixels across and down, a quarter as many, into a layer laid over the place, smoothed: smoke and sparks that cover much of the view cost far less, and their edges against the parts in front soften a little. Where the place has no Neon glow, bloom or post effects, they are drawn at Full. WebGPU, and WebGL2 without MSAA.",
				type: "choice",
				default: "full",
				choices: VIEWPORT_PARTICLE_RESOLUTIONS,
			},
			{
				key: "reflectionUpdates",
				title: "Surface reflection accuracy",
				help: "How closely reflections follow the camera.",
				detail:
					"Exact draws the place round the camera again each 8 studs it moves: a cost while it moves. A grid draws one the first time the camera enters each cell of 32, 64 or 128 studs, keeps the last eight and reads the one for where the camera is: nothing to redraw once drawn, less exact. Automatic follows on a computer and keeps a 64-stud grid on a touch screen.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_REFLECTION_UPDATES,
			},
			{
				key: "textureResolution",
				title: "Texture resolution",
				help: "Detail the material textures are read at.",
				detail:
					"Full reads each material's texture at its own size, 512 pixels a side, or 256 on a touch screen; Half and Quarter read its smaller copies, which a GPU short of memory bandwidth reads faster. On WebGPU, Decals and Textures too. What is kept is the same either way.",
				type: "choice",
				default: "full",
				choices: VIEWPORT_TEXTURE_RESOLUTIONS,
			},
			{
				key: "antialiasing",
				title: "Antialiasing",
				help: "Smooths parts' edges.",
				detail:
					"FXAA and SMAA are a pass over the finished frame, cheap on a tablet. MSAA draws 2, 4 or 8 samples a pixel, as the renderer allows, and makes the view again when chosen. Still-frame TAA averages 16 frames a fraction of a pixel apart once the view is still. Automatic is the quality level's: off below Level 10, FXAA to 12, then SMAA.",
				type: "choice",
				default: "auto",
				choices: VIEWPORT_ANTIALIAS,
			},
		],
	},
	{
		title: "Selection",
		settings: [
			{
				key: "outlineWidth",
				legacy: "outlineWidth",
				title: "Selection outline",
				help: "Width of the outline round what is picked.",
				type: "choice",
				default: "medium",
				choices: [
					{ value: "thin", label: "Thin" },
					{ value: "medium", label: "Medium" },
					{ value: "thick", label: "Thick" },
				],
			},
			{
				key: "outlineThrough",
				legacy: "outlineThrough",
				title: "Hidden edges",
				help: "The outline shows through parts in front.",
				detail: "As Studio's does. Off, parts in front hide the outline.",
				type: "boolean",
				default: true,
				on: "Shown through parts",
				off: "Hidden by parts in front",
			},
			{
				key: "altClickSteps",
				legacy: "altClickSteps",
				title: "Alt-click",
				help: "What Alt-click and a long press pick.",
				detail:
					"The part, as in Studio, or one Model further in each time. Shift and a click always picks the part.",
				type: "boolean",
				default: false,
				on: "Steps in a Model at a time",
				off: "Picks the part",
			},
		],
	},
	{
		title: "Transparency",
		settings: [
			{
				key: "glassHides",
				legacy: "glassHides",
				title: "Glass",
				help: "Glass hides see-through parts behind it.",
				detail: "As Studio's does; places are often built around it. Off, they show through.",
				type: "boolean",
				default: true,
				on: "Hides see-through parts behind it",
				off: "Shows them through it",
			},
		],
	},
	{
		title: "Post effects",
		settings: [
			{
				key: "postEffects",
				legacy: "postEffects",
				title: "Post effects",
				help: "The place's ColorCorrection and Blur.",
				detail: "Under Lighting or its Camera. Off shows the place as it is underneath.",
				type: "boolean",
				default: true,
				on: "Drawn",
				off: "Not drawn",
			},
		],
	},
];
