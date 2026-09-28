import { z } from 'zod';
import { toastError } from '$lib/api/errors';
import { trackSchema, type TrackType } from '$lib/types/annotation.type';

const clipboardSchema = z.array(trackSchema).min(1);

export function parseCells(text: string): TrackType[] | null {
	try {
		return clipboardSchema.parse(JSON.parse(text));
	} catch {
		toastError('The clipboard holds no cells');
		return null;
	}
}

export async function writeCells(cells: TrackType[]): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(JSON.stringify(cells));
	} catch (error) {
		toastError("Couldn't copy to the clipboard", error);
		return false;
	}
	return true;
}

export async function readClipboardText(): Promise<string | null> {
	try {
		return await navigator.clipboard.readText();
	} catch (error) {
		toastError("Couldn't read the clipboard", error);
		return null;
	}
}
