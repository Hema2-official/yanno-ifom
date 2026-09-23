import { SvelteSet } from 'svelte/reactivity';
import type { TrackType } from '$lib/types/annotation.type';
import type { ToolId } from '$lib/ui/editor-tools/registry';
import { annotationState } from './AnnotationState.svelte';

class EditorState {
	/** The active tool; every frame tile mounts its component. */
	tool: ToolId = $state('cursor');

	/** Selected ObjectIDs. Stale ids are ignored until their cells come back (undo). */
	#selection = new SvelteSet<string>();

	selectedCells: TrackType[] = $derived(
		(annotationState.data?.current ?? []).filter((cell) => this.#selection.has(cell.ObjectID))
	);

	selectedByFrame: Map<number, TrackType[]> = $derived(
		Map.groupBy(this.selectedCells, (cell) => cell.Frame)
	);

	isSelected(cell: TrackType): boolean {
		return this.#selection.has(cell.ObjectID);
	}

	select(cell: TrackType) {
		if (this.#selection.size === 1 && this.isSelected(cell)) return;
		this.#selection.clear();
		this.#selection.add(cell.ObjectID);
	}

	toggle(cell: TrackType) {
		if (this.#selection.has(cell.ObjectID)) this.#selection.delete(cell.ObjectID);
		else this.#selection.add(cell.ObjectID);
	}

	/** Replaces the selection with the given cells. */
	selectAll(cells: TrackType[]) {
		this.#selection.clear();
		for (const cell of cells) this.#selection.add(cell.ObjectID);
	}

	clearSelection() {
		this.#selection.clear();
	}

	/** Back to the cursor tool with nothing selected. */
	reset() {
		this.tool = 'cursor';
		this.#selection.clear();
	}
}

export const editorState = new EditorState();
