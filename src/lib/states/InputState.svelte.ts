import type { Point } from '$lib/types/geometry.type';
import { PressedKeys } from 'runed';

/** The frame under the pointer, with the pointer in that frame's viewBox coordinates. */
export type PointerRecord = Point & { frameIndex: number };

class InputState {
	pressedKeys = new PressedKeys();

	/** Null while the pointer is off the frame grid (or panning the display). */
	pointer: PointerRecord | null = $state.raw(null);
}

export const inputState = new InputState();
