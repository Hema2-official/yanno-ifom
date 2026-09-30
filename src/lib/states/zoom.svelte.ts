import { SettingState } from './SettingState.svelte';

class ZoomState {
	readonly minScale = 100;
	readonly maxScale = 1000;
	scrollMultiplier = new SettingState('scrollMultiplier', 1);

	scalePercent = $state(100);

	/** A length in viewBox units that keeps its size on screen at any zoom. */
	screenUnit = $derived(100 / this.scalePercent);
}

export const zoomState = new ZoomState();
