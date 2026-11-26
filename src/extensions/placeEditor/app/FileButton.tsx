/**
 * A button that opens a file picker, drawn as every other button is: a
 * label wrapped round a file input took none of `button.tb`'s look or its
 * touch-screen size (1.1.0-canary.132). The input is hidden, and cleared
 * once read, so the same file picked again is a change.
 */

import { useRef } from "react";

export function FileButton({
	label,
	accept,
	multiple = false,
	onFiles,
}: {
	label: string;
	accept: string;
	multiple?: boolean;
	onFiles: (files: File[]) => void | Promise<void>;
}) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<>
			<button type="button" className="tb" onClick={() => input.current?.click()}>
				{label}
			</button>
			<input
				ref={input}
				type="file"
				accept={accept}
				multiple={multiple}
				hidden
				onChange={(e) => {
					const files = Array.from(e.currentTarget.files ?? []);
					e.currentTarget.value = "";
					if (files.length > 0) void onFiles(files);
				}}
			/>
		</>
	);
}
