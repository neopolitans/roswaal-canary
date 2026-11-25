/**
 * The start log: each step of opening a place in the 3D view, with how long
 * after the start it came, written to the browser's storage as it happens.
 *
 * A page that freezes cannot say where it stopped, and a reload forgets what
 * it was doing. The next start can say it, from what the last one wrote
 * before it froze: so each step is written at once, synchronously, and a
 * start that never reached its end is reported as having stopped at its last
 * step. Kept in this browser only, for the last few starts.
 */

/** One step: what happened, and when, in milliseconds after its start began. */
export interface StartStep {
	at: number;
	step: string;
	note?: string;
}

/** One start: when it began, its steps in order, and whether it reached its end. */
export interface StartRun {
	/** When it began, as an ISO time. */
	/** Which start it is: unique, where two can begin in the same millisecond. */
	id: string;
	started: string;
	/** What began it: a view made, or a place opened into a view already made. */
	kind: string;
	steps: StartStep[];
	done: boolean;
}

const KEY = "roswaal.startLog";
/** The starts kept: this one and the two before it. */
const KEEP = 3;
/** Steps kept for one start: a counter updates its own step rather than adding more. */
const MOST_STEPS = 60;

export const START_LOG_EVENT = "roswaal:start-log";

let current: StartRun | null = null;
let began = 0;
/** Starts begun on this page: part of each start's id. */
let made = 0;

function read(): StartRun[] {
	try {
		const runs = JSON.parse(localStorage.getItem(KEY) ?? "[]");
		return Array.isArray(runs) ? runs : [];
	} catch {
		return [];
	}
}

function write(runs: StartRun[]): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(runs.slice(0, KEEP)));
	} catch {
		// A browser that keeps nothing has no log; the view starts the same.
	}
	if (typeof dispatchEvent === "function") dispatchEvent(new Event(START_LOG_EVENT));
}

/** The current start written over its place at the head of the list. */
function save(): void {
	if (!current) return;
	const runs = read();
	const at = runs.findIndex((run) => run.id === current?.id);
	if (at >= 0) runs[at] = current;
	else runs.unshift(current);
	write(runs);
}

function now(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now();
}

/** A start begins: a new view, or another place into the view there is. */
export function beginStart(kind: string, note?: string): void {
	began = now();
	current = {
		id: `${Date.now()}-${++made}`,
		started: new Date().toISOString(),
		kind,
		steps: [],
		done: false,
	};
	logStep(kind, note);
}

/**
 * A step of the start under way, written at once. `counting` updates the last
 * step when it is the same one, for a step that repeats: pipelines compiled.
 */
export function logStep(step: string, note?: string, counting = false): void {
	if (!current) return;
	const entry: StartStep = { at: Math.round(now() - began), step, ...(note ? { note } : {}) };
	const last = current.steps.at(-1);
	if (counting && last?.step === step) current.steps[current.steps.length - 1] = entry;
	else if (current.steps.length < MOST_STEPS) current.steps.push(entry);
	save();
}

/** The start reached its end: nothing more is waited for. */
export function endStart(step: string, note?: string): void {
	if (!current || current.done) return;
	logStep(step, note);
	current.done = true;
	save();
}

/** Whether a start is under way and has not ended. */
export function startOpen(): boolean {
	return current !== null && !current.done;
}

/** The starts kept, newest first. */
export function startRuns(): StartRun[] {
	return read();
}

/**
 * The start before this page's, where it never reached its end: the page
 * froze, or was closed or reloaded, before it did.
 */
export function unfinishedBefore(
	runs: readonly StartRun[],
	thisPage: string | null,
): StartRun | null {
	const before = runs.find((run) => run.id !== thisPage);
	return before && !before.done && before.steps.length > 0 ? before : null;
}

/** The start under way on this page, if any: its id. */
export function thisPageStart(): string | null {
	return current?.id ?? null;
}

export function clearStartLog(): void {
	write(current ? [current] : []);
}

/** A start as text, to paste into a report. */
export function startText(run: StartRun): string {
	const head = `${run.kind}, ${run.started}${run.done ? "" : " (did not finish)"}`;
	const lines = run.steps.map(
		(s) => `${String(s.at).padStart(7)} ms  ${s.step}${s.note ? ` (${s.note})` : ""}`,
	);
	return [head, ...lines].join("\n");
}
