import { type Writable, get, writable } from 'svelte/store';

export const alternativeUndo: Writable<(() => void) | null> = writable(null);
export const alternativeRedo: Writable<(() => void) | null> = writable(null);

export const undoChange = () => {
	// Check if an alternative undo function is available
	const _alternativeUndo = get(alternativeUndo);
	if (_alternativeUndo !== null) {
		_alternativeUndo();
		return;
	}
};

export const redoChange = () => {
	// Check if an alternative redo function is available
	const _alternativeRedo = get(alternativeRedo);
	if (_alternativeRedo !== null) {
		_alternativeRedo();
		return;
	}
};

export const savingIndicator: Writable<boolean> = writable(false);
