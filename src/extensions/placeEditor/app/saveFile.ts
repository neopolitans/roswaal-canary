/**
 * A file the Place Editor hands over: a benchmark's results, a settings
 * profile. To the downloads; on a touch screen, where a download is not
 * offered (iPad, iPhone), the share sheet.
 */

export async function saveFile(
	name: string,
	text: string,
	type = "application/json",
): Promise<void> {
	const file = new File([text], name, { type });
	const touch = typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
	if (touch && navigator.canShare?.({ files: [file] })) {
		try {
			// The file alone: with a title or text beside it, Save to Files
			// saves that too, as a text file of its own (an iPad, 26 Nov 2026).
			await navigator.share({ files: [file] });
			return;
		} catch {
			// Dismissed, or refused: the download below.
		}
	}
	const url = URL.createObjectURL(file);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}
