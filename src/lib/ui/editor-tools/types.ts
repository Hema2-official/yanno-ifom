import type { Polygon } from '$lib/types/geometry.type';
import type { Writable } from 'svelte/store';

export type EditorToolProps = {
	// TODO: remove Writable
	bodies: Writable<Polygon[]>;
	pushLocalState: () => void;
};
