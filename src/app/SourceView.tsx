/**
 * A `.luau` file in the project, shown properly.
 *
 * Roswaal writes Luau and also lives in a repository full of Luau it did not
 * write. Both kinds turn up in the tree: the generated file is the thing you
 * most want to *read* carefully, and the hand-written one is the thing you
 * most want to *edit*.
 *
 * So it is a real editor view, using the same tokeniser and the same
 * colours as the code editor. And it says which kind of file it is, because
 * that changes what you should do with it:
 *
 *  - **generated** — Roswaal owns it, and the next compile writes over it, so
 *    it is read-only here. The header says so and offers the graph that
 *    produced it.
 *  - **hand-written** — yours, and edited here (1.1.0): on a tablet there is
 *    no other editor to hand it to. What is typed is saved after a pause, on
 *    leaving the editor, and on Ctrl+S. The file changing on disk shows here
 *    unless there is typing not yet saved, which wins until it is. **Open in
 *    VS Code** still hands it over where there is a VS Code.
 */

import { lintGutter } from "@codemirror/lint";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../core/errorMessage.js";
import { argumentProblems } from "../core/luau/argumentTypes.js";
import type { ModuleInfo } from "../core/luau/hover.js";
import type { TableMember } from "../core/luau/infer.js";
import { type InstanceNode, indexFromOutline, instanceProblems } from "../core/luau/instances.js";
import type { Target } from "../core/schema.js";
import { api } from "./api.js";
import type { SourceDoc } from "./centreDocument.js";
import { cx } from "./cx.js";
import { NOT_HERE, useHostCan } from "./host.js";
import { luauCompletionSource } from "./luauCompletions.js";
import { luauExtensions } from "./luauExtensions.js";
import { luauWarnings } from "./luauLint.js";
import { useMedia } from "./Popout.js";

export type { SourceDoc } from "./centreDocument.js";

export interface SourceViewProps {
	doc: SourceDoc;
	/** Opens the graph a generated file came from. */
	onOpenGraph: (path: string) => void;
	/** Hands the file to VS Code, reporting which editor answered. */
	onEdit: (path: string) => void;
	onReveal: (path: string) => void;
	/** Saves a hand-written file's text; without it, the file is read-only here. */
	onSave?: (path: string, text: string) => Promise<void>;
}

/** A change that came from the file on disk, not from typing: not saved back. */
const fromDisk = Annotation.define<boolean>();

/** How long typing pauses before it is saved. */
const SAVE_AFTER_MS = 800;

type SaveState = "saved" | "saving" | "unsaved" | { error: string };

/**
 * Whether a file is Lune code or Roblox code, for what its hover offers.
 *
 * A Lune program reaches its standard library through `require("@lune/…")`,
 * and a Roblox script cannot, so a file that requires one is Lune. Anything
 * else is read as Roblox, which is what most `.luau` in a project is.
 */
