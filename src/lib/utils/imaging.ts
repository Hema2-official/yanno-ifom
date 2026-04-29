import type TiffIfd from 'tiff/lib/tiffIfd';
import { encode } from 'fast-png';
import { get, type Writable } from 'svelte/store';
import { _ } from 'svelte-i18n';
import createColormap from 'colormap';

/**
 * Decodes a TIFF file and returns an array of PNG frames.
 *
 * @param tiff_ifds - A TiffIfd array representing the decoded TIFF file.
 * @param destination - A Svelte store to write the PNG frames to.
 * @param colormap - The colormap to use for the conversion. Default: 'viridis'
 * @returns A Promise that resolves to nothing.
 * @throws If the TIFF file is unsupported or contains invalid data.
 */
export async function tiffToPngBlobs(
	tiff_ifds: TiffIfd[],
	destination: Writable<Blob[]>,
	colormap: ColorMapType = 'viridis'
) {
	for (let i = 0; i < tiff_ifds.length; i++) {
		const ifd = tiff_ifds[i];
		if (ifd.alpha || ![8, 16].includes(ifd.bitsPerSample)) {
			throw new Error(
				get(_)('unsupported_tiff') +
					`\nalpha: ${ifd.alpha}, bitsPerSample: ${ifd.bitsPerSample}`
			);
		}

		const mapped = toColormap(
			ifd.data as Uint8Array | Uint16Array,
			ifd.alpha,
			ifd.bitsPerSample,
			colormap
		);
		const png = encode({
			width: ifd.width,
			height: ifd.height,
			data: mapped,
			depth: 8,
			channels: 4
		});
		destination.update((d) => {
			d[i] = new Blob([new Uint8Array(png.buffer)], { type: 'image/png' });
			return d;
		});
	}
}

function getMax(arr: Uint8Array | Uint16Array) {
	let len = arr.length;
	let max = -Infinity;

	while (len--) {
		max = arr[len] > max ? arr[len] : max;
	}
	return max;
}

function toColormap(
	data: Uint8Array | Uint16Array,
	hasAlpha: boolean,
	bitsPerSample: number,
	colormap: ColorMapType = 'viridis'
) {
	const colors = createColormap({
		colormap: colormap,
		nshades: 65536,
		format: 'float',
		alpha: 1
	});
	const mapped = new Uint16Array(hasAlpha ? data.length * 2 : data.length * 4);
	const n = Math.ceil(Math.ceil(Math.log2(getMax(data) + 1)) / 4) * 4;
	const original_max = 2 ** bitsPerSample - 1;
	const normal_max = 2 ** n - 1;
	for (let i = 0; i < data.length; i++) {
		// skip alpha channel
		if (hasAlpha && i % 2 === 1) continue;
		// map to color map
		const color = colors[Math.round((data[i] * original_max) / normal_max)];
		const j = i * 4;
		mapped[j] = color[0] * 65535;
		mapped[j + 1] = color[1] * 65535;
		mapped[j + 2] = color[2] * 65535;
		mapped[j + 3] = color[3] * 65535;
	}
	return mapped;
}

export type ColorMapType = (typeof AVAILABLE_COLORMAPS)[number];

export const AVAILABLE_COLORMAPS = [
	'jet',
	'hsv',
	'hot',
	'spring',
	'summer',
	'autumn',
	'winter',
	'bone',
	'copper',
	'greys',
	'yignbu',
	'greens',
	'yiorrd',
	'bluered',
	'rdbu',
	'picnic',
	'rainbow',
	'portland',
	'blackbody',
	'earth',
	'electric',
	'alpha',
	'viridis',
	'inferno',
	'magma',
	'plasma',
	'warm',
	'cool',
	'rainbow-soft',
	'bathymetry',
	'cdom',
	'chlorophyll',
	'density',
	'freesurface-blue',
	'freesurface-red',
	'oxygen',
	'par',
	'phase',
	'salinity',
	'temperature',
	'turbidity',
	'velocity-blue',
	'velocity-green',
	'cubehelix'
] as const;
