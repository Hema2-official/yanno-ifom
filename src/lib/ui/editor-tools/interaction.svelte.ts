import { inputState } from '$lib/states/InputState.svelte';

/**
 * While `isActive()` is true, route the display's pointer events to the given
 * handlers so a drag gesture continues even when the pointer leaves the
 * tool's own elements. Handlers are cleared when the gesture ends or the
 * tool unmounts. Call during component initialization (uses `$effect`).
 */
export function overrideDisplayPointerWhile(
	isActive: () => boolean,
	onMove: (e: MouseEvent) => void,
	onEnd: (e: MouseEvent) => void
) {
	$effect(() => {
		if (!isActive()) return;

		inputState.displayMouseMove = onMove;
		inputState.displayMouseUp = onEnd;
		inputState.displayMouseLeave = onEnd;

		return () => {
			inputState.displayMouseMove = null;
			inputState.displayMouseUp = null;
			inputState.displayMouseLeave = null;
		};
	});
}
