import type { TrackType } from '$lib/types/annotation.type';
import type { ColorMapType } from '$lib/utils/imaging';
import { projectState } from './ProjectState.svelte';

export type SvgViewBoxType = {
	minX: number;
	minY: number;
	width: number;
	height: number;
};

export const labelKeys = ['ObjectID', 'TrackID', 'Class'] as const;
export type LabelKey = Extract<keyof TrackType, (typeof labelKeys)[number]>;

class SvgState {
	isSvgShown = $state(true);

	labelSwitch = $state(true);
	labelKey: LabelKey = $state('ObjectID');

	svgFill = $state('#ffffff');
	svgStroke = $state('#000000');
	svgAlpha = $state(255);
	svgFillSwitch = $state(false);
	svgStrokeSwitch = $state(true);

	svgScalePercent = $state(100);

	svgViewBox: SvgViewBoxType = $derived({
		minX: 0,
		minY: 0,
		width: projectState.videoMetadata?.width || 512,
		height: projectState.videoMetadata?.height || 512
	});

	normalizeSwitch = $state(true);
	colormapSwitch = $state(true);

	videoColormap: ColorMapType = $state('viridis');
	videoColormapShades = $state(64);
}

export const svgState = new SvgState();
