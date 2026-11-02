import type { Point } from '$lib/types/geometry.type';

/** The frame under the pointer, with the pointer in that frame's viewBox coordinates. */
export type PointerRecord = Point & { frameIndex: number };

class InputState {
	/** Null while the pointer is off the frames. */
	pointer: PointerRecord | null = $state.raw(null);
}

export const inputState = new InputState();
