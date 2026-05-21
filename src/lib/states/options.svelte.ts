// TODO: organize states
export class OptionsState {
	pointerLockEnabled = $state(false);
	sidebarRight = $state(true);

	autoResample = $state(true);
	resampleSegmentLength = $state(0.8);
}

export const optionsState = new OptionsState();
