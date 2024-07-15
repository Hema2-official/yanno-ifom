import { writable, type Writable } from 'svelte/store';

export const isSvgShown = writable(true);

export const svgFill = writable('#ffffff');
export const svgStroke = writable('#000000');
export const svgHoverFill = writable('#ff0000');
export const svgAlpha = writable(255);
export const svgFillSwitch = writable(false);
export const svgStrokeSwitch = writable(true);

export const svgScalePercent = writable(100);

type SvgViewBoxType = {
	minX: number;
	minY: number;
	width: number;
	height: number;
};

export const svgViewBox: Writable<SvgViewBoxType> = writable({
	minX: 0,
	minY: 0,
	width: 512,
	height: 512
});
