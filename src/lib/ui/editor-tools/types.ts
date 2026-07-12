import type { Polygon } from '$lib/types/geometry.type';

export type EditorToolProps = {
	bodies: Polygon[];
	pushLocalState: () => void;
};
