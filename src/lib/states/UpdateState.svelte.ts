class UpdateState {
	updateCallback: (() => void) | null = $state(null);
	isUpdating = $state(false);

	setCallback(cb: () => void) {
		this.updateCallback = () => {
			this.isUpdating = true;
			cb();
		};
	}
}

export const updateState = new UpdateState();
