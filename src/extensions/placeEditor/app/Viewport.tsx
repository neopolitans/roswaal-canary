/**
 * The place in 3D: a document tab of its own, its bar where a graph's strip
 * is, and a summary of the place in Properties while nothing is picked.
 *
 * The drawing, the camera and the input are `ViewportController`'s, which App
 * keeps for the session; these lend it the window.
 */

import {
	Fragment,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { api } from "../../../app/api.js";
import { PanelHead } from "../../../app/Cards.jsx";
import { cx } from "../../../app/cx.js";
import { Icon, type IconName } from "../../../app/icons.jsx";
import { Ident, SectionHead, useFold } from "../../../app/PanelParts.jsx";
import { InfoButton, matches } from "../../../app/settingsParts.jsx";
import { useWorkspaceControls } from "../../../app/Workspace.jsx";
import { VERSION } from "../../../cli/version.js";
import { errorMessage } from "../../../core/errorMessage.js";
import { startBenchmark } from "../benchmarkEvent.js";
import {
	antialiasSetting,
	type PlaceEditorSettings,
	renderScaleLabels,
	SCENE_VIEW,
	VIEWPORT_ANTIALIAS,
	VIEWPORT_BLOOM_RESOLUTIONS,
	VIEWPORT_FRAME_RATES,
	VIEWPORT_LAMP_RESOLUTIONS,
	VIEWPORT_LIGHT_GRIDS,
	VIEWPORT_PARTICLE_RESOLUTIONS,
	VIEWPORT_REFLECTION_UPDATES,
	VIEWPORT_RENDER_SCALES,
	VIEWPORT_RENDERERS,
	VIEWPORT_SHADOW_MAPS,
	VIEWPORT_SKY_RESOLUTIONS,
	VIEWPORT_AMBIENT_LIGHTING,
	VIEWPORT_STILL_FRAMES,
	VIEWPORT_TEXTURE_RESOLUTIONS,
	VIEWPORT_UPSCALES,
} from "../settings.js";
import { AutomaticSection, automaticText } from "./AutomaticSection.jsx";
import { shortAuto, useTight } from "./autoFit.js";
import { GizmoSection } from "./GizmoSection.jsx";
import { StartLogSection } from "./StartLogSection.jsx";
import { placeScene, type SceneSince } from "./sceneApi.js";
import { antialiasInfo } from "./viewport/antialias.js";
import {
	type AssetProgress,
	assetsMissing,
	assetsPending,
	assetWords,
} from "./viewport/assetProgress.js";
import {
	type Snap,
	type Stick,
	TOOLS,
	type Tool,
	type ViewportController,
} from "./viewport/controller.js";
import { fader } from "./viewport/fade.js";
import {
	FRAME_GUIDES,
	type FrameHistory,
	gpuTotal,
	graphTop,
	graphY,
} from "./viewport/frameGraph.js";
import { memoryRows } from "./viewport/gpuMemory.js";
import { type HeavyMesh, shortCount } from "./viewport/heaviest.js";
import { downloadFailures, onDownloadFailures } from "./viewport/images.js";
import { prepareScene } from "./viewport/prepare.js";
import { probeCost } from "./viewport/probe.js";
import {
	fpsText,
	type LevelRow,
	levelSettings,
	msText,
	type ProfileResult,
	profileReport,
	profileVerdict,
	STAGE_HINTS,
	STAGE_LABELS,
	stepCosts,
} from "./viewport/profile.js";
import { presetLevel, qualityLevel } from "./viewport/quality.js";
import {
	changedFrom,
	DEBUG_PRESETS,
	FEATURE_GROUPS,
	featureOn,
	presetById,
	QUALITY_PRESETS,
	RENDER_STEPS,
	type RenderFeatures,
	stepOf,
	upToStep,
} from "./viewport/renderFeatures.js";
import { readSpeed, SPEED_MAX, SPEED_MIN, SPEED_STEP, speedText } from "./viewport/speed.js";
import { startRuns, startText } from "./viewport/startLog.js";
import {
	heatStyled,
	RENDER_HEAT,
	RENDER_MODES,
	type RenderHeat,
	type RenderLegend,
	type RenderMode,
	type RenderSettings,
	type RenderStats,
	renderLegend,
} from "./viewport/view.js";

const GIZMO = 104;
const TOOL_ICON: Record<Tool, IconName> = {
	select: "vpSelect",
	move: "vpMove",
	rotate: "vpRotate",
	scale: "vpScale",
};
const LATER = "comes with editing";
/** Said by an editing tool while Modify DataModel Instances is off. */
const EDITING_OFF = "Editing is off: turn on Modify DataModel Instances in Settings › Workspace";

function useViewport(controller: ViewportController) {
	return useSyncExternalStore(controller.subscribe, controller.getState);
}

export function Viewport({
	controller,
	refreshKey,
	written,
}: {
	controller: ViewportController;
	/** Changes whenever the project tree is read again, which is when to look again. */
	refreshKey: unknown;
	/** The version of the place a change last made: read it again. */
	written?: string | null;
}) {
	const holder = useRef<HTMLDivElement>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const state = useViewport(controller);
	// The scene drawn, as the host sent it, and its file: an edit sends what changed since.
	const drawnScene = useRef<(SceneSince & { file: string }) | null>(null);

	useEffect(() => {
		if (!holder.current) return;
		return controller.mount({ holder: holder.current });
	}, [controller]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey and written are when to read the place again.
	useEffect(() => {
		let stale = false;
		void (async () => {
			try {
				const tree = await api.place();
				if (tree.file === null) throw new Error("The project has no place file.");
				const was = drawnScene.current?.file === tree.file ? drawnScene.current : null;
				// The same version: nothing to draw again.
				if (was?.stamp === tree.stamp) return;
				const scene = await placeScene(tree.stamp, was ?? undefined);
				if (stale) return;
				// The lights' grid off the page, so the place does not hold it.
				await prepareScene(scene);
				if (stale) return;
				const place = { ...scene, outline: tree.outline, stamp: tree.stamp };
				// An edit, or the file saved elsewhere: drawn where it stands, the
				// rows it changed replaced, rather than the place loaded again.
				if (was) controller.updatePlace(place);
				else controller.setPlace(place);
				drawnScene.current = { file: tree.file, stamp: tree.stamp, scene };
				setProblem(null);
			} catch (err) {
				if (!stale) setProblem(errorMessage(err));
			}
		})();
		return () => {
			stale = true;
		};
	}, [controller, refreshKey, written]);

	const rise = useFade<HTMLSpanElement>();
	const shown = problem ?? state.error;
	return (
		<div className="viewport">
			<div className="vp-holder" ref={holder} />
			{shown && <p className="vp-problem">{shown}</p>}
			<div className="vp-touch">
				<TouchStick stick="move" label="Move" controller={controller} />
				<span className="vp-touch-right">
					<span className="vp-rise" ref={rise}>
						<RiseButton rise={1} label="Up" controller={controller} />
						<RiseButton rise={-1} label="Down" controller={controller} />
					</span>
					<TouchStick stick="look" label="Look round" controller={controller} />
				</span>
			</div>
		</div>
	);
}

/**
 * Fades a touch control a while after the last touch in it lets go, and wakes
 * it at the next. The class goes straight on the element, so the viewport does
 * not draw again for it.
 */
function useFade<T extends HTMLElement>() {
	const area = useRef<T>(null);
	useEffect(() => {
		const el = area.current;
		if (!el) return;
		const f = fader((faded) => el.classList.toggle("vp-faded", faded));
		const down = (e: PointerEvent) => f.down(e.pointerId);
		const up = (e: PointerEvent) => f.up(e.pointerId);
		const ends = ["pointerup", "pointercancel", "lostpointercapture"] as const;
		el.addEventListener("pointerdown", down, true);
		for (const end of ends) el.addEventListener(end, up, true);
		return () => {
			f.stop();
			el.removeEventListener("pointerdown", down, true);
			for (const end of ends) el.removeEventListener(end, up, true);
			el.classList.remove("vp-faded");
		};
	}, []);
	return area;
}

/** How far a stick's knob goes from the middle, in pixels. */
const STICK_REACH = 44;

/**
 * A touch stick, where a touch screen has no keys: a ring and a knob, pushed
 * as far as the ring in any direction, back to the middle when let go.
 */
function TouchStick({
	stick,
	label,
	controller,
}: {
	stick: Stick;
	label: string;
	controller: ViewportController;
}) {
	const knob = useRef<HTMLSpanElement>(null);
	const area = useFade<HTMLSpanElement>();
	const held = useRef<{ id: number; x: number; y: number } | null>(null);
	const push = (e: ReactPointerEvent) => {
		const at = held.current;
		if (!at || e.pointerId !== at.id) return;
		let dx = e.clientX - at.x;
		let dy = e.clientY - at.y;
		const d = Math.hypot(dx, dy);
		if (d > STICK_REACH) {
			dx *= STICK_REACH / d;
			dy *= STICK_REACH / d;
		}
		if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
		// A little give in the middle, so a resting thumb does not drift.
		const k = d < 6 ? 0 : 1 / STICK_REACH;
		controller.setStick(stick, dx * k, dy * k);
	};
	const end = (e: ReactPointerEvent) => {
		if (held.current?.id !== e.pointerId) return;
		held.current = null;
		if (knob.current) knob.current.style.transform = "";
		controller.setStick(stick, 0, 0);
	};
	return (
		<span
			className="vp-stick"
			ref={area}
			role="img"
			aria-label={label}
			title={label}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				const box = e.currentTarget.getBoundingClientRect();
				held.current = {
					id: e.pointerId,
					x: box.left + box.width / 2,
					y: box.top + box.height / 2,
				};
				push(e);
			}}
			onPointerMove={push}
			onPointerUp={end}
			onPointerCancel={end}
		>
			<span className="vp-stick-knob" ref={knob} />
		</span>
	);
}

/** Up or down, for as long as it is held: Q and E, for a touch screen. */
function RiseButton({
	rise,
	label,
	controller,
}: {
	rise: number;
	label: string;
	controller: ViewportController;
}) {
	const stop = () => controller.setRise(0);
	return (
		<button
			type="button"
			className="vp-rise-button"
			aria-label={label}
			title={label}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				controller.setRise(rise);
			}}
			onPointerUp={stop}
			onPointerCancel={stop}
			onContextMenu={(e) => e.preventDefault()}
		>
			<Icon name="chevron" size={18} rotate={rise > 0 ? 180 : 0} />
		</button>
	);
}

