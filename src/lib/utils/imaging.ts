import type { VideoChannelMetadata, VideoComponentMetadata } from '$lib/types/api.type';
import createColormap from 'colormap';
import { clamp } from './math';

type LinearLUT = {
	type: 'linear';
	slope: number;
	intercept: number;
};

type TableLUT = {
	type: 'table';
	tableValues: string;
};

type GammaLUT = {
	type: 'gamma';
	amplitude: number;
	exponent: number;
	offset: number;
};

type SVGComponentTransferLUT = LinearLUT | TableLUT | GammaLUT;

export type RGBFunctions = {
	r: SVGComponentTransferLUT;
	g: SVGComponentTransferLUT;
	b: SVGComponentTransferLUT;
};

const svgTableCache = new Map<string, RGBFunctions>();

/** The colormap sampled into `feComponentTransfer` tables. */
export function colormapToRgbFunctions(colormap: ColorMapType, nshades = 256): RGBFunctions {
	const cacheKey = `${colormap}-${nshades}`;
	const cached = svgTableCache.get(cacheKey);
	if (cached) return cached;

	const colors = createColormap({
		colormap,
		nshades,
		format: 'float',
		alpha: 1
	});

	let r = '',
		g = '',
		b = '';
	for (let i = 0; i < colors.length; i++) {
		const sep = i ? ' ' : '';
		r += sep + colors[i][0];
		g += sep + colors[i][1];
		b += sep + colors[i][2];
	}
	const result: RGBFunctions = {
		r: { type: 'table', tableValues: r },
		g: { type: 'table', tableValues: g },
		b: { type: 'table', tableValues: b }
	};
	svgTableCache.set(cacheKey, result);
	return result;
}

function getLinearLUT(componentMetadata: VideoComponentMetadata): LinearLUT {
	const min = componentMetadata.min_value;
	const max = componentMetadata.max_value;
	return { type: 'linear', slope: 255 / (max - min), intercept: -min / (max - min) };
}

export function getNormalizeFunctions(range: VideoChannelMetadata): RGBFunctions {
	return { r: getLinearLUT(range.r), g: getLinearLUT(range.g), b: getLinearLUT(range.b) };
}

// Larger frames are subsampled for counting
const MAX_COUNTED_SIDE = 1024;

/** Adds the image's pixels to the counts of each value of red, green and blue. */
export function countPixels(counts: Uint32Array[], image: ImageBitmap) {
	const scale = Math.min(1, MAX_COUNTED_SIDE / Math.max(image.width, image.height));
	const w = Math.max(1, Math.round(image.width * scale));
	const h = Math.max(1, Math.round(image.height * scale));
	const context = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
	if (!context) return;
	// Picked pixels, not averages, which would hide the extremes
	context.imageSmoothingEnabled = false;
	context.drawImage(image, 0, 0, w, h);

	const data = context.getImageData(0, 0, w, h).data;
	const [r, g, b] = counts;
	for (let i = 0; i < data.length; i += 4) {
		r[data[i]]++;
		g[data[i + 1]]++;
		b[data[i + 2]]++;
	}
}

/**
 * The range of values that leaves `saturated` percent of the counted pixels
 * outside, half at each end, as ImageJ's contrast enhancement does.
 */
export function percentileRange(
	counts: Uint32Array,
	saturated: number
): VideoComponentMetadata | null {
	let total = 0;
	for (const count of counts) total += count;
	const limit = (total * saturated) / 200;

	let low = 0;
	for (let below = 0; low < 255 && below + counts[low] <= limit; low++) below += counts[low];
	let high = 255;
	for (let above = 0; high > low && above + counts[high] <= limit; high--) above += counts[high];
	return total > 0 && high > low ? { min_value: low, max_value: high } : null;
}

/**
 * Brightness (-1 to 1), contrast (a multiplier centered on middle gray) and
 * gamma as one transfer function: C' = contrast * C^gamma + offset.
 */
export function getAdjustFunctions(
	brightness: number,
	contrast: number,
	gamma: number
): RGBFunctions {
	const lut: GammaLUT = {
		type: 'gamma',
		amplitude: contrast,
		exponent: gamma,
		offset: brightness + 0.5 * (1 - contrast)
	};
	return { r: lut, g: lut, b: lut };
}

/** An 8-bit color value through one `feComponentTransfer` function, by the SVG spec's formulas. */
function transferTable(lut: SVGComponentTransferLUT): Uint8Array {
	const values =
		lut.type === 'table' ? lut.tableValues.split(/\s+/).filter(Boolean).map(Number) : [];
	const table = new Uint8Array(256);
	for (let i = 0; i < 256; i++) {
		const c = i / 255;
		let value = c;
		if (lut.type === 'linear') value = lut.slope * c + lut.intercept;
		else if (lut.type === 'gamma') value = lut.amplitude * c ** lut.exponent + lut.offset;
		else if (values.length === 1) value = values[0];
		else if (values.length > 1) {
			const n = values.length - 1;
			const k = Math.min(Math.floor(c * n), n - 1);
			value = values[k] + (c * n - k) * (values[k + 1] - values[k]);
		}
		table[i] = Math.round(clamp(value, 0, 1) * 255);
	}
	return table;
}

/** A chain of transfer functions, one table per color channel. */
export function transferTables(chain: RGBFunctions[]): [Uint8Array, Uint8Array, Uint8Array] {
	const channel = (key: keyof RGBFunctions) => {
		const table = Uint8Array.from({ length: 256 }, (_, i) => i);
		for (const functions of chain) {
			const step = transferTable(functions[key]);
			for (let i = 0; i < 256; i++) table[i] = step[table[i]];
		}
		return table;
	};
	return [channel('r'), channel('g'), channel('b')];
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
