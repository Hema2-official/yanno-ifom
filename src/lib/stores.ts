import { writable, type Writable } from 'svelte/store';
import type { DataType, FrameType } from './types';

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
export const scrollMultiplier = writable(1.0);

export const cmOpacity = writable(90);

export const lastPointerViewBoxCoords = writable({ x: 0, y: 0 });

export const backend_url = writable('https://example.com/api/');

export const data: Writable<DataType> = writable();
export const currentFrameIndex = writable(0);
export const currentChangeIndex = writable(-1);
export const displayFrames: Writable<FrameType[]> = writable([]);

export const blob_pngs: Writable<Blob[]> = writable([]);
