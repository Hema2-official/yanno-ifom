import type { TrackType } from '$lib/types/annotation.type';
import { AVAILABLE_COLORMAPS, type ColorMapType } from '$lib/utils/imaging';
import { projectState } from './ProjectState.svelte';
import { SettingState } from './SettingState.svelte';

export type SvgViewBoxType = {
	minX: number;
	minY: number;
	width: number;
	height: number;
};

export const labelKeys = ['ObjectID', 'TrackID', 'Class'] as const;
export type LabelKey = Extract<keyof TrackType, (typeof labelKeys)[number]>;

const oneOf =
	<T extends string>(values: readonly T[]) =>
	(value: unknown): value is T =>
		values.includes(value as T);

class SvgState {
	isSvgShown = $state(true);

	labelSwitch = new SettingState('labelSwitch', true);
	labelKey = new SettingState<LabelKey>('labelKey', 'ObjectID', { validate: oneOf(labelKeys) });

	svgFill = new SettingState('svgFill', '#ffffff');
	svgStroke = new SettingState('svgStroke', '#000000');
	svgFillSwitch = new SettingState('svgFillSwitch', false);
	svgStrokeSwitch = new SettingState('svgStrokeSwitch', true);
	outlineWidth = new SettingState('outlineWidth', 2);
	labelSize = new SettingState('labelSize', 12);
	annotationOpacity = new SettingState('annotationOpacity', 1);

	svgScalePercent = $state(100);

	svgViewBox: SvgViewBoxType = $derived({
		minX: 0,
		minY: 0,
		width: projectState.videoMetadata?.width || 512,
		height: projectState.videoMetadata?.height || 512
	});

	normalizeSwitch = new SettingState('normalizeSwitch', true);
	colormapSwitch = new SettingState('colormapSwitch', true);

	videoColormap = new SettingState<ColorMapType>('videoColormap', 'viridis', {
		validate: oneOf(AVAILABLE_COLORMAPS)
	});
	videoColormapShades = new SettingState('videoColormapShades', 64);
}

export const svgState = new SvgState();
