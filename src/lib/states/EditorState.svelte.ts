import { SvelteSet } from 'svelte/reactivity';
import type { TrackType } from '$lib/types/annotation.type';
import type { ToolId } from '$lib/ui/editor-tools/registry';
import { toast } from 'svelte-sonner';
import { parseCells, readClipboardText, writeCells } from '$lib/utils/clipboard';
import { rangeBetween } from '$lib/utils/selection';
import { cellsLabel } from '$lib/utils/tracks';
import { annotationState } from './AnnotationState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';
import { getMin } from '$lib/utils/data.svelte';

export type PendingPaste = { cells: TrackType[]; frameIndex: number };

class EditorState {
	/** The active tool; every frame tile mounts its component. */
	tool: ToolId = $state('cursor');

	/** The paste the dialog is asking about, if any. */
	pendingPaste: PendingPaste | null = $state.raw(null);

	trackIdDialogOpen = $state(false);
	reportsOpen = $state(false);

	/** Selected ObjectIDs. Stale ids are ignored until their cells come back (undo). */
	#selection = new SvelteSet<string>();

	getLastSelected() {
		let last: string | null = null;
		for (const value of this.#selection) last = value;
		return last;
	}

	/** The last cell clicked into the selection; the starting point of a range. */
	#anchor: string | null = $state(null);

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
		this.#anchor = cell.ObjectID;
		if (this.#selection.size === 1 && this.isSelected(cell)) return;
		this.#selection.clear();
		this.#selection.add(cell.ObjectID);
	}

	toggle(cell: TrackType) {
		if (this.#selection.has(cell.ObjectID)) {
			this.#selection.delete(cell.ObjectID);
			if (this.#anchor === cell.ObjectID) this.#anchor = this.getLastSelected();
		} else {
			this.#selection.add(cell.ObjectID);
			this.#anchor = cell.ObjectID;
		}
	}

	selectRange(cell: TrackType) {
		const anchor = this.#anchor === null ? undefined : annotationState.getCell(this.#anchor);
		if (!anchor || anchor.Frame === cell.Frame) {
			this.toggle(cell);
			return;
		}
		const chain = rangeBetween(anchor, cell, (frame) => annotationState.getFrame(frame) ?? []);
		for (const linked of chain) this.#selection.add(linked.ObjectID);
		this.#anchor = cell.ObjectID;
	}

	/** Adds the selected cells' tracks from each on (1), up to each (-1) or whole (0). */
	selectTracks(direction: -1 | 0 | 1) {
		const byTrack = Map.groupBy(annotationState.data?.current ?? [], (cell) => cell.TrackID);
		for (const from of this.selectedCells) {
			if (from.TrackID === null) continue;
			for (const cell of byTrack.get(from.TrackID) ?? []) {
				if ((cell.Frame - from.Frame) * direction >= 0) this.#selection.add(cell.ObjectID);
			}
		}
	}

	interpolateSelection() {
		const added = annotationState.interpolateCells(this.selectedCells);
		for (const cell of added ?? []) this.#selection.add(cell.ObjectID);
	}

	selectAll(cells: TrackType[]) {
		this.#selection.clear();
		for (const cell of cells) this.#selection.add(cell.ObjectID);
		this.#anchor = cells.at(-1)?.ObjectID ?? null;
	}

	clearSelection() {
		this.#selection.clear();
		this.#anchor = null;
	}

	/** Selects the cells and brings the earliest one's frame into the shown ones. */
	reveal(cells: TrackType[]) {
		this.selectAll(cells);
		if (cells.length > 0) this.showFrame(getMin(cells.map((cell) => cell.Frame)));
	}

	showFrame(frame: number) {
		const first = annotationState.currentFrameIndex;
		const shown = frame >= first && frame < first + videoDisplayState.concurrentFrames;
		if (!shown) annotationState.currentFrameIndex = frame;
	}

	async copySelection() {
		const cells = this.selectedCells;
		if (await writeCells(cells)) toast(`Copied ${cellsLabel(cells)}`);
	}

	async cutSelection() {
		const cells = this.selectedCells;
		if (await writeCells(cells)) annotationState.deleteCells(cells);
	}

	/** Opens the paste dialog for the cells in the text, if it holds any. */
	async pasteText(frameIndex: number, text?: string | null) {
		if (text == null) text = await readClipboardText();
		if (text == null) return;
		const cells = parseCells(text);
		if (cells) this.pendingPaste = { cells, frameIndex };
	}

	/** Back to the cursor tool with nothing selected. */
	reset() {
		this.tool = 'cursor';
		this.clearSelection();
	}
}

export const editorState = new EditorState();
