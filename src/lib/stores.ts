import { writable, type Writable } from 'svelte/store';
import type { FrameType } from './types';

export const speed = writable(0);

export const tick = writable(0);

export const sliderTick = writable(0);

export const isPlaying = writable(false);

export const isSvgShown = writable(true);

export const pointerLockEnabled = writable(false);

export const isEditing = writable(false);

export const svgFill = writable('#ffffff');
export const svgStroke = writable('#000000');
export const svgHoverFill = writable('#ff0000');
export const svgAlpha = writable(255);
export const svgFillSwitch = writable(false);
export const svgStrokeSwitch = writable(true);

export const minScale = writable(100);
export const maxScale = writable(1000);

export const cmOpacity = writable(90);

export const backend_url = writable('https://example.com/api/');

export const frames: Writable<FrameType[]> = writable([]);
export const frameIndex = writable(0);
