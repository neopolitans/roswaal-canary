/**
 * What a Settings page is built from: groups, rows and switches, and the
 * search they answer to.
 *
 * Its own module so an extension's pages are built from the same parts as the
 * editor's, and read the same while searching.
 */

import { createContext, type ReactNode, useContext, useId, useState } from "react";

import { Icon } from "./icons.jsx";

/**
 * What the search box holds, and whether the page being drawn matched it by
 * name -- in which case all of it shows, rows and all.
 */
export const Search = createContext<{ query: string; page: boolean }>({ query: "", page: false });

/** Whether every word typed is somewhere in the text, ignoring case. */
export function matches(query: string, ...texts: string[]): boolean {
	const text = texts.join(" ").toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => text.includes(word));
}

/** Rows that belong together, under a small heading, in one box. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="settings-group">
			<h3>{title}</h3>
			<div className="settings-box">{children}</div>
		</div>
	);
}

/**
 * The "i" beside a name that opens what it does in full. A tap, never a
 * hover, so it works on a touch screen; its target is 44 points there.
 */
export function InfoButton({
	label,
	open,
	controls,
	onToggle,
}: {
	/** What it is about: read out as "More about {label}". */
	label: string;
	open: boolean;
	/** The id of what it opens. */
	controls: string;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			className="info-button"
			aria-label={`More about ${label}`}
			aria-expanded={open}
			aria-controls={controls}
			onClick={onToggle}
		>
			<span aria-hidden="true">i</span>
		</button>
	);
}

/**
 * One setting: its name and what it is, its control at the right, and with
 * `detail`, an "i" that opens the rest. While searching, shown only when it
 * matches. `changed` marks one not at its default, with `onReset` to put it
 * back.
 */
export function Row({
	label,
	help,
	detail,
	children,
	changed,
	onReset,
	resetTitle,
}: {
	label: string;
	help: string;
	detail?: string;
	children?: ReactNode;
	changed?: boolean;
	onReset?: () => void;
	resetTitle?: string;
}) {
	const { query, page } = useContext(Search);
	const [open, setOpen] = useState(false);
	const detailId = useId();
	if (query && !page && !matches(query, label, help, detail ?? "")) return null;
	return (
		<div className={changed ? "setting is-changed" : "setting"}>
			<div className="setting-label">
				<span className="setting-name">
					<strong>{label}</strong>
					{detail && (
						<InfoButton
							label={label}
							open={open}
							controls={detailId}
							onToggle={() => setOpen((was) => !was)}
						/>
					)}
				</span>
				<span>{help}</span>
				{detail && open && (
					<span className="setting-detail" id={detailId}>
						{detail}
					</span>
				)}
			</div>
			{(children || (changed && onReset)) && (
				<div className="setting-control">
					{changed && onReset && (
						<button
							type="button"
							className="tb icon-only settings-reset"
							title={resetTitle ?? "Reset"}
							aria-label={resetTitle ?? "Reset"}
							onClick={onReset}
						>
							<Icon name="undo" size={14} />
						</button>
					)}
					{children}
				</div>
			)}
		</div>
	);
}

/** A switch with what it does now beside it. */
export function Toggle({
	on,
	label,
	onChange,
	disabled,
}: {
	on: boolean;
	label: string;
	onChange: (on: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<label className={disabled ? "settings-toggle is-disabled" : "settings-toggle"}>
			<input
				type="checkbox"
				checked={on}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
			/>
			<span>{label}</span>
		</label>
	);
}
