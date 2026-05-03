import { type Writable, get, writable } from 'svelte/store';
import type { NewChangeType, NewDataType, NewFrameType } from '$lib/types/annotation.type';
import type { Project } from '$lib/types/api.type';
import saveVersion from '$lib/api/projects/saveVersion';

export const currentProject: Writable<Project> = writable();
export const currentProjectVersion: Writable<string> = writable();

export const annotation: Writable<NewDataType> = writable();
export const currentFrameId = writable(1);
export const currentChangeIndex = writable(-1);
export const displayFrames: Writable<NewFrameType[]> = writable([]);

// annotation.subscribe((d) => {
// 	// if valid, save to session storage
// 	if (d) sessionStorage.setItem('demo_data', JSON.stringify(d));

// 	// if currentChangeIndex was the latest, make sure it still is
// 	if (d && get(currentChangeIndex) + 2 === get(annotation).changes.length)
// 		currentChangeIndex.set(get(annotation).changes.length - 1);
// });

export const pushChange = (change: NewChangeType) => {
	// Remove everything after the current change index
	annotation.update((_annotation) => {
		_annotation.changes = _annotation.changes.slice(0, get(currentChangeIndex) + 1);
		return _annotation;
	});

	// Add the new change
	annotation.update((_annotation) => {
		_annotation.changes.push(change);
		return _annotation;
	});

	// Update the current change index
	currentChangeIndex.update((i) => i + 1);
};

export const alternativeUndo: Writable<(() => void) | null> = writable(null);
export const alternativeRedo: Writable<(() => void) | null> = writable(null);

export const undoChange = () => {
	// Check if an alternative undo function is available
	const _alternativeUndo = get(alternativeUndo);
	if (_alternativeUndo !== null) {
		_alternativeUndo();
		return;
	}

	// Decrement the current change index if possible
	if (get(currentChangeIndex) >= 0) currentChangeIndex.update((i) => i - 1);
};

export const redoChange = () => {
	// Check if an alternative redo function is available
	const _alternativeRedo = get(alternativeRedo);
	if (_alternativeRedo !== null) {
		_alternativeRedo();
		return;
	}

	// Increment the current change index if possible
	if (get(currentChangeIndex) + 1 < get(annotation).changes.length)
		currentChangeIndex.update((i) => i + 1);
};

export const savingIndicator: Writable<boolean> = writable(false);

export const saveToServer = async () => {
	savingIndicator.set(true);
	// TODO: Save the current version without the changes after the current change index

	// Save the current version
	try {
		await updateVersionData(get(currentProjectVersion), JSON.stringify(get(annotation)));
	} catch (error) {
		console.error(error);
		alert('Failed to save the current version');
	} finally {
		savingIndicator.set(false);
	}
};
