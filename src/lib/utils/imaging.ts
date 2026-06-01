import { _ } from 'svelte-i18n';
import createColormap from 'colormap';

const svgTableCache = new Map<string, { r: string; g: string; b: string }>();

/**
 * Generates SVG `feComponentTransfer` table values for R, G, and B channels
 * from a given colormap. These can be used as the `tableValues` attribute
 * on `feFuncR`, `feFuncG`, and `feFuncB` elements with `type="table"`.
 *
 * @param colormap - The name of the colormap to sample.
 * @param nshades - Number of samples to take (default 256).
 * @returns An object with `r`, `g`, and `b` strings for use as `tableValues`.
 */
export function colormapToSvgTableValues(
	colormap: ColorMapType,
	nshades: number = 256
): { r: string; g: string; b: string } {
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
	const result = { r, g, b };
	svgTableCache.set(cacheKey, result);
	return result;
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