/** The Move and Rotate snaps: on or off, and the step each keeps to. */
function SnapFields({ snap, controller }: { snap: Snap; controller: ViewportController }) {
	const step = (value: string, set: (n: number) => void) => {
		const n = Number(value);
		if (Number.isFinite(n) && n > 0) set(n);
	};
	return (
		<>
			<label className="vp-snap">
				<input
					type="checkbox"
					checked={snap.moveOn}
					aria-label="Snap moves"
					onChange={(e) => controller.setSnap({ moveOn: e.target.checked })}
				/>
				<Icon name="vpMove" size={14} />
				<input
					className="vp-step"
					type="number"
					inputMode="decimal"
					min={0.001}
					step={0.5}
					defaultValue={snap.move}
					aria-label="Move snap, in studs"
					onChange={(e) => step(e.target.value, (move) => controller.setSnap({ move }))}
				/>
				<span>studs</span>
			</label>
			<label className="vp-snap">
				<input
					type="checkbox"
					checked={snap.rotateOn}
					aria-label="Snap turns"
					onChange={(e) => controller.setSnap({ rotateOn: e.target.checked })}
				/>
				<Icon name="vpRotate" size={14} />
				<input
					className="vp-step"
					type="number"
					inputMode="decimal"
					min={1}
					step={5}
					defaultValue={snap.rotate}
					aria-label="Rotate snap, in degrees"
					onChange={(e) => step(e.target.value, (rotate) => controller.setSnap({ rotate }))}
				/>
				<span>°</span>
			</label>
		</>
	);
}

/** How fast the camera flies, typed: what Shift+scroll sets too, which the field follows. */
function SpeedField({ speed, controller }: { speed: number; controller: ViewportController }) {
	const field = useRef<HTMLInputElement>(null);
	// Not while it is being typed in, which would take the text from under the caret.
	useEffect(() => {
		const el = field.current;
		if (el && el !== document.activeElement) el.value = speedText(speed);
	}, [speed]);
	return (
		<label className="vp-snap vp-speed-field" title={SPEED_TITLE}>
			<span>Speed</span>
			<input
				ref={field}
				className="vp-step"
				type="number"
				inputMode="decimal"
				min={SPEED_MIN}
				max={SPEED_MAX}
				step={SPEED_STEP}
				defaultValue={speedText(speed)}
				aria-label="Camera speed"
				onChange={(e) => {
					const n = readSpeed(e.target.value);
					if (n !== null) controller.setSpeed(n);
				}}
				onBlur={(e) => {
					e.target.value = speedText(controller.getState().speed);
				}}
			/>
			<span>×</span>
		</label>
	);
}

const SPEED_TITLE =
	"How fast the camera flies, with WASD or the move stick. Shift+scroll changes it too.";

/** One of the bar's tiles: a large icon over its name, after Studio's compact bar. */
function Tile({
	icon,
	label,
	title,
	on,
	disabled,
	caret,
	onClick,
	...rest
}: {
	icon: IconName;
	label: string;
	title: string;
	on?: boolean;
	disabled?: boolean;
	caret?: boolean;
	onClick?: () => void;
	role?: string;
	"aria-checked"?: boolean;
	"aria-pressed"?: boolean;
}) {
	return (
		<button
			type="button"
			className={cx("vp-tile", on && "on")}
			title={title}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			{...rest}
		>
			<span className="vp-tile-icon">
				<Icon name={icon} size={22} />
				{caret && <Icon name="chevron" size={9} className="vp-caret" />}
			</span>
			<span className="vp-tile-label">{label}</span>
		</button>
	);
}

/** The viewport's bar, where a graph's strip is: the tools, framing, the cards, and the camera's speed. */
export function ViewportBar({ controller }: { controller: ViewportController }) {
	const state = useViewport(controller);
	const gizmo = useRef<HTMLDivElement>(null);
	const rotation = useRef<HTMLSpanElement>(null);
	const position = useRef<HTMLSpanElement>(null);
	const rate = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (!gizmo.current || !rotation.current || !rate.current) return;
		return controller.mountCorner({
			gizmo: gizmo.current,
			rotation: rotation.current,
			position: position.current ?? undefined,
			rate: rate.current,
		});
	}, [controller]);
	const cards = useWorkspaceControls();
	/** The snaps behind a tile, where the bar has no room for them: open, and where. */
	const [snapAt, setSnapAt] = useState<number | null>(null);
	const pop = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (snapAt === null) return;
		const away = (e: PointerEvent) => {
			const target = e.target as Element;
			if (!pop.current?.contains(target) && !target.closest?.(".vp-snap-tile")) setSnapAt(null);
		};
		addEventListener("pointerdown", away);
		return () => removeEventListener("pointerdown", away);
	}, [snapAt]);
	const snapTitle = "Snapping, for dragging the handles, which comes with editing";
	const popTitle = "Snapping, and the camera's speed";
	return (
		// The bar centred in the window, as the view is, with the axes and the
		// readout standing on its right-hand end: none of them moves when a card
		// opens or shuts.
		<div className="vp-dock">
			<div className="vp-above">
				<div className="vp-above-left">
					<AssetCard assets={state.assets} />
					<RenderBadge render={state.render} />
				</div>
				<div className="vp-cluster">
					<div className="vp-gizmo" ref={gizmo}>
						<svg
							width={GIZMO}
							height={GIZMO}
							viewBox={`${-GIZMO / 2} ${-GIZMO / 2} ${GIZMO} ${GIZMO}`}
							aria-label="View axes: click an end to look along it, drag to orbit"
						/>
					</div>
					<div className="vp-corner">
						<span
							className="vp-rot"
							ref={rotation}
							title="The camera's rotation, as Roblox's Orientation reads it: X, Y, Z, in degrees"
						/>
						<span
							className="vp-rot vp-pos"
							ref={position}
							title="Where the camera is in the world, as Roblox's Position reads it: X, Y, Z, in studs"
						/>
						<span
							className="vp-fps"
							ref={rate}
							title="Frames a second while the view moves, and what draws it. Nothing is drawn while nothing changes."
						/>
					</div>
				</div>
			</div>
			<div className="side-strip tool-group vp-bar" role="toolbar" aria-label="Viewport">
				<span className="vp-group" role="radiogroup" aria-label="Tool">
					{TOOLS.map(([id, label, key]) => (
						<Tile
							key={id}
							icon={TOOL_ICON[id]}
							label={label}
							title={
								id === "select"
									? `${label} (${key}); again for the camera alone`
									: state.editable
										? `${label} (${key}): the handles show; dragging them ${LATER}`
										: `${label}. ${EDITING_OFF}`
							}
							role="radio"
							aria-checked={state.tool === id}
							on={state.tool === id}
							disabled={id !== "select" && !state.editable}
							onClick={() => controller.chooseTool(id)}
						/>
					))}
				</span>
				{/* Esc's job, where a touch screen has no keys. */}
				<span className="vp-clear">
					<Tile
						icon="close"
						label="Clear"
						title="Pick nothing (Esc)"
						disabled={!state.picked}
						onClick={() => controller.clear()}
					/>
				</span>
				<span className="vp-rule" />
				<span className="vp-snaps" title={snapTitle}>
					<SnapFields snap={state.snap} controller={controller} />
				</span>
				<span
					className="vp-snap-tile"
					onClickCapture={(e) => {
						// The tile's own place in the bar: its wrapper draws no box of its own.
						const left = (e.target as Element).closest<HTMLElement>(".vp-tile")?.offsetLeft ?? 0;
						setSnapAt((was) => (was === null ? left : null));
					}}
				>
					<Tile
						icon="vpSnap"
						label="Snap"
						title={popTitle}
						caret
						on={snapAt !== null}
						aria-pressed={snapAt !== null}
					/>
				</span>
				{snapAt !== null && (
					<div className="vp-snap-pop" ref={pop} style={{ left: snapAt }}>
						<span className="vp-snap-rows" title={snapTitle}>
							<SnapFields snap={state.snap} controller={controller} />
						</span>
						<SpeedField speed={state.speed} controller={controller} />
					</div>
				)}
				{/* Beside the steps a drag keeps to: how the handles stand, not a tool of their own. */}
				<Tile
					icon="vpPivot"
					label="Pivot"
					title={
						state.editable
							? `Edit Pivot: the handles stand at the pivot of what is picked; dragging them ${LATER}`
							: `Edit Pivot. ${EDITING_OFF}`
					}
					disabled={!state.editable}
					on={state.pivotEdit}
					aria-pressed={state.pivotEdit}
					onClick={() => controller.setPivotEdit(!state.pivotEdit)}
				/>
				<Tile
					icon={state.space === "world" ? "vpGlobe" : "instance"}
					label={state.space === "world" ? "Global" : "Object"}
					title={
						state.editable
							? "The handles' axes: the object's own, or the world's (Ctrl+L)"
							: `The handles' axes. ${EDITING_OFF}`
					}
					disabled={!state.editable}
					onClick={() => controller.setSpace(state.space === "world" ? "object" : "world")}
				/>
				<span className="vp-rule" />
				<Tile icon="instance" label="Part" title={`Add a part: ${LATER}`} caret disabled />
				<span className="vp-rule" />
				<Tile icon="vpMaterial" label="Material" title={`Material: ${LATER}`} caret disabled />
				<Tile icon="vpColor" label="Color" title={`Color: ${LATER}`} caret disabled />
				<Tile icon="vpGroup" label="Group" title={`Group: ${LATER}`} disabled />
				<Tile icon="vpLock" label="Lock" title={`Lock: ${LATER}`} disabled />
				<Tile icon="vpAnchor" label="Anchor" title={`Anchor: ${LATER}`} disabled />
				<span className="vp-rule" />
				<Tile
					icon="locate"
					label="Focus"
					title="Frame the selection (F)"
					onClick={() => controller.frameSelection()}
				/>
				<Tile
					icon="fit"
					label="Fit all"
					title="Frame the whole place (Home)"
					onClick={() => controller.fitAll()}
				/>
				<span className="vp-rule" />
				<Tile
					icon="vpExplorer"
					label="Explorer"
					title="Show or hide the Project card, with DataModel"
					aria-pressed={cards.cardShown("tree")}
					on={cards.cardShown("tree")}
					onClick={() => cards.toggleCard("tree")}
				/>
				<Tile
					icon="vpProperties"
					label="Properties"
					title="Show or hide Properties"
					aria-pressed={cards.cardShown("properties")}
					on={cards.cardShown("properties")}
					onClick={() => cards.toggleCard("properties")}
				/>
				<span className="vp-rule" />
				<span className="vp-speed">
					<SpeedField speed={state.speed} controller={controller} />
				</span>
			</div>
		</div>
	);
}

