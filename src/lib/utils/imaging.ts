import { decode } from 'tiff';
import { encode, type BitDepth } from 'fast-png';
import 'colormap'
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import createColormap from 'colormap';

/**
 * Decodes a TIFF file and returns an array of PNG frames.
 * 
 * @param tiffData - The TIFF file data as an ArrayBuffer.
 * @param progressUpdateCallback - An optional callback function to track the progress of decoding.
 * @returns A Promise that resolves to an array of Uint8Array representing the PNG frames.
 * @throws If the TIFF file is unsupported or contains invalid data.
 */
export function getTiffFramesAsPngs(tiffData: ArrayBuffer) {
    return new Promise<Blob[]>((resolve, reject) => {
        const ifds = decode(tiffData);
        const pngs: Blob[] = [];
        for (let i = 0; i < ifds.length; i++) {
            const ifd = ifds[i];
            if (ifd.alpha || ![8, 16].includes(ifd.bitsPerSample))
                reject(get(_)("unsupported_tiff" + `\nalpha: ${ifd.alpha}, bitsPerSample: ${ifd.bitsPerSample}`));
            // const viridis = toViridis(ifd.data as Uint8Array | Uint16Array, ifd.alpha, ifd.bitsPerSample);
            // const png = encode({
            //     width: ifd.width,
            //     height: ifd.height,
            //     data: viridis,
            //     depth: 8,
            //     channels: 4
            // });
            const png = encode({
                width: ifd.width,
                height: ifd.height,
                data: ifd.data as Uint8Array | Uint16Array,
                depth: ifd.bitsPerSample as BitDepth,
                channels: ifd.alpha ? 2 : 1
            });
            pngs.push(new Blob([png.buffer], { type: 'image/png' }));
        };
        resolve(pngs);
    });
}

function toViridis(data: Uint8Array | Uint16Array, hasAlpha = false, bitsPerSample = 8) {
    const colors = createColormap({ colormap: 'viridis', nshades: 256, format: 'float', alpha: 1 });
    const viridis = new Uint8Array(data.length * 4);
    for (let i = 0; i < data.length; i++) {
        const val = hasAlpha ? data[i] >> 8 : data[i] / (2 ** bitsPerSample - 1);
        const color = colors[val];
        const j = i * 4;
        viridis[j] = color[0] * 255;
        viridis[j + 1] = color[1] * 255;
        viridis[j + 2] = color[2] * 255;
        viridis[j + 3] = hasAlpha ? data[i] : 255;
    }
    return viridis;
}