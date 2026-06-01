/**
 * Opens a native browser file picker dialog for selecting a single file.
 * @param accept A comma-separated series of unique file extensions. For example: ".png,.jpeg"
 * @returns The file if selected, null if cancelled.
 */
export async function pickFile(accept: string): Promise<File | null> {
	if (typeof document === 'undefined' || !('createElement' in document))
		throw new TypeError('This function can only be called from the browser.');

	return new Promise((resolve) => {
		const input = document.createElement('input');
		Object.assign(input, { type: 'file', accept });
		input.onchange = () => resolve(input.files?.[0] ?? null);
		input.oncancel = () => resolve(null);
		input.click();
	});
}
