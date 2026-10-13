import { SettingState } from './SettingState.svelte';

class ZoomState {
	readonly minScale = 100;
	readonly maxScale = 1000;
	scrollMultiplier = new SettingState('scrollMultiplier', 1);

	scalePercent = $state(100);

	/** A length in viewBox units that keeps its size on screen at any zoom. */
	screenUnit = $derived(100 / this.scalePercent);

	/** Zooms the display around its center by the factor, while it's shown. */
	zoomBy: ((factor: number) => void) | null = $state.raw(null);
}

export const zoomState = new ZoomState();
