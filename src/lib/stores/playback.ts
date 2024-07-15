import { writable } from 'svelte/store';

export const speed = writable(0);
export const tick = writable(0);
export const sliderTick = writable(0);
export const isPlaying = writable(false);
