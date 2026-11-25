/**
 * "Automatic" as "Auto" where a control in the Rendering panel has not the
 * room for it: a dropdown's chosen words, or a choice among side-by-side
 * buttons.
 *
 * Each control measures its full words in its own font against the room it
 * has, whenever its size or its words change. Always the full words, so a
 * control that shortened itself does not then find room and lengthen again:
 * it lengthens only once its own room grows.
 */

import { type RefObject, useEffect, useRef, useState } from "react";

/** The word, shortened. */
export function shortAuto(label: string, short: boolean): string {
	return short ? label.replace(/^Automatic\b/, "Auto") : label;
}

/** What a dropdown's arrow takes of its width, beside its padding. */
const ARROW = 18;

let canvas: CanvasRenderingContext2D | null | undefined;

/** The width of `text` in `el`'s font, in CSS pixels. */
function textWidth(text: string, el: Element): number {
	if (canvas === undefined) canvas = document.createElement("canvas").getContext("2d");
	if (!canvas) return 0;
	const cs = getComputedStyle(el);
	canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
	return canvas.measureText(text).width;
}

/** The room inside an element, less its padding and anything else it draws. */
function room(el: HTMLElement, besides = 0): number {
	const cs = getComputedStyle(el);
	return (
		el.clientWidth -
		Number.parseFloat(cs.paddingLeft) -
		Number.parseFloat(cs.paddingRight) -
		besides
	);
}

/**
 * Whether the full words fit: a dropdown's chosen option's, or every button's
 * in a group, each from its `data-full`.
 */
function fits(el: HTMLElement): boolean {
	if (el instanceof HTMLSelectElement) {
		const option = el.selectedOptions[0];
		const full = option?.dataset.full ?? option?.textContent ?? "";
		return textWidth(full, el) <= room(el, ARROW);
	}
	return [...el.querySelectorAll<HTMLElement>("[data-full]")].every(
		(button) => textWidth(button.dataset.full ?? "", button) <= room(button),
	);
}

/**
 * A control that says whether it is too tight for its full words: its ref,
 * and true while they do not fit. `words` is whatever changes them: the value
 * chosen, or the labels.
 */
export function useTight<T extends HTMLElement>(words: string): [RefObject<T | null>, boolean] {
	const ref = useRef<T>(null);
	const [tight, setTight] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: new words are measured again; they are read from the page, not from here
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const check = () => setTight(!fits(el));
		check();
		const watch = new ResizeObserver(check);
		watch.observe(el);
		return () => watch.disconnect();
	}, [words]);
	return [ref, tight];
}
