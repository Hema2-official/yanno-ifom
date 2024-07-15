import { writable } from 'svelte/store';

export const pointerLockEnabled = writable(false);
export const sidebarRight = writable(true);
export const contextMenuOpacity = writable(90);

export const autoResample = writable(true);
export const resampleSegmentLength = writable(0.8);
