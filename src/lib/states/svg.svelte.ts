import type { ColorMapType } from '$lib/utils/imaging';

export type SvgViewBoxType = {
	minX: number;
	minY: number;
	width: number;
	height: number;
};

class SvgState {
	isSvgShown = $state(true);

	svgFill = $state('#ffffff');
	svgStroke = $state('#000000');
	svgAlpha = $state(255);
	svgFillSwitch = $state(false);
	svgStrokeSwitch = $state(true);

	svgScalePercent = $state(100);

	svgViewBox: SvgViewBoxType = $state({
		minX: 0,
		minY: 0,
		width: 512,
		height: 512
	});

	videoColormap: ColorMapType = $state('viridis');
	videoColormapShades = $state(64);
}

export const svgState = new SvgState();
