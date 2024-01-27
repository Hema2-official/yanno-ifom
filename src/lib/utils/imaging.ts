import { decode } from 'decode-tiff';
import { encode, type BitDepth } from 'fast-png';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

/**
 * Decodes a TIFF file and returns an array of PNG frames.
 * 
 * @param tiffData - The TIFF file data as an ArrayBuffer.
 * @param progressUpdateCallback - An optional callback function to track the progress of decoding.
 * @returns A Promise that resolves to an array of Uint8Array representing the PNG frames.
 * @throws If the TIFF file is unsupported or contains invalid data.
 */
export function getTiffFrames(tiffData: ArrayBuffer, progressUpdateCallback?: (progress: number) => void) {
    return new Promise<Blob[]>((resolve, reject) => {
        const tiff = decode(tiffData);
        let progressPercent = 0;
        let index = 0;
        const pngs: Blob[] = [];
        const callback = () => {
            // const ifd = ifds[index];
            // if (ifd.alpha || ![8, 16].includes(ifd.bitsPerSample))
            //     reject(get(_)("unsupported_tiff" + `\nalpha: ${ifd.alpha}, bitsPerSample: ${ifd.bitsPerSample}`));
            // const png = encode({
            //     width: ifd.width,
            //     height: ifd.height,
            //     data: ifd.data as Uint8Array | Uint16Array,
            //     depth: ifd.bitsPerSample as BitDepth,
            //     channels: ifd.alpha ? 2 : 1
            // });
            // pngs.push(new Blob([png.buffer], { type: 'image/png' }));
            // index++;

            // const oldProgressPercent = progressPercent;
            // progressPercent = index * 100 / ifds.length;
            // let frameUpdateNeeded = false;
            // if (progressUpdateCallback && Math.floor(progressPercent) != Math.floor(oldProgressPercent)) {
            //     progressUpdateCallback(Math.floor(progressPercent));
            //     frameUpdateNeeded = true;
            // }

            // if (index < ifds.length) {
            //     if (frameUpdateNeeded) requestAnimationFrame(callback);
            //     else callback();
            // } else {
            //     resolve(pngs);
            // }
            console.log(tiff);
        };
        requestAnimationFrame(callback);
    });
}
