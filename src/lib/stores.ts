import { writable, type Writable } from 'svelte/store';
import type { DataType, FrameType } from './types';
import type TiffIfd from 'tiff/lib/tiffIfd';
import { tiffToPngBlobs } from './utils/imaging';
import { get } from 'svelte/store';

export const speed = writable(0);
export const tick = writable(0);
export const sliderTick = writable(0);
export const isPlaying = writable(false);

export const isSvgShown = writable(true);
export const pointerLockEnabled = writable(false);
export const isEditing = writable(false);
export const sidebarRight = writable(true);

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

export const globalColormap = writable('viridis');
export const decodedTiffIfds: Writable<TiffIfd[]> = writable([]);
export const blob_pngs: Writable<Blob[]> = writable([]);

decodedTiffIfds.subscribe((tiff) => {
    tiffToPngBlobs(tiff, blob_pngs, get(globalColormap));
});

globalColormap.subscribe((colormap) => {
    tiffToPngBlobs(get(decodedTiffIfds), blob_pngs, colormap);
});

data.subscribe((data) => {
    // if valid, save to session storage
    if (data) sessionStorage.setItem("demo_data", JSON.stringify(data));
});
