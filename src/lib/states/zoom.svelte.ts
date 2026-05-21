class ZoomState {
	minScale = $state(100);
	maxScale = $state(1000);
	scrollMultiplier = $state(1);
}

export const zoomState = new ZoomState();
