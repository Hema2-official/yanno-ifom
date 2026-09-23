import type { VideoComponentMetadata, VideoMetadata } from '$lib/types/api.type';
import createColormap from 'colormap';

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

export type RGBFuntions = {
	r: SVGComponentTransferLUT;
	g: SVGComponentTransferLUT;
	b: SVGComponentTransferLUT;
};

const svgTableCache = new Map<string, RGBFuntions>();

/**
 * Generates SVG `feComponentTransfer` table values for R, G, and B channels
 * from a given colormap. These can be used as the `tableValues` attribute
 * on `feFuncR`, `feFuncG`, and `feFuncB` elements with `type="table"`.
 *
 * @param colormap - The name of the colormap to sample.
 * @param nshades - Number of samples to take (default 256).
 * @returns An object with `r`, `g`, and `b` strings for use as `tableValues`.
 */
export function colormapToRgbFunctions(colormap: ColorMapType, nshades: number = 256): RGBFuntions {
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
	const result: RGBFuntions = {
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

export function getNormalizeFunctions(
	videoMetadata: VideoMetadata,
	channelIndex: number
): RGBFuntions {
	const channelMetadata = videoMetadata.channels[channelIndex];
	return {
		r: getLinearLUT(channelMetadata.r),
		g: getLinearLUT(channelMetadata.g),
		b: getLinearLUT(channelMetadata.b)
	};
}

/**
 * Brightness (-1 to 1), contrast (a multiplier centered on middle gray) and
 * gamma as one transfer function: C' = contrast * C^gamma + offset.
 */
export function getAdjustFunctions(
	brightness: number,
	contrast: number,
	gamma: number
): RGBFuntions {
	const lut: GammaLUT = {
		type: 'gamma',
		amplitude: contrast,
		exponent: gamma,
		offset: brightness + 0.5 * (1 - contrast)
	};
	return { r: lut, g: lut, b: lut };
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
