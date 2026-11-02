import type { ToolId } from '$lib/ui/editor-tools/registry';
import { SettingState } from './SettingState.svelte';

// TODO: organize states
class OptionsState {
	pointerLockEnabled = new SettingState('pointerLockEnabled', false);
	sidebarRight = new SettingState('sidebarRight', true);

	autoResample = new SettingState('autoResample', true);
	/** Between the vertices of a resampled outline, in image pixels. */
	resampleSegmentLength = new SettingState('resampleSegmentLength', 0.8);

	toolAfterPaste = new SettingState<ToolId | 'none'>('toolAfterPaste', 'whole');

	// Limits for reports
	reportJump = new SettingState('reportJump', 30);
	reportAreaFactor = new SettingState('reportAreaFactor', 2);
}

export const optionsState = new OptionsState();