/** Rows as an instance's Properties draws them: a name, and its value. */
function Rows({ rows }: { rows: [string, string][] }) {
	return rows.map(([name, value]) => (
		<div className="place-prop" key={name}>
			<span className="place-prop-name">{name}</span>
			<span className="place-prop-value">{value}</span>
		</div>
	));
}

/**
 * Properties while the place is in front and nothing is picked: the place
 * itself, drawn as an instance's Properties are, so it reads the same docked,
 * floating or in a tablet's drawer.
 */
export function PlaceSummary({
	controller,
	file,
}: {
	controller: ViewportController;
	file: string;
}) {
	const { summary } = useViewport(controller);
	const name = file.split("/").pop() ?? file;
	return (
		<div className="place-properties">
			<PanelHead sub={name} />
			<div className="place-props">
				<div className="place-props-head">
					<Ident name={name} kind="DataModel" color="var(--danger)" icon="build" />
				</div>
				<p className="place-summary">
					The place in 3D. Pick an instance in it, or in DataModel, for its properties.
				</p>
				{summary && (
					<div className="place-groups">
						<div className="place-group">
							<SectionHead title="Drawn" />
							<Rows
								rows={[
									["Parts", summary.parts.toLocaleString()],
									[
										"MeshParts",
										summary.meshesDrawn >= summary.meshes
											? summary.meshes.toLocaleString()
											: summary.meshesDrawn > 0
												? `${summary.meshes.toLocaleString()}, ${(summary.meshes - summary.meshesDrawn).toLocaleString()} as their boxes`
												: `${summary.meshes.toLocaleString()}, as their boxes`,
									],
									["Seen through", `${summary.translucent.toLocaleString()}, blended`],
									["Left out", `${summary.transparent.toLocaleString()} fully transparent`],
								]}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * How the view is drawn, over the bar's left end: what the Rendering panel
 * shows, a heatmap's style, and under it the preset chosen and how many
 * switches are changed from it.
 */
function RenderBadge({ render }: { render: RenderSettings }) {
	const mode = RENDER_MODES.find(([m]) => m === render.mode)?.[1] ?? "";
	const heat = heatStyled(render.mode)
		? RENDER_HEAT.find(([h]) => h === render.heat)?.[1]
		: undefined;
	const plain = render.preset === "level-21" && changedFrom(render.features).length === 0;
	return (
		<div className="vp-render-badge" title="How the view is drawn: the Rendering panel">
			<span>{heat ? `${mode} · ${heat}` : mode}</span>
			{!plain && <span className="vp-render-badge-off">{presetLine(render)}</span>}
			{render.freezeShadows && <span className="vp-render-badge-frozen">Shadows frozen</span>}
		</div>
	);
}

/** How long the card stays once nothing is pending: a moment, or longer when some did not come. */
const ASSETS_HOLD = 2500;
const ASSETS_HOLD_MISSING = 7000;
const ASSETS_FADE = 600;

/**
 * The place's assets on their way: how many are in the view, a bar for those
 * downloaded and those on the GPU, and what will not come. Once nothing is
 * pending it settles to one line and fades. A count seen before, as after the
 * place is saved, is not shown again.
 */
/** The commonest reason downloads failed, for the asset card's notes. */
function useFailureWhy(): { reason: string; count: number; others: number } | undefined {
	const list = useSyncExternalStore(onDownloadFailures, downloadFailures);
	const top = list[0];
	return top ? { reason: top.reason, count: top.count, others: list.length - 1 } : undefined;
}

function AssetCard({ assets }: { assets: AssetProgress | null }) {
	const why = useFailureWhy();
	const [phase, setPhase] = useState<"hidden" | "shown" | "fading">("hidden");
	/** Whether the card is up: read by the effect, which does not follow it. */
	const up = useRef(false);
	up.current = phase !== "hidden";
	/** The last counts settled on, so the same ones are not shown twice. */
	const seen = useRef("");
	const pending = assets ? assetsPending(assets) : 0;
	const missing = assets ? assetsMissing(assets) : 0;
	const counted = assets
		? `${assets.needed}:${assets.uploaded}:${assets.failed}:${assets.signIn}:${assets.unavailable}`
		: "";
	useEffect(() => {
		if (!counted) {
			setPhase("hidden");
			return;
		}
		if (pending > 0) {
			setPhase("shown");
			return;
		}
		const fresh = counted !== seen.current;
		seen.current = counted;
		if (!up.current && !(fresh && missing > 0)) return;
		setPhase("shown");
		const hold = missing > 0 ? ASSETS_HOLD_MISSING : ASSETS_HOLD;
		const fade = setTimeout(() => setPhase("fading"), hold);
		const hide = setTimeout(() => setPhase("hidden"), hold + ASSETS_FADE);
		return () => {
			clearTimeout(fade);
			clearTimeout(hide);
		};
	}, [counted, pending, missing]);
	if (!assets || phase === "hidden") return null;
	const { head, notes } = assetWords(assets, why);
	const share = (n: number) => `${Math.min(100, (n / Math.max(1, assets.needed)) * 100)}%`;
	return (
		<div
			className={cx(
				"vp-assets",
				pending === 0 && "vp-assets-settled",
				phase === "fading" && "vp-assets-fading",
			)}
			role="status"
			title={`${assets.arrived.toLocaleString()} downloaded, ${assets.uploaded.toLocaleString()} on the GPU`}
		>
			<span className="vp-assets-head">{head}</span>
			{pending > 0 && (
				<span className="vp-assets-bar" aria-hidden="true">
					<span className="vp-assets-arrived" style={{ width: share(assets.arrived + missing) }} />
					<span
						className="vp-assets-uploaded"
						style={{ width: share(assets.uploaded + missing) }}
					/>
				</span>
			)}
			{notes.map((note) => (
				<span key={note} className="vp-assets-note">
					{note}
				</span>
			))}
		</div>
	);
}

/** Settings' own words for a Graphics setting, by key: the panel says what Settings says. */
const SCENE_WORDS = new Map(
	SCENE_VIEW.flatMap((group) => group.settings).map((decl) => [decl.key, decl] as const),
);

/** What View is, which is the panel's own and not a setting. */
const VIEW_WORDS = {
	help: "A quality level, one feature alone, or what the frame costs.",
	detail:
		"A quality level sets the switches as Settings' Quality does; Automatic moves with how fast " +
		"frames are drawn. Final output, one feature shows one part of the picture alone. The views " +
		"under Inspect show the place as the switches leave it: its wireframe, heatmaps and overdraw.",
};

/**
 * A setting in the panel: its name with an "i" for the rest, its one line, and
 * its control beside the name, or with `below`, across the panel under it.
 */
function PanelSetting({
	settingKey,
	words,
	label,
	below = false,
	children,
}: {
	settingKey?: string;
	/** Words of the panel's own, for what is not a setting. */
	words?: { help: string; detail?: string };
	label?: string;
	below?: boolean;
	children: ReactNode;
}) {
	const decl = settingKey ? SCENE_WORDS.get(settingKey) : undefined;
	const said = words ?? decl;
	const name = label ?? decl?.title ?? settingKey ?? "";
	const [open, setOpen] = useState(false);
	const detailId = useId();
	return (
		<div className="render-setting">
			<div className="render-setting-head">
				<span className="render-setting-name">
					{name}
					{said?.detail && (
						<InfoButton
							label={name}
							open={open}
							controls={detailId}
							onToggle={() => setOpen((was) => !was)}
						/>
					)}
				</span>
				{!below && children}
			</div>
			{said && <span className="render-setting-line">{said.help}</span>}
			{open && said?.detail && (
				<p className="render-detail" id={detailId}>
					{said.detail}
				</p>
			)}
			{below && children}
		</div>
	);
}

/**
 * A dropdown whose options say "Auto" for "Automatic" while it has not the
 * room for its chosen words (see autoFit.ts). Its options are drawn by
 * `children`, told whether it is tight; each option that shortens carries
 * its full words in `data-full`.
 */
function FitSelect({
	label,
	value,
	words,
	onChoose,
	children,
}: {
	label: string;
	value: string;
	/** Whatever changes the options' words. */
	words: string;
	onChoose: (value: string) => void;
	children: (tight: boolean) => ReactNode;
}) {
	const [ref, tight] = useTight<HTMLSelectElement>(`${value}|${words}`);
	return (
		<select
			ref={ref}
			className="tb place-edit-field"
			aria-label={label}
			value={value}
			onChange={(e) => onChoose(e.target.value)}
		>
			{children(tight)}
		</select>
	);
}

/** Choices side by side, "Auto" for "Automatic" while a button has not the room. */
function SettingButtons({
	label,
	choices,
	value,
	onChoose,
}: {
	label: string;
	choices: readonly { value: string; label: string }[];
	value: string;
	onChoose: (value: string) => void;
}) {
	const [ref, tight] = useTight<HTMLDivElement>(choices.map((c) => c.label).join("|"));
	return (
		<div ref={ref} className="segmented render-segmented" role="group" aria-label={label}>
			{choices.map((c) => (
				<button
					key={c.value}
					type="button"
					data-full={c.label}
					className={value === c.value ? "on" : ""}
					aria-pressed={value === c.value}
					aria-label={tight && shortAuto(c.label, true) !== c.label ? c.label : undefined}
					onClick={() => onChoose(c.value)}
				>
					{shortAuto(c.label, tight)}
				</button>
			))}
		</div>
	);
}

/**
 * The Graphics settings the Rendering panel offers beside Quality and
 * Antialiasing, so they are at hand while looking at the view: each saved
 * as Settings saves it. Three or four short choices are side by side, so all
 * of them show and each is one tap.
 */
function SceneSettings({
	scene,
	onScene,
}: {
	scene: PlaceEditorSettings;
	onScene: (key: string, value: string | boolean) => void;
}) {
	const scaleLabels = renderScaleLabels(
		typeof devicePixelRatio === "number" ? devicePixelRatio : 1,
		typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent),
	);
	const valueOf = (key: keyof PlaceEditorSettings, choices: readonly { value: string }[]) =>
		String(scene[key] ?? choices[0].value);
	const choice = (
		key: keyof PlaceEditorSettings,
		choices: readonly { value: string; label: string }[],
		labels: Record<string, string> = {},
	) => (
		<PanelSetting settingKey={key} key={key}>
			<FitSelect
				label={SCENE_WORDS.get(key)?.title ?? key}
				value={valueOf(key, choices)}
				words={choices.map((c) => labels[c.value] ?? c.label).join("|")}
				onChoose={(value) => onScene(key, value)}
			>
				{(tight) =>
					choices.map((c) => (
						<option key={c.value} value={c.value} data-full={labels[c.value] ?? c.label}>
							{shortAuto(labels[c.value] ?? c.label, tight)}
						</option>
					))
				}
			</FitSelect>
		</PanelSetting>
	);
	const segmented = (
		key: keyof PlaceEditorSettings,
		choices: readonly { value: string; label: string }[],
	) => (
		<PanelSetting settingKey={key} key={key} below>
			<SettingButtons
				label={SCENE_WORDS.get(key)?.title ?? key}
				choices={choices}
				value={valueOf(key, choices)}
				onChoose={(value) => onScene(key, value)}
			/>
		</PanelSetting>
	);
	return (
		<>
			{choice("frameRate", VIEWPORT_FRAME_RATES)}
			{choice("renderScale", VIEWPORT_RENDER_SCALES, scaleLabels)}
			{segmented("upscale", VIEWPORT_UPSCALES)}
			{segmented("lampResolution", VIEWPORT_LAMP_RESOLUTIONS)}
			{choice("lightGrid", VIEWPORT_LIGHT_GRIDS)}
			{segmented("ambientLighting", VIEWPORT_AMBIENT_LIGHTING)}
			{segmented("skyResolution", VIEWPORT_SKY_RESOLUTIONS)}
			{segmented("bloomResolution", VIEWPORT_BLOOM_RESOLUTIONS)}
			{choice("shadowMapSize", VIEWPORT_SHADOW_MAPS)}
			{segmented("textureResolution", VIEWPORT_TEXTURE_RESOLUTIONS)}
			{choice("stillFrames", VIEWPORT_STILL_FRAMES)}
			{segmented("particleResolution", VIEWPORT_PARTICLE_RESOLUTIONS)}
			{choice("reflectionUpdates", VIEWPORT_REFLECTION_UPDATES)}
			<PanelSetting settingKey="dynamicOptimization">
				<input
					type="checkbox"
					role="switch"
					className="render-toggle"
					aria-label="Dynamic optimization"
					checked={scene.dynamicOptimization === true}
					onChange={(e) => onScene("dynamicOptimization", e.target.checked)}
				/>
			</PanelSetting>
			{segmented("renderer", VIEWPORT_RENDERERS)}
		</>
	);
}

/** What a heatmap's colours mean, under the modes. */
const HEAT_LEGEND: Partial<Record<RenderMode, [string, string]>> = {
	cost: ["Cheap", "Costly"],
	lights: ["No lights", "8 or more"],
};

/** What the colours of Overdraw, Triangle density and Shadow maps mean: see renderLegend. */
function ViewLegend({ legend }: { legend: RenderLegend }) {
	if (legend.kind === "bar")
		return (
			<div className="render-legend">
				<span
					className="render-legend-bar"
					style={{ background: `linear-gradient(to right, ${legend.stops})` }}
				/>
				<span className="render-legend-ends">
					{legend.ticks.map((tick) => (
						<span key={tick}>{tick}</span>
					))}
				</span>
				<span className="render-legend-caption">{legend.caption}</span>
			</div>
		);
	return (
		<ul className="render-legend render-legend-key">
			{legend.items.map((item) => (
				<li key={item.label}>
					<span className="render-legend-swatch" style={{ background: item.colour }} />
					<span>{item.label}</span>
				</li>
			))}
		</ul>
	);
}

const ms = (n: number) => `${n.toFixed(2)} ms`;

/** The graph's colours, from its CSS: see `.render-graph`. */
function graphColours(el: Element) {
	const css = getComputedStyle(el);
	const get = (name: string) => css.getPropertyValue(`--render-graph-${name}`).trim() || "#888";
	return {
		frame: get("frame"),
		guide: get("guide"),
		text: get("text"),
		shadows: get("shadows"),
		scene: get("scene"),
		post: get("post"),
		page: get("page"),
	};
}

/**
 * The last frames, newest on the right: each frame's interval as a line, and
 * under it the GPU's passes stacked where the browser times them, else the
 * page's time; across it, 60 and 30 frames a second.
 */
function paintFrameGraph(canvas: HTMLCanvasElement, history: FrameHistory): void {
	const dpr = Math.min(2, devicePixelRatio || 1);
	const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
	const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	const g = canvas.getContext("2d");
	if (!g) return;
	const c = graphColours(canvas);
	const samples = history.samples();
	const top = graphTop(samples);
	const step = w / history.size;
	const x0 = w - samples.length * step;
	g.clearRect(0, 0, w, h);
	samples.forEach((s, i) => {
		const x = x0 + i * step;
		let below = 0;
		const bar = (ms: number, colour: string) => {
			if (!Number.isFinite(ms) || ms <= 0) return;
			const from = graphY(below, top, h);
			below += ms;
			const to = graphY(below, top, h);
			g.fillStyle = colour;
			g.fillRect(x, to, Math.max(1, step - dpr * 0.5), from - to);
		};
		if (Number.isFinite(gpuTotal(s))) {
			bar(s.shadows, c.shadows);
			bar(s.scene, c.scene);
			bar(s.post, c.post);
		} else bar(s.page, c.page);
	});
	g.font = `${10 * dpr}px system-ui, sans-serif`;
	g.textBaseline = "bottom";
	g.lineWidth = dpr;
	g.setLineDash([3 * dpr, 3 * dpr]);
	g.strokeStyle = c.guide;
	g.fillStyle = c.text;
	let labelled = Number.POSITIVE_INFINITY;
	for (const ms of FRAME_GUIDES) {
		const y = Math.round(graphY(ms, top, h)) + 0.5;
		g.beginPath();
		g.moveTo(0, y);
		g.lineTo(w, y);
		g.stroke();
		// A guide too close to the one below goes unlabelled: the scale's top says how far up it is.
		if (labelled - y < 11 * dpr) continue;
		g.fillText(`${ms.toFixed(1)} ms`, 3 * dpr, y - 1);
		labelled = y;
	}
	g.setLineDash([]);
	g.textBaseline = "top";
	g.textAlign = "right";
	g.fillText(`${top} ms`, w - 3 * dpr, 2 * dpr);
	g.textAlign = "left";
	g.strokeStyle = c.frame;
	g.lineWidth = 1.5 * dpr;
	g.lineJoin = "round";
	g.beginPath();
	samples.forEach((s, i) => {
		const x = x0 + (i + 0.5) * step;
		const y = graphY(s.interval, top, h);
		if (i === 0) g.moveTo(x, y);
		else g.lineTo(x, y);
	});
	g.stroke();
}

/** The frame-time graph, drawn four times a second at most, and only when frames were drawn. */
function FrameGraph({ controller, timed }: { controller: ViewportController; timed: boolean }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let drawn = -1;
		let wide = 0;
		const paint = () => {
			const canvas = ref.current;
			const history = controller.frameHistory();
			if (!canvas || (history.version === drawn && canvas.clientWidth === wide)) return;
			drawn = history.version;
			wide = canvas.clientWidth;
			paintFrameGraph(canvas, history);
		};
		paint();
		const tick = setInterval(paint, 250);
		const unwatch = controller.watchFrames();
		return () => {
			clearInterval(tick);
			unwatch();
		};
	}, [controller]);
	const keys: [string, string][] = timed
		? [
				["shadows", "GPU shadows"],
				["scene", "GPU place"],
				["post", "GPU effects"],
			]
		: [["page", "Page"]];
	return (
		<div className="render-graph">
			<canvas
				ref={ref}
				className="render-graph-canvas"
				role="img"
				aria-label="Frame times, the last 240 frames"
			/>
			<div className="render-graph-legend">
				<span className="render-graph-key render-graph-key-frame">Frame</span>
				{keys.map(([key, label]) => (
					<span className={`render-graph-key render-graph-key-${key}`} key={key}>
						{label}
					</span>
				))}
			</div>
		</div>
	);
}

/**
 * Mesh Debug: the meshes costing the most triangles, and drawn most often.
 * A click picks every copy and frames them.
 */
export function MeshesPanel({ controller }: { controller: ViewportController }) {
	const { heaviest } = useViewport(controller);
	const list = (title: string, meshes: HeavyMesh[], value: (m: HeavyMesh) => string) =>
		meshes.length > 0 && (
			<div className="render-heavy-list">
				<div className="render-heavy-head">{title}</div>
				{meshes.map((m) => {
					const { name, className } = controller.rowName(m.rows[0]);
					return (
						<button
							type="button"
							className="render-heavy-row"
							key={m.key}
							title={`${className}: ${m.copies.toLocaleString()} × ${m.triangles.toLocaleString()} triangles`}
							onClick={() => controller.pickRows(m.rows)}
						>
							<span className="render-heavy-name">{name || className}</span>
							<span className="render-heavy-value">{value(m)}</span>
						</button>
					);
				})}
			</div>
		);
	return (
		<div className="place-properties render-panel">
			<PanelHead sub="Heaviest meshes" />
			<div className="place-props">
				<div className="place-groups">
					<div className="place-group">
						{heaviest ? (
							<>
								{list("By triangles", heaviest.byTriangles, (m) =>
									m.copies > 1 ? `${shortCount(m.total)} · ×${m.copies}` : shortCount(m.total),
								)}
								{list("By copies", heaviest.byCopies, (m) => `×${m.copies.toLocaleString()}`)}
							</>
						) : (
							<p className="place-summary">No meshes drawn yet.</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

/** A Rendering panel switch for a tool, off to begin with: not something the view leaves out. */
function RenderToolSwitch({
	label,
	on,
	onChange,
}: {
	label: string;
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<label className="render-switch">
			<span>{label}</span>
			<input
				type="checkbox"
				role="switch"
				checked={on}
				onChange={(e) => onChange(e.target.checked)}
			/>
		</label>
	);
}

/** A row with a bar: a name, a time and its share of the longest. */
/**
 * A quality level in the profile: its frame, a bar split by its stages, and
 * what it drew at under it. Each stage's time is on its part's hover.
 */
function LevelBar({ row, most }: { row: LevelRow; most: number }) {
	const scale = Number.isFinite(row.median) && most > 0 ? Math.min(1, row.median / most) : 0;
	// The GPU's own times where it has them: the waited ones charge a stage for waiting on the screen.
	const stages = row.gpu.length > 0 ? row.gpu : row.stages;
	const total = stages.reduce((n, s) => n + s.median, 0);
	return (
		<div className="place-prop profile-row profile-level" title={levelSettings(row)}>
			<span className="place-prop-name">{row.label}</span>
			<span className="profile-bar profile-stacked" aria-hidden="true">
				{total > 0 ? (
					stages.map((s) => (
						<span
							key={s.stage}
							className={`profile-stage profile-stage-${s.stage}`}
							style={{ width: `${(s.median / total) * scale * 100}%` }}
							title={`${STAGE_LABELS[s.stage]}: ${msText(s.median)}`}
						/>
					))
				) : (
					<span style={{ width: `${scale * 100}%` }} />
				)}
			</span>
			<span className="place-prop-value profile-time">{msText(row.median)}</span>
			<span className="profile-second">{fpsText(row.median)}</span>
			<span className="profile-level-facts">{levelSettings(row)}</span>
		</div>
	);
}

function TimeBar({
	name,
	hint,
	value,
	second,
	most,
}: {
	name: string;
	hint?: string;
	value: number;
	second?: string;
	most: number;
}) {
	const share = Number.isFinite(value) && most > 0 ? Math.max(0, Math.min(1, value / most)) : 0;
	return (
		<div className="place-prop profile-row" title={hint}>
			<span className="place-prop-name">{name}</span>
			<span className="profile-bar" aria-hidden="true">
				<span style={{ width: `${share * 100}%` }} />
			</span>
			<span className="place-prop-value profile-time">{msText(value)}</span>
			{second !== undefined && <span className="profile-second">{second}</span>}
		</div>
	);
}

/** Puts the report where it can be pasted, or selects it to copy by hand. */
async function copyReport(text: string, area: HTMLTextAreaElement | null): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		area?.focus();
		area?.select();
		return false;
	}
}

/**
 * Profile: the frame measured stage by stage, step by step and at fewer
 * pixels, for a device whose browser has no GPU timers -- see `profile.ts`.
 */
function ProfileSection({
	controller,
	profiling,
	profile,
}: {
	controller: ViewportController;
	profiling: { phase: string; done: number; of: number } | null;
	profile: ProfileResult | null;
}) {
	const [open, toggle] = useFold(true);
	const [copied, setCopied] = useState<"yes" | "select" | null>(null);
	const area = useRef<HTMLTextAreaElement>(null);
	const report = useMemo(() => (profile ? profileReport(profile) : ""), [profile]);
	const stagesMost = Math.max(0, ...(profile?.stages.map((r) => r.p95) ?? []));
	const costs = profile ? stepCosts(profile.steps) : [];
	const costMost = Math.max(0, ...costs.map((c) => (Number.isFinite(c.cost) ? c.cost : 0)));
	const resMost = Math.max(0, ...(profile?.resolution.map((r) => r.median) ?? []));
	return (
		<div className="place-group">
			<SectionHead
				title="Profile"
				open={open}
				onToggle={toggle}
				hint="The frame measured stage by stage, step by step, and at fewer pixels, on any device."
			/>
			{open && (
				<>
					<div className="profile-run">
						<button
							type="button"
							className="tb"
							disabled={profiling !== null}
							onClick={() => {
								setCopied(null);
								void controller.runProfile();
							}}
						>
							{profiling ? "Profiling…" : profile ? "Profile again" : "Profile this view"}
						</button>
						<span className="profile-progress">
							{profiling
								? `${profiling.phase} · ${Math.round((profiling.done / profiling.of) * 100)}%`
								: "About a minute. Keep the view still."}
						</span>
					</div>
					<div className="profile-run">
						<button
							type="button"
							className="tb"
							disabled={profiling !== null}
							onClick={() => startBenchmark("current")}
						>
							Benchmark
						</button>
						<button
							type="button"
							className="tb"
							disabled={profiling !== null}
							onClick={() => startBenchmark("sweep")}
						>
							Full sweep
						</button>
						<span className="profile-progress">
							Roswaal's own test scenes, the editor hidden. Esc stops.
						</span>
					</div>
					{profiling && (
						<div className="profile-meter" aria-hidden="true">
							<span style={{ width: `${(profiling.done / profiling.of) * 100}%` }} />
						</div>
					)}
					{profile && !profiling && (
						<>
							<Rows
								rows={[
									[
										"On screen",
										`${fpsText(profile.baseline.median)} · ${msText(profile.baseline.median)}`,
									],
									[
										"One frame",
										`${msText(profile.frame.median)} · slow ${msText(profile.frame.p95)}`,
									],
								]}
							/>
							{profileVerdict(profile).map((line) => (
								<p className="place-summary profile-verdict" key={line}>
									{line}
								</p>
							))}
							<h4 className="profile-head">
								Stages <span>median · slow frames</span>
							</h4>
							{profile.stages.map((row) => (
								<TimeBar
									key={row.stage}
									name={STAGE_LABELS[row.stage]}
									hint={STAGE_HINTS[row.stage]}
									value={row.median}
									second={msText(row.p95)}
									most={stagesMost}
								/>
							))}
							<TimeBar
								name="All stages"
								value={profile.stageTotal.median}
								second={msText(profile.stageTotal.p95)}
								most={Math.max(stagesMost, profile.stageTotal.median)}
							/>
							<p className="place-summary">
								Each stage is waited for on its own, so together they can take longer than one
								frame.
							</p>
							<h4 className="profile-head">
								Base <span>every feature off</span>
							</h4>
							{profile.base.map((b) => (
								<TimeBar
									key={b.label}
									name={b.label}
									value={b.median}
									second={Number.isFinite(b.median) ? msText(b.p95) : "WebGPU only"}
									most={Math.max(
										...profile.base.map((x) => (Number.isFinite(x.median) ? x.median : 0)),
									)}
								/>
							))}
							{profile.asSet && profile.without.length > 0 && (
								<Rows rows={[["As set, just before", msText(profile.asSet.median)]]} />
							)}
							{profile.without.map((group) => (
								<Fragment key={group.title}>
									<h4 className="profile-head">
										{group.title}, each off alone <span>saves · frame</span>
									</h4>
									{group.rows.map((r) => (
										<TimeBar
											key={r.label}
											name={`Without ${r.label}`}
											value={r.saves}
											second={msText(r.median)}
											most={Math.max(
												0,
												...profile.without.flatMap((g) => g.rows.map((x) => x.saves)),
											)}
										/>
									))}
								</Fragment>
							))}
							<h4 className="profile-head">
								Steps <span>cost · frame</span>
							</h4>
							{costs.map((c) => (
								<TimeBar
									key={c.label}
									name={c.label}
									value={Number.isFinite(c.cost) ? c.cost : c.frame}
									second={Number.isFinite(c.cost) ? msText(c.frame) : "the start"}
									most={Number.isFinite(c.cost) ? costMost : resMost}
								/>
							))}
							<h4 className="profile-head">
								Resolution <span>frame · rate</span>
							</h4>
							{profile.resolution.map((r) => (
								<TimeBar
									key={r.label}
									name={r.label}
									value={r.median}
									second={fpsText(r.median)}
									most={resMost}
								/>
							))}
							{profile.antialias.length > 0 && (
								<>
									<h4 className="profile-head">
										Antialiasing <span>frame · rate</span>
									</h4>
									{profile.antialias.map((r) => (
										<TimeBar
											key={r.label}
											name={r.label}
											value={r.median}
											second={fpsText(r.median)}
											most={Math.max(...profile.antialias.map((x) => x.median))}
										/>
									))}
								</>
							)}
							{profile.precision.length > 0 && (
								<>
									<h4 className="profile-head">
										Shader precision <span>frame · rate</span>
									</h4>
									{profile.precision.map((r) => (
										<TimeBar
											key={r.label}
											name={r.label}
											value={r.median}
											second={fpsText(r.median)}
											most={Math.max(...profile.precision.map((x) => x.median))}
										/>
									))}
								</>
							)}
							{profile.depthPath.length > 0 && (
								<>
									<h4 className="profile-head">
										Depth path <span>frame · rate</span>
									</h4>
									{profile.depthPath.map((r) => (
										<TimeBar
											key={r.label}
											name={r.label}
											value={r.median}
											second={fpsText(r.median)}
											most={Math.max(...profile.depthPath.map((x) => x.median))}
										/>
									))}
								</>
							)}
							{profile.moving.length > 0 && (
								<>
									<h4 className="profile-head">
										Camera moving{" "}
										<span>{profile.moving[0].gpu.length > 0 ? "GPU · rate" : "frame · rate"}</span>
									</h4>
									{profile.moving.map((r) => {
										const value = r.gpu.length > 0 ? r.gpuTotal.median : r.median;
										return (
											<TimeBar
												key={r.label}
												name={r.label}
												hint={
													r.redrawn
														? `Over ${r.frames} frames: ${r.redrawn.probeFaces} reflection faces, ${r.redrawn.nearMaps} near sky maps drawn again`
														: undefined
												}
												value={value}
												second={fpsText(r.median)}
												most={Math.max(
													...profile.moving.map((x) =>
														x.gpu.length > 0 ? x.gpuTotal.median : x.median,
													),
												)}
											/>
										);
									})}
								</>
							)}
							{profile.quality.length > 0 && (
								<>
									<h4 className="profile-head">
										Quality levels <span>frame · rate</span>
									</h4>
									{profile.quality.map((r) => (
										<LevelBar
											key={r.label}
											row={r}
											most={Math.max(...profile.quality.map((x) => x.median))}
										/>
									))}
								</>
							)}
							<h4 className="profile-head">Device</h4>
							<Rows
								rows={[
									["Renderer", profile.facts.renderer],
									["GPU", profile.facts.gpu],
									["GPU timers", profile.facts.gpuTimers ? "Offered" : "Not offered"],
									[
										"Canvas",
										`${profile.facts.canvas.width}×${profile.facts.canvas.height} at ${Number(profile.facts.pixelRatio.toFixed(2))}×`,
									],
									["Quality", profile.facts.quality],
									["Antialiasing", profile.facts.antialias || `${profile.facts.samples}×`],
									["Camera", profile.facts.camera],
									["Clock step", msText(profile.clock)],
								]}
							/>
							<div className="profile-run">
								<button
									type="button"
									className="tb"
									onClick={async () =>
										setCopied((await copyReport(report, area.current)) ? "yes" : "select")
									}
								>
									Copy report
								</button>
								{copied && (
									<span className="profile-progress">
										{copied === "yes" ? "Copied." : "Selected below: copy it from there."}
									</span>
								)}
							</div>
							<textarea
								ref={area}
								className="profile-report"
								readOnly
								value={report}
								aria-label="The profile as text"
								rows={6}
							/>
						</>
					)}
				</>
			)}
		</div>
	);
}

/**
 * Performance: what the last frame took, and the last 240 frames' times.
 * Polled only while the panel is mounted.
 */
export function PerformancePanel({ controller }: { controller: ViewportController }) {
	const { backend, assets, profiling, profile } = useViewport(controller);
	const why = useFailureWhy();
	const [stats, setStats] = useState<RenderStats | null>(null);
	useEffect(() => {
		setStats(controller.renderStats());
		const tick = setInterval(() => setStats(controller.renderStats()), 500);
		return () => clearInterval(tick);
	}, [controller]);
	const gpu = stats?.gpu;
	return (
		<div className="place-properties render-panel">
			<PanelHead sub="Last frame" />
			<div className="place-props">
				<div className="place-groups">
					<div className="place-group">
						<FrameGraph controller={controller} timed={!!gpu} />
						{stats ? (
							<Rows
								rows={[
									["Draw calls", stats.draws.toLocaleString()],
									["Instances", stats.instances.toLocaleString()],
									[
										"Solid parts drawn",
										stats.culled
											? `${stats.culled.drawn.toLocaleString()} of ${stats.culled.of.toLocaleString()}`
											: "All: culling off",
									],
									["Triangles", Math.round(stats.triangles).toLocaleString()],
									["Beams", stats.beams.toLocaleString()],
									["Particles", stats.particles.toLocaleString()],
									["Page", ms(stats.cpu)],
									...((gpu
										? [
												["GPU, shadows", ms(gpu.shadows)],
												["GPU, place", ms(gpu.scene)],
												["GPU, effects", ms(gpu.post)],
											]
										: [
												["GPU", backend === "WebGL2" ? "Not timed in WebGL2" : "Not timed here"],
											]) as [string, string][]),
								]}
							/>
						) : (
							<p className="place-summary">Nothing drawn yet.</p>
						)}
						{assets && (
							<Rows
								rows={[
									[
										"Assets",
										[
											`${assets.uploaded.toLocaleString()} of ${assets.needed.toLocaleString()} loaded`,
											...assetWords(assets, why).notes,
										].join(", "),
									],
								]}
							/>
						)}
						{stats?.memory && <Rows rows={memoryRows(stats.memory)} />}
					</div>
					<ProfileSection controller={controller} profiling={profiling} profile={profile} />
				</div>
			</div>
		</div>
	);
}

/** The panel's tabs: what is kept, the frame's switches, and the tools for looking into it. */
const RENDER_TABS = [
	["picture", "Picture"],
	["switches", "Switches"],
	["inspect", "Inspect"],
] as const;
type RenderTab = (typeof RENDER_TABS)[number][0];

/**
 * How far the panel is pulled up where it is a sheet from the bottom, on a
 * touch screen held upright: enough for what changed last, half the screen,
 * or nearly all of it.
 */
const DETENTS = ["peek", "half", "full"] as const;
type Detent = (typeof DETENTS)[number];
const DETENT_NAMES: Record<Detent, string> = { peek: "Peek", half: "Half", full: "Full" };

const PANEL_PLACE_KEY = "roswaal.renderPanel";

/** The tab and the sheet's height this viewer left the panel at, where the browser keeps them. */
function readPanelPlace(): { tab: RenderTab; detent: Detent } {
	try {
		const saved = JSON.parse(localStorage.getItem(PANEL_PLACE_KEY) ?? "{}");
		return {
			tab: RENDER_TABS.some(([id]) => id === saved.tab) ? saved.tab : "picture",
			detent: DETENTS.includes(saved.detent) ? saved.detent : "half",
		};
	} catch {
		return { tab: "picture", detent: "half" };
	}
}

function keepPanelPlace(place: { tab: RenderTab; detent: Detent }): void {
	try {
		localStorage.setItem(PANEL_PLACE_KEY, JSON.stringify(place));
	} catch {
		// A browser that keeps nothing opens the panel at Picture, half up.
	}
}

type FeatureInfo = (typeof FEATURE_GROUPS)[number]["features"][number];

/**
 * One switch: its name, its "i" and what it waits for, the switch itself. The
 * row is the switch's label, so a tap anywhere on it flips it; a tap on the
 * "i" opens what it does instead.
 */
function SwitchRow({
	info,
	id,
	features,
	base,
	saying,
	onTell,
	onSet,
}: {
	info: FeatureInfo;
	/** Unique in the page: the switch's own, and the prefix of what describes it. */
	id: string;
	features: RenderFeatures;
	base: { label: string; features: RenderFeatures };
	saying: boolean;
	onTell: () => void;
	onSet: (on: boolean) => void;
}) {
	const needs =
		info.parent && !featureOn(features, info.parent) ? FEATURE_LABEL.get(info.parent) : undefined;
	return (
		<>
			<label
				htmlFor={id}
				className={cx(
					"render-switch",
					info.parent && "render-switch-under",
					!featureOn(features, info.key) && features[info.key] && "render-switch-held",
				)}
			>
				<span className="render-switch-name">
					{features[info.key] !== base.features[info.key] && (
						<span className="render-switch-changed" title={`Changed from ${base.label}`} />
					)}
					{info.label}
					<InfoButton label={info.label} open={saying} controls={`${id}-what`} onToggle={onTell} />
					{needs && (
						<span className="render-switch-needs" id={`${id}-needs`}>
							Needs {needs}
						</span>
					)}
				</span>
				<input
					id={id}
					type="checkbox"
					role="switch"
					checked={features[info.key]}
					disabled={needs !== undefined}
					aria-label={info.label}
					aria-describedby={
						[needs ? `${id}-needs` : "", saying ? `${id}-what` : ""].filter(Boolean).join(" ") ||
						undefined
					}
					onChange={(e) => onSet(e.target.checked)}
				/>
			</label>
			{saying && (
				<p className="render-detail render-detail-switch" id={`${id}-what`}>
					{info.hint}
				</p>
			)}
		</>
	);
}

/**
 * Rendering: how the viewer draws the place, as engines' editors offer. Three
 * tabs: Picture, what is kept in Settings too; Switches, a switch for each
 * part of the picture and the ten steps a frame is built in; Inspect, the
 * tools for looking into a frame. On a touch screen held upright it is a sheet
 * from the bottom, pulled to Peek, Half or Full, so the view stays in sight.
 * The view's alone, for the session; the place is untouched.
 */
export function RenderPanel({
	controller,
	onQuality,
	antialias,
	onAntialias,
	scene,
	onScene,
}: {
	controller: ViewportController;
	/** Settings' Quality, chosen here too: "auto" or a level, "1" to "21". */
	onQuality: (quality: string) => void;
	/** Settings' Antialiasing, chosen here too: "auto", or a mode's setting value. */
	antialias: string;
	onAntialias: (antialias: string) => void;
	/** Settings' Graphics, chosen here too: frame rate, render scale, upscaling, renderer, Dynamic optimization. */
	scene?: PlaceEditorSettings;
	onScene?: (key: string, value: string | boolean) => void;
}) {
	const { render, quality, antialiasModes } = useViewport(controller);
	const apply = (next: RenderSettings) => controller.setRender(next);
	const { features } = render;
	// See, the preset and the switches are independent: a switch changes only itself.
	const setFeatures = (next: RenderFeatures) => apply({ ...render, features: next });
	const { step, exact } = stepOf(features);
	const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set(["Post effects"]));
	// The switches whose "i" is open: what each does, under it.
	const [told, setTold] = useState<ReadonlySet<string>>(() => new Set());
	const tell = (key: string) =>
		setTold((was) => {
			const next = new Set(was);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	// The three switches changed last, newest first: what Peek offers.
	const [recent, setRecent] = useState<readonly string[]>([]);
	const flip = (key: keyof RenderFeatures, on: boolean) => {
		setFeatures({ ...features, [key]: on });
		setRecent((was) => [key, ...was.filter((k) => k !== key)].slice(0, 3));
	};
	const [query, setQuery] = useState("");
	// Hold to compare: the switch changed last, turned back while the button is held.
	const holding = useRef(false);
	const [place, setPlace] = useState(readPanelPlace);
	const movePlace = (next: Partial<typeof place>) =>
		setPlace((was) => {
			const moved = { ...was, ...next };
			keepPanelPlace(moved);
			return moved;
		});
	const uid = useId();
	const [toolsOpen, toggleTools] = useFold(false);
	const base = presetById(render.preset);
	const changed = changedFrom(features, base.features).length;
	const toStep = (n: number) =>
		setFeatures(upToStep(Math.max(0, Math.min(RENDER_STEPS.length, n))));
	const choose = (id: string) => {
		const p = presetById(id);
		apply({ ...render, preset: p.id, features: p.features });
	};
	/**
	 * One dropdown for what the panel shows: a preset is the final output with
	 * its switches; an inspecting view keeps the switches as they are, so the
	 * wireframe shows the place as culled, and so on.
	 */
	const pick = (value: string) => {
		const [kind, id] = value.split(":");
		if (kind === "quality") {
			controller.chooseQuality(id === "auto" ? "auto" : Number(id));
			apply({ ...controller.renderSettings(), mode: "lit" });
			onQuality(id);
		} else if (kind === "preset") {
			const p = presetById(id);
			apply({ ...render, mode: "lit", preset: p.id, features: p.features });
		} else apply({ ...render, mode: id as RenderMode });
	};
	const row = (info: FeatureInfo, prefix: string) => (
		<SwitchRow
			key={info.key}
			info={info}
			id={`${uid}-${prefix}-${info.key}`}
			features={features}
			base={base}
			saying={told.has(`${prefix}:${info.key}`)}
			onTell={() => tell(`${prefix}:${info.key}`)}
			onSet={(on) => flip(info.key, on)}
		/>
	);

	// The sheet's grab: dragged up or down a height, or tapped to the next one.
	const grabFrom = useRef<number | null>(null);
	const towards = (by: 1 | -1) => {
		const at = DETENTS.indexOf(place.detent);
		movePlace({ detent: DETENTS[Math.max(0, Math.min(DETENTS.length - 1, at + by))] });
	};
	const endGrab = (y: number) => {
		const from = grabFrom.current;
		grabFrom.current = null;
		if (from === null) return;
		const moved = y - from;
		if (moved < -24) towards(1);
		else if (moved > 24) towards(-1);
		else
			movePlace({
				detent: place.detent === "full" ? "peek" : DETENTS[DETENTS.indexOf(place.detent) + 1],
			});
	};

	const tabKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		const at = RENDER_TABS.findIndex(([id]) => id === place.tab);
		const by = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
		if (by === 0) return;
		e.preventDefault();
		const next = RENDER_TABS[(at + by + RENDER_TABS.length) % RENDER_TABS.length][0];
		movePlace({ tab: next });
		document.getElementById(`${uid}-tab-${next}`)?.focus();
	};

	const searching = query.trim() !== "";
	const found = (info: FeatureInfo) => !searching || matches(query, info.label, info.hint);
	const recentInfos = recent
		.map((key) =>
			FEATURE_GROUPS.flatMap((group) => group.features).find((info) => info.key === key),
		)
		.filter((info): info is FeatureInfo => info !== undefined);
	const last = recentInfos[0];
	const hold = (on: boolean) => {
		if (!last || holding.current === on) return;
		holding.current = on;
		// Flipped and flipped back; never added to the switches changed last.
		setFeatures({ ...features, [last.key]: !features[last.key] });
	};

	return (
		<div className="place-properties render-panel" data-detent={place.detent}>
			<button
				type="button"
				className="render-grab"
				aria-label={`Panel height: ${DETENT_NAMES[place.detent]}. Drag or tap to change it.`}
				onPointerDown={(e) => {
					grabFrom.current = e.clientY;
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerUp={(e) => endGrab(e.clientY)}
				onPointerCancel={() => {
					grabFrom.current = null;
				}}
				onKeyDown={(e) => {
					if (e.key === "ArrowUp") towards(1);
					else if (e.key === "ArrowDown") towards(-1);
					else return;
					e.preventDefault();
				}}
				onClick={(e) => {
					// A keyboard's Enter or Space; a pointer's tap is handled as it lifts.
					if (e.detail === 0)
						movePlace({
							detent: place.detent === "full" ? "peek" : DETENTS[DETENTS.indexOf(place.detent) + 1],
						});
				}}
			>
				<span aria-hidden="true" />
			</button>
			<PanelHead sub="The view only" />
			<div className="render-recent" aria-label="Changed last">
				<span className="render-recent-title">Changed last</span>
				{recentInfos.length === 0 ? (
					<span className="render-setting-line">The switches you change show here.</span>
				) : (
					recentInfos.map((info) => row(info, "recent"))
				)}
			</div>
			<div
				className="segmented render-tabs"
				role="tablist"
				aria-label="Rendering"
				onKeyDown={tabKeys}
			>
				{RENDER_TABS.map(([id, label]) => (
					<button
						key={id}
						type="button"
						role="tab"
						id={`${uid}-tab-${id}`}
						aria-selected={place.tab === id}
						aria-controls={`${uid}-body-${id}`}
						tabIndex={place.tab === id ? 0 : -1}
						className={place.tab === id ? "on" : ""}
						onClick={() => movePlace({ tab: id })}
					>
						{label}
					</button>
				))}
			</div>
			<div
				className="place-props render-tab-body"
				role="tabpanel"
				id={`${uid}-body-${place.tab}`}
				aria-labelledby={`${uid}-tab-${place.tab}`}
			>
				<div className="place-groups">
					{place.tab === "picture" && (
						<div className="place-group">
							<PanelSetting label="View" words={VIEW_WORDS}>
								<FitSelect
									label="View"
									value={
										render.mode !== "lit"
											? `mode:${render.mode}`
											: presetLevel(base.id) === null
												? `preset:${base.id}`
												: quality.auto
													? "quality:auto"
													: `quality:${presetLevel(base.id)}`
									}
									words={`${quality.auto}${quality.level}`}
									onChoose={pick}
								>
									{(tight) => (
										<>
											<optgroup label="Quality">
												<option
													value="quality:auto"
													data-full={
														quality.auto ? `Automatic · Level ${quality.level}` : "Automatic"
													}
												>
													{shortAuto(
														quality.auto ? `Automatic · Level ${quality.level}` : "Automatic",
														tight,
													)}
												</option>
												{QUALITY_PRESETS.map((p) => (
													<option key={p.id} value={`quality:${presetLevel(p.id)}`}>
														{p.label}
													</option>
												))}
											</optgroup>
											<optgroup label="Final output, one feature">
												{DEBUG_PRESETS.map((p) => (
													<option key={p.id} value={`preset:${p.id}`}>
														{p.label}
													</option>
												))}
											</optgroup>
											<optgroup label="Inspect, as the switches leave it">
												{RENDER_MODES.filter(([mode]) => mode !== "lit").map(([mode, label]) => (
													<option key={mode} value={`mode:${mode}`}>
														{label}
													</option>
												))}
											</optgroup>
										</>
									)}
								</FitSelect>
							</PanelSetting>
							<ModeLegends render={render} apply={apply} />
							<PanelSetting settingKey="antialiasing">
								<FitSelect
									label="Antialiasing"
									value={antialias}
									words={antialiasInfo(qualityLevel(quality.level).antialias).label}
									onChoose={onAntialias}
								>
									{(tight) => (
										<>
											<option
												value="auto"
												data-full={`Automatic · ${antialiasInfo(qualityLevel(quality.level).antialias).label}`}
											>
												{shortAuto(
													`Automatic · ${antialiasInfo(qualityLevel(quality.level).antialias).label}`,
													tight,
												)}
											</option>
											{VIEWPORT_ANTIALIAS.filter((a) => {
												const mode = antialiasSetting(a.value);
												return mode !== undefined && antialiasModes.includes(mode);
											}).map((a) => (
												<option key={a.value} value={a.value}>
													{a.label}
												</option>
											))}
										</>
									)}
								</FitSelect>
							</PanelSetting>
							{scene && onScene && <SceneSettings scene={scene} onScene={onScene} />}
						</div>
					)}
					{place.tab === "switches" && (
						<>
							<div className="place-group">
								<input
									type="search"
									className="tb place-edit-field render-search"
									placeholder={`Search ${FEATURE_LABEL.size} switches`}
									aria-label="Search the switches"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
								/>
								{render.mode === "lit" && !searching && (
									<div className="render-step">
										<button
											type="button"
											className="tb icon-only"
											aria-label="Previous step"
											disabled={step === 0 && exact}
											onClick={() => toStep(exact ? step - 1 : step)}
										>
											<Icon name="chevron" size={14} className="render-step-back" />
										</button>
										<span className="render-step-where" aria-live="polite">
											<span className="render-step-count">
												{step === 0 ? "Before step 1" : `Step ${step} of ${RENDER_STEPS.length}`}
											</span>
											<span className="render-step-name">
												{step === 0 ? "Nothing lit" : RENDER_STEPS[step - 1][0]}
												{exact ? "" : ", and more"}
											</span>
										</span>
										<button
											type="button"
											className="tb icon-only"
											aria-label="Next step"
											disabled={step === RENDER_STEPS.length}
											onClick={() => toStep(step + 1)}
										>
											<Icon name="chevron" size={14} className="render-step-on" />
										</button>
									</div>
								)}
							</div>
							{FEATURE_GROUPS.map((group) => {
								const shown = group.features.filter(found);
								if (shown.length === 0) return null;
								const open = searching || !shut.has(group.title);
								const on = group.features.filter((i) => featureOn(features, i.key)).length;
								const allOn = group.features.every((i) => features[i.key]);
								return (
									<div className="place-group" key={group.title}>
										<SectionHead
											title={group.title}
											open={open}
											onToggle={() =>
												setShut((was) => {
													const next = new Set(was);
													if (!next.delete(group.title)) next.add(group.title);
													return next;
												})
											}
										>
											<button
												type="button"
												className="render-group-count"
												aria-label={`${group.title}: ${on} of ${group.features.length} on. Turn them all ${allOn ? "off" : "on"}.`}
												onClick={() =>
													setFeatures({
														...features,
														...Object.fromEntries(group.features.map((i) => [i.key, !allOn])),
													})
												}
											>
												{on}/{group.features.length}
											</button>
										</SectionHead>
										{open && shown.map((info) => row(info, "switch"))}
									</div>
								);
							})}
							{searching && FEATURE_GROUPS.every((group) => !group.features.some(found)) && (
								<p className="render-setting-line render-none">No switch matches.</p>
							)}
						</>
					)}
					{place.tab === "inspect" && (
						<>
							<StartLogSection />
							<ProbeSection controller={controller} />
							<CostlySection controller={controller} onTurnOff={(key) => flip(key, false)} />
							<AutomaticSection controller={controller} />
							<FrameSection controller={controller} />
							<div className="place-group">
								<SectionHead title="Compare" />
								<button
									type="button"
									className="tb render-hold"
									disabled={!last}
									onPointerDown={() => hold(true)}
									onPointerUp={() => hold(false)}
									onPointerLeave={() => hold(false)}
									onPointerCancel={() => hold(false)}
									onContextMenu={(e) => e.preventDefault()}
									onKeyDown={(e) => {
										if ((e.key === " " || e.key === "Enter") && !e.repeat) {
											e.preventDefault();
											hold(true);
										}
									}}
									onKeyUp={() => hold(false)}
								>
									{last ? `Hold to compare: ${last.label}` : "Hold to compare"}
								</button>
								<span className="render-setting-line render-hold-line">
									{last
										? "While held, the switch changed last is turned back; let go to return."
										: "Change a switch first: holding turns it back while held."}
								</span>
							</div>
							<ViewTiles render={render} apply={apply} />
							<GizmoSection controller={controller} />
							<div className="place-group">
								<SectionHead title="Tools" open={toolsOpen} onToggle={toggleTools} />
								{toolsOpen && (
									<>
										<RenderToolSwitch
											label="Light ranges"
											on={render.lightRanges}
											onChange={(lightRanges) => apply({ ...render, lightRanges })}
										/>
										<RenderToolSwitch
											label="Freeze shadows"
											on={render.freezeShadows}
											onChange={(freezeShadows) => apply({ ...render, freezeShadows })}
										/>
									</>
								)}
							</div>
							<CopyReport controller={controller} />
						</>
					)}
				</div>
			</div>
			<div className="render-foot">
				<span>{presetLine(render)}</span>
				<button
					type="button"
					className="tb"
					disabled={changed === 0}
					onClick={() => choose(base.id)}
				>
					Reset
				</button>
			</div>
		</div>
	);
}

/** A view's heat style and what its colours mean: under View in Picture, and under Views in Inspect. */
function ModeLegends({
	render,
	apply,
}: {
	render: RenderSettings;
	apply: (next: RenderSettings) => void;
}) {
	const legend = HEAT_LEGEND[render.mode];
	const viewLegend = renderLegend(render.mode);
	return (
		<>
			{heatStyled(render.mode) && (
				<label className="render-heat">
					<span>Heat</span>
					<select
						className="tb place-edit-field"
						value={render.heat}
						onChange={(e) => apply({ ...render, heat: e.target.value as RenderHeat })}
					>
						{RENDER_HEAT.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
			)}
			{legend && (
				<div className={cx("render-legend", render.mode === "lights" && "render-legend-lights")}>
					<span className="render-legend-bar" />
					<span className="render-legend-ends">
						<span>{legend[0]}</span>
						<span>{legend[1]}</span>
					</span>
				</div>
			)}
			{viewLegend && <ViewLegend legend={viewLegend} />}
		</>
	);
}

/** The views as tiles, one tap each, with what the colours of the one shown mean. */
function ViewTiles({
	render,
	apply,
}: {
	render: RenderSettings;
	apply: (next: RenderSettings) => void;
}) {
	const [open, toggle] = useFold(true);
	return (
		<div className="place-group">
			<SectionHead title="Views" open={open} onToggle={toggle} />
			{open && (
				<>
					<div className="view-tiles">
						{RENDER_MODES.map(([mode, label]) => (
							<button
								key={mode}
								type="button"
								className={render.mode === mode ? "on" : ""}
								aria-pressed={render.mode === mode}
								onClick={() => apply({ ...render, mode })}
							>
								{label}
							</button>
						))}
					</div>
					<ModeLegends render={render} apply={apply} />
				</>
			)}
		</div>
	);
}

/** This frame's time, stage by stage where the browser times them: Performance's graph. */
function FrameSection({ controller }: { controller: ViewportController }) {
	const [open, toggle] = useFold(true);
	const [timed, setTimed] = useState(false);
	useEffect(() => {
		const read = () => setTimed(!!controller.renderStats()?.gpu);
		read();
		const every = setInterval(read, 1000);
		return () => clearInterval(every);
	}, [controller]);
	return (
		<div className="place-group">
			<SectionHead title="This frame" open={open} onToggle={toggle} />
			{open && <FrameGraph controller={controller} timed={timed} />}
		</div>
	);
}

/** The version, the browser, Automatic's choices and the start log, as text for a report. */
function CopyReport({ controller }: { controller: ViewportController }) {
	const [said, setSaid] = useState("");
	const copy = async () => {
		const text = [
			`Roswaal ${VERSION}`,
			typeof navigator === "undefined" ? "" : navigator.userAgent,
			controller.cameraText(),
			"",
			"Automatic's choices",
			automaticText(controller),
			"",
			"Start log",
			...startRuns().map(startText),
		].join("\n");
		try {
			await navigator.clipboard.writeText(text);
			setSaid("Copied");
		} catch {
			setSaid("Copy failed");
		}
		setTimeout(() => setSaid(""), 2000);
	};
	return (
		<div className="place-group render-report">
			<button type="button" className="tb" onClick={copy}>
				{said || "Copy report"}
			</button>
			<span className="render-setting-line">
				The version, the browser, the camera, Automatic's choices and the start log, to paste into
				an issue.
			</span>
		</div>
	);
}

/**
 * What's costly here: each switch that is on, turned off alone at this view,
 * and the three that save most, each a tap from being turned off.
 */
function CostlySection({
	controller,
	onTurnOff,
}: {
	controller: ViewportController;
	onTurnOff: (key: keyof RenderFeatures) => void;
}) {
	const { profiling } = useViewport(controller);
	const [open, toggle] = useFold(true);
	const [rows, setRows] = useState<
		{ key: keyof RenderFeatures; label: string; saves: number }[] | null
	>(null);
	const [ran, setRan] = useState(false);
	const run = async () => {
		setRows(null);
		setRows(await controller.costlyHere());
		setRan(true);
	};
	return (
		<div className="place-group">
			<SectionHead title="What's costly here" open={open} onToggle={toggle} />
			{open && (
				<>
					<button
						type="button"
						className="tb render-hold"
						disabled={profiling !== null}
						onClick={() => void run()}
					>
						{profiling
							? `${profiling.phase} · ${profiling.done} of ${profiling.of}`
							: "Find what's costly here"}
					</button>
					{rows && rows.length > 0 ? (
						<ol className="costly-rows" aria-live="polite">
							{rows.map((row) => (
								<li key={row.key}>
									<span>
										{row.label}
										<span className="render-setting-line">
											saves {row.saves.toFixed(1)} ms a frame
										</span>
									</span>
									<button type="button" className="tb" onClick={() => onTurnOff(row.key)}>
										Turn off
									</button>
								</li>
							))}
						</ol>
					) : (
						<span className="render-setting-line render-hold-line">
							{ran
								? "Nothing saves a measurable time here: the frame is cheap at this view."
								: "Turns each switch that is on off alone, here, and names the three that save most. A few seconds: keep the view still."}
						</span>
					)}
				</>
			)}
		</div>
	);
}

/** Light objects by kind, in words: "9 SurfaceLights, 2 PointLights". */
function lightKinds(lights: { point: number; spot: number; surface: number }): string {
	const kinds: [number, string][] = [
		[lights.surface, "SurfaceLight"],
		[lights.point, "PointLight"],
		[lights.spot, "SpotLight"],
	];
	return kinds
		.filter(([n]) => n > 0)
		.map(([n, kind]) => `${n} ${kind}${n === 1 ? "" : "s"}`)
		.join(", ");
}

/**
 * The pixel probe: armed, a tap on the view says what is there and what it
 * costs to shade, and marks the spot. Put away when Inspect is left, so a tap
 * picks again.
 */
function ProbeSection({ controller }: { controller: ViewportController }) {
	const { probe } = useViewport(controller);
	const [open, toggle] = useFold(true);
	useEffect(() => () => controller.armProbe(false), [controller]);
	const found = probe.result;
	const cost = found ? probeCost(found) : null;
	return (
		<div className="place-group">
			<SectionHead title="Probe" open={open} onToggle={toggle} />
			{open && (
				<>
					<button
						type="button"
						className={cx("tb render-hold", probe.armed && "on")}
						aria-pressed={probe.armed}
						onClick={() => controller.armProbe(!probe.armed)}
					>
						{probe.armed ? "Probing: tap the view" : "Probe a spot"}
					</button>
					{found && cost ? (
						<dl className="auto-lines" aria-live="polite">
							<div>
								<dt>Part</dt>
								<dd>
									{found.name || "A part"}
									<span className="render-setting-line">
										{found.className && found.className !== found.name
											? `${found.className} · `
											: ""}
										{found.distance.toFixed(1)} studs away
									</span>
								</dd>
							</div>
							<div>
								<dt>Material</dt>
								<dd>{found.material}</dd>
							</div>
							<div>
								<dt>Light objects</dt>
								<dd>
									{found.lights.total === 0 ? "None reach it" : found.lights.total}
									{found.lights.total > 0 && (
										<span className="render-setting-line">{lightKinds(found.lights)}</span>
									)}
								</dd>
							</div>
							<div>
								<dt>Sun</dt>
								<dd>
									{found.sun === "lit"
										? "Lit"
										: found.sun === "in shadow"
											? "In shadow"
											: "Faces away"}
								</dd>
							</div>
							<div>
								<dt>Sky</dt>
								<dd>{`${Math.round(found.sky * 100)}% seen`}</dd>
							</div>
							<div>
								<dt>Cost</dt>
								<dd>
									{cost.level === "high" ? "High" : cost.level === "medium" ? "Medium" : "Low"}
									<span className="render-setting-line">{cost.why}.</span>
								</dd>
							</div>
						</dl>
					) : (
						<span className="render-setting-line render-hold-line">
							{probe.armed
								? "Tap anywhere on the place. The sky has nothing to probe."
								: "Arm it, then tap the view: what is there, and what it costs to shade."}
						</span>
					)}
				</>
			)}
		</div>
	);
}

/** A switch's name, by key: what a switch held off waits for. */
const FEATURE_LABEL = new Map(
	FEATURE_GROUPS.flatMap((group) => group.features).map((info) => [info.key, info.label] as const),
);

/**
 * The preset chosen, and how many switches are changed from it: "Level 10",
 * "Custom (from Level 15) · 2 changed".
 */
function presetLine(render: RenderSettings): string {
	const base = presetById(render.preset);
	const changed = changedFrom(render.features, base.features).length;
	if (changed === 0) return base.label;
	const level = presetLevel(base.id);
	const from = level === null ? base.label : `Custom (from Level ${level})`;
	return `${from} · ${changed} changed`;
}
