import type { Point } from '$lib/types/geometry.type';
import { PressedKeys } from 'runed';

class InputState {
	pressedKeys = new PressedKeys();

	/** Last known pointer position in SVG viewBox coordinates. */
	lastPointerViewBoxCoords: Point = $state({ x: 0, y: 0 });

	/** Whether the pointer is currently over the annotation display. */
	pointerOverDisplay = $state(false);

	/**
	 * While an editor tool owns a drag gesture, these override the display's
	 * own pan handlers so the gesture continues even when the pointer leaves
	 * the tool's elements. Null when no gesture is active.
	 */
	displayMouseMove: ((e: MouseEvent) => void) | null = $state(null);
	displayMouseUp: ((e: MouseEvent) => void) | null = $state(null);
	displayMouseLeave: ((e: MouseEvent) => void) | null = $state(null);
}

export const inputState = new InputState();
