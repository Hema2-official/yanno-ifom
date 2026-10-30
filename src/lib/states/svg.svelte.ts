import type { TrackType } from '$lib/types/annotation.type';
import { firstLinkedCells } from '$lib/utils/tracks';
import { annotationState } from './AnnotationState.svelte';
import { projectState } from './ProjectState.svelte';
import { oneOf, SettingState } from './SettingState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';

export type SvgViewBoxType = {
	minX: number;
	minY: number;
	width: number;
	height: number;
};

export const labelKeys = ['ObjectID', 'TrackID', 'Class'] as const;
export type LabelKey = Extract<keyof TrackType, (typeof labelKeys)[number]>;

export type ArrowLook = {
	color: string;
	width: number;
	/** The cells whose arrows are drawn, null for all. */
	only: ReadonlySet<string> | null;
};

export type CellLook = {
	fill: string | null;
	stroke: string | null;
	width: number;
	labelSize: number;
	/** The ancestry arrows, null while they're hidden. */
	arrows: ArrowLook | null;
};

class SvgState {
	isAnnotationShown = $state(true);

	labelSwitch = new SettingState('labelSwitch', true);
	labelKey = new SettingState<LabelKey>('labelKey', 'ObjectID', { validate: oneOf(labelKeys) });

	svgFill = new SettingState('svgFill', '#ffffff');
	svgStroke = new SettingState('svgStroke', '#000000');
	svgFillSwitch = new SettingState('svgFillSwitch', false);
	svgStrokeSwitch = new SettingState('svgStrokeSwitch', true);
	outlineWidth = new SettingState('outlineWidth', 2);
	labelSize = new SettingState('labelSize', 12);
	annotationOpacity = new SettingState('annotationOpacity', 1);

	ancestrySwitch = new SettingState('ancestrySwitch', true);
	ancestryColor = new SettingState('ancestryColor', '#f97316');
	ancestryWidth = new SettingState('ancestryWidth', 2);
	/** In the stack, each ancestry's arrow only in the first shown frame that has it. */
	ancestryFirstOnly = new SettingState('ancestryFirstOnly', false);

	#firstArrows: ReadonlySet<string> | null = $derived.by(() => {
		const stacked = videoDisplayState.displayMode.current === 'stack';
		if (!stacked || !this.ancestryFirstOnly.current) return null;
		const start = annotationState.currentFrameIndex;
		const count = videoDisplayState.concurrentFrames;
		return firstLinkedCells(
			Array.from(
				{ length: count },
				(_, offset) => annotationState.getFrame(start + offset) ?? []
			)
		);
	});

	#arrowLook = $derived<ArrowLook | null>({
		color: this.ancestryColor.current,
		width: this.ancestryWidth.current,
		only: this.#firstArrows
	});

	cellLook: CellLook = $derived({
		fill: this.svgFillSwitch.current ? this.svgFill.current : null,
		stroke: this.svgStrokeSwitch.current ? this.svgStroke.current : null,
		width: this.outlineWidth.current,
		labelSize: this.labelSize.current,
		arrows: this.ancestrySwitch.current ? this.#arrowLook : null
	});

	svgViewBox: SvgViewBoxType = $derived({
		minX: 0,
		minY: 0,
		width: projectState.videoMetadata?.width || 512,
		height: projectState.videoMetadata?.height || 512
	});

	videoColormapShades = new SettingState('videoColormapShades', 64);

	cellLabel(cell: TrackType): string | null {
		if (!this.labelSwitch.current) return null;
		return String(cell[this.labelKey.current] ?? '');
	}
}

export const svgState = new SvgState();
