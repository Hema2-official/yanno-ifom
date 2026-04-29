import { type Writable, get, writable } from 'svelte/store';
import TiffIfd from 'tiff/lib/tiffIfd';
import { tiffToPngBlobs, type ColorMapType } from '../utils/imaging';

export const globalColormap: Writable<ColorMapType> = writable('viridis');
export const decodedTiffIfds: Writable<TiffIfd[]> = writable([]);
export const blob_pngs: Writable<Blob[]> = writable([]);

decodedTiffIfds.subscribe((tiff) => {
	tiffToPngBlobs(tiff, blob_pngs, get(globalColormap));
});

globalColormap.subscribe((colormap) => {
	tiffToPngBlobs(get(decodedTiffIfds), blob_pngs, colormap);
});
