import type { CellBodyType } from '$lib/types/annotation.type';
import type { Writable } from 'svelte/store';

export type EditorToolProps = {
	bodies: Writable<CellBodyType[]>;
	pushLocalState: () => void;
};
