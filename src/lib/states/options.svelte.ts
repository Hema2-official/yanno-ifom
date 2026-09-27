import { SettingState } from './SettingState.svelte';

// TODO: organize states
class OptionsState {
	pointerLockEnabled = new SettingState('pointerLockEnabled', false);
	sidebarRight = new SettingState('sidebarRight', true);

	autoResample = new SettingState('autoResample', true);
	/** Between the vertices of a resampled outline, in image pixels. */
	resampleSegmentLength = new SettingState('resampleSegmentLength', 0.8);
}

export const optionsState = new OptionsState();
