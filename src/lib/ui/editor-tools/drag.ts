export type DragHandlers = {
	onMove: (event: PointerEvent) => void;
	onEnd: (event: PointerEvent) => void;
};

/**
 * Claims the gesture that `event` (a pointerdown) started: move and release
 * events reach the handlers until the button is released, the pointer is
 * cancelled or the capture is lost, even outside the window. Capture goes on
 * `root`, never on a handle, because handles get unmounted mid-gesture.
 * Returns false, doing nothing, when the pointer can't be captured.
 */
export function startDrag(root: SVGElement, event: PointerEvent, handlers: DragHandlers): boolean {
	const { pointerId, button } = event;

	function onMove(e: PointerEvent) {
		if (e.pointerId === pointerId) handlers.onMove(e);
	}

	function onEnd(e: PointerEvent) {
		if (e.pointerId !== pointerId) return;
		// Releasing another button mid-gesture doesn't end it
		if (e.type === 'pointerup' && e.button !== button) return;
		stop();
		handlers.onEnd(e);
	}

	function stop() {
		root.removeEventListener('pointermove', onMove);
		root.removeEventListener('pointerup', onEnd);
		root.removeEventListener('pointercancel', onEnd);
		root.removeEventListener('lostpointercapture', onEnd);
		if (root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
	}

	try {
		root.setPointerCapture(pointerId);
	} catch {
		return false;
	}
	root.addEventListener('pointermove', onMove);
	root.addEventListener('pointerup', onEnd);
	root.addEventListener('pointercancel', onEnd);
	root.addEventListener('lostpointercapture', onEnd);
	return true;
}