function targetOfSource(text: string): Target {
	return /require\s*\(?\s*["']@lune\//.test(text) ? "lune" : "roblox";
}

export function SourceView({ doc, onOpenGraph, onEdit, onReveal, onSave }: SourceViewProps) {
	// Both need a machine: an editor to hand the file to, and a file manager
	// to show it in. Disabled rather than gone -- they describe what the tool
	// does, and their titles say where it does it.
	const canEdit = useHostCan("edit");
	const canReveal = useHostCan("reveal");
	// A phone or a tablet wraps long lines: a swipe down the file also
	// scrolled it sideways, and left every line cut off at the left.
	const phone = useMedia("(max-width: 699px), (hover: none) and (pointer: coarse)");
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const [copied, setCopied] = useState(false);
	const generated = doc.generatedFrom !== undefined;
	const editable = !generated && onSave !== undefined;
	// The text as it is in the editor, typed or not: for the line count and Copy.
	const [text, setText] = useState(doc.text);
	const [saveState, setSaveState] = useState<SaveState>("saved");
	// Typing the file on disk has not had yet, and the pause before it does.
	const dirty = useRef(false);
	const timer = useRef<number | undefined>(undefined);
	const latest = useRef({ path: doc.path, text: doc.text, onSave });
	latest.current = { path: doc.path, text: doc.text, onSave };
	const save = useRef(async () => {
		window.clearTimeout(timer.current);
		const v = view.current;
		const write = latest.current.onSave;
		if (!v || !dirty.current || !write) return;
		const now = v.state.doc.toString();
		dirty.current = false;
		setSaveState("saving");
		try {
			await write(latest.current.path, now);
			setSaveState(dirty.current ? "unsaved" : "saved");
		} catch (err) {
			dirty.current = true;
			setSaveState({ error: errorMessage(err) });
		}
	});
	// Leaving the tab saves what is waiting rather than dropping it.
	useEffect(
		() => () => {
			if (dirty.current) void save.current();
		},
		[],
	);

	// Rebuilt when the file changes rather than reconfigured: the document is
	// read-only, so there is no state in here worth preserving across a switch.
	// What the file's `require`s hold, followed by the host: `Flux.new` hovers
	// with the module's own signature and comment. Asked once per file, and
	// read through refs, so the editor is not rebuilt when the answer lands.
	const members = useRef<ReadonlyMap<string, TableMember[]>>(new Map());
	const modules = useRef<ReadonlyMap<string, ModuleInfo>>(new Map());
	// The DataModel the project knows, and where this file is in it: for a
	// name like `Shared` to hover as the instance it is, and a name that is
	// nowhere to be marked. Kept in state, since the marks are drawn from it.
	const [instances, setInstances] = useState<{ root: InstanceNode; self?: string[] } | null>(null);
	const warnings = useRef(new Compartment());
	const instancesRef = useRef(instances);
	instancesRef.current = instances;
	useEffect(() => {
		members.current = new Map();
		modules.current = new Map();
		let live = true;
		Promise.all([api.luauModules(doc.path), api.instances()]).then(
			([{ modules: found, self }, { outline }]) => {
				if (!live) return;
				members.current = new Map(found.map((m) => [m.name, m.members]));
				modules.current = new Map(found.map((m) => [m.name, m]));
				setInstances({ root: indexFromOutline(outline), ...(self ? { self } : {}) });
			},
			() => {
				// The file still shows, highlighted; only the hover on requires and
				// the instance warnings are missing, and they are extras on a view.
			},
		);
		return () => {
			live = false;
		};
	}, [doc.path, doc.text]);

	useEffect(() => {
		if (!host.current) return;
		const target = () => targetOfSource(view.current?.state.doc.toString() ?? latest.current.text);
		const editing = editable
			? [
					EditorView.updateListener.of((update) => {
						if (!update.docChanged) return;
						setText(update.state.doc.toString());
						if (update.transactions.some((t) => t.annotation(fromDisk))) return;
						dirty.current = true;
						setSaveState("unsaved");
						window.clearTimeout(timer.current);
						timer.current = window.setTimeout(() => void save.current(), SAVE_AFTER_MS);
					}),
					EditorView.domEventHandlers({
						blur: () => {
							void save.current();
							return false;
						},
					}),
					Prec.high(
						keymap.of([
							{
								key: "Mod-s",
								preventDefault: true,
								run: () => {
									void save.current();
									return true;
								},
							},
						]),
					),
				]
			: [];
		const instance = new EditorView({
			state: EditorState.create({
				doc: latest.current.text,
				// Read-only where it is not edited here, but focusable: the cursor
				// shows and moves with the arrow keys, and the highlighted line
				// follows it. `editable.of(false)` would hide the cursor, so the
				// line only moved where it was clicked.
				extensions: luauExtensions({
					readOnly: !editable,
					...(editable
						? {
								completion: luauCompletionSource(
									() => [],
									target,
									() => members.current,
									() => instancesRef.current,
								),
							}
						: {}),
					// The code editor's hover, here too: what every name is and
					// where its Roblox docs page is, in a file that cannot be edited.
					hover: {
						target,
						members: () => members.current,
						modules: () => modules.current,
						instances: () => instancesRef.current,
					},
					// Names the place and the project do not have, under the
					// containers that are settled before the game runs: filled in
					// once the host answers, without rebuilding the view.
					extra: [warnings.current.of([]), ...(phone ? [EditorView.lineWrapping] : []), ...editing],
				}),
			}),
			parent: host.current,
		});
		view.current = instance;
		setText(instance.state.doc.toString());
		return () => {
			instance.destroy();
			view.current = null;
		};
	}, [doc.path, phone, editable]);

	// The file as it is on disk now -- a compile, a save from elsewhere --
	// unless there is typing here it has not had, which wins until saved.
	useEffect(() => {
		const v = view.current;
		if (!v || dirty.current) return;
		if (v.state.doc.toString() === doc.text) return;
		v.dispatch({
			changes: { from: 0, to: v.state.doc.length, insert: doc.text },
			annotations: fromDisk.of(true),
		});
	}, [doc.text]);

	useEffect(() => {
		const known = instances;
		view.current?.dispatch({
			effects: warnings.current.reconfigure(
				targetOfSource(doc.text) !== "lune"
					? [
							lintGutter(),
							luauWarnings((text) => [
								...(known ? instanceProblems(text, known.root, known.self) : []),
								...argumentProblems(text, "block"),
							]),
						]
					: [],
			),
		});
	}, [instances, doc.text]);

	useEffect(() => {
		if (!copied) return;
		const id = window.setTimeout(() => setCopied(false), 1600);
		return () => window.clearTimeout(id);
	}, [copied]);

	const name = doc.path.split("/").pop() ?? doc.path;
	const lines = text === "" ? 0 : text.split(NEWLINE).length;
	const saveText =
		typeof saveState === "object"
			? `Not saved: ${saveState.error}`
			: saveState === "saving"
				? "Saving…"
				: saveState === "unsaved"
					? "Unsaved"
					: "Saved";

	return (
		<div className="source">
			<div className="source-head">
				<span className="name">{name}</span>
				<span className={cx("badge", generated && "generated")}>
					{generated ? "generated" : "hand-written"}
				</span>
				<span className="meta">{lines} lines</span>
				{editable && (
					<span
						className={cx("meta", "source-save", typeof saveState === "object" && "failed")}
						role="status"
					>
						{saveText}
					</span>
				)}

				<span style={{ flex: 1 }} />

				{generated ? (
					<button
						className="tb"
						title="Open the graph this was compiled from"
						onClick={() => onOpenGraph(doc.generatedFrom!)}
					>
						Open the graph
					</button>
				) : (
					<button
						className="tb primary"
						disabled={!canEdit}
						title={canEdit ? "Hand this file to VS Code" : NOT_HERE}
						onClick={() => onEdit(doc.path)}
					>
						Open in VS Code
					</button>
				)}
				<button
					className="tb"
					disabled={!canReveal}
					title={canReveal ? undefined : NOT_HERE}
					onClick={() => onReveal(doc.path)}
				>
					Show in folder
				</button>
				<button
					className="tb"
					onClick={() => {
						void navigator.clipboard.writeText(text).then(
							() => setCopied(true),
							// A refused clipboard is not worth a dialog: the text is
							// selectable and Ctrl+C is right there.
							() => undefined,
						);
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>

			<p className="source-note">
				{generated ? (
					<>
						Roswaal writes this file. Anything you change here is replaced by the next compile —
						edit the graph instead.
					</>
				) : editable ? (
					<>Roswaal does not touch this file. What you type here is saved as you go.</>
				) : (
					<>
						Roswaal does not touch this file. It is read-only here so nothing can be changed by
						accident; open it in your editor to work on it.
					</>
				)}
			</p>

			<div className="source-body" ref={host} />
		</div>
	);
}

/** Written as a code unit so the escape survives the build. */
const NEWLINE = String.fromCharCode(10);
