import { SettingState } from './SettingState.svelte';

class ZoomState {
	minScale = $state(100);
	maxScale = $state(1000);
	scrollMultiplier = new SettingState('scrollMultiplier', 1);
}

export const zoomState = new ZoomState();
