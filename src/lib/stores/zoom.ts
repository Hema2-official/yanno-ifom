import { writable } from 'svelte/store';

export const minScale = writable(100);
export const maxScale = writable(1000);
export const scrollMultiplier = writable(1.0);
