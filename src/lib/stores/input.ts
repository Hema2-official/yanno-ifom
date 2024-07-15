import { writable, type Writable } from 'svelte/store';

export const modifierKeys = writable({
	shift: false,
	ctrl: false,
	alt: false,
	meta: false
});

export const _updateModifierKeys = (e: KeyboardEvent | MouseEvent) => {
	modifierKeys.update((keys) => {
		keys.shift = e.shiftKey;
		keys.ctrl = e.ctrlKey;
		keys.alt = e.altKey;
		keys.meta = e.metaKey;
		return keys;
	});
};

export const displayMouseMoveHandler: Writable<((e: MouseEvent) => void) | null> = writable(null);
export const displayMouseUpHandler: Writable<((e: MouseEvent) => void) | null> = writable(null);
export const displayMouseLeaveHandler: Writable<((e: MouseEvent) => void) | null> = writable(null);
