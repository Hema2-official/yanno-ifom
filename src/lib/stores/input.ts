import { writable, type Writable } from 'svelte/store';
import { PressedKeys } from 'runed';

export const pressedKeys = new PressedKeys();

export const displayMouseMoveHandler: Writable<((e: MouseEvent) => void) | null> = writable(null);
export const displayMouseUpHandler: Writable<((e: MouseEvent) => void) | null> = writable(null);
export const displayMouseLeaveHandler: Writable<((e: MouseEvent) => void) | null> = writable(null);
