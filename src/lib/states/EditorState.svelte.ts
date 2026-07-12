import type { TrackType } from '$lib/types/annotation.type';
import { EditorMode } from '$lib/types/editor.type';
import type { Polygon } from '$lib/types/geometry.type';
import { deepCopy } from '$lib/utils/data.svelte';
import { getPolygonsInfo, resampleCellBodies } from '$lib/utils/geometry';
import { polygonsToRle, rleToPolygons } from '$lib/utils/rle';
import { annotationState } from './AnnotationState.svelte';
import { optionsState } from './options.svelte';

/**
 * One cell-editing session: owns the working polygons and their undo history.
 * Created by `editorState.startEditing`; the original cell is untouched until
 * `commit`.
 */
export class EditingSession {
	readonly cell: TrackType;

	/** The polygons being edited. Tools mutate points in place while dragging. */
	bodies: Polygon[] = $state([]);

	// Snapshots at gesture boundaries (undo history of this session only)
	#history: Polygon[][] = $state.raw([]);
	#historyIndex = $state(0);

	canUndo = $derived(this.#historyIndex > 0);
	canRedo = $derived(this.#historyIndex < this.#history.length - 1);

	constructor(inputCell: TrackType) {
		// Copy everything: rleToPolygons memoizes its result and this session
		// mutates its working set in place
		this.cell = deepCopy(inputCell);
		const polygons = deepCopy(rleToPolygons(this.cell.SegmentationRLE));
		this.bodies = optionsState.autoResample
			? resampleCellBodies(polygons, optionsState.resampleSegmentLength)
			: polygons;
		this.#history = [deepCopy(this.bodies)];
	}

	/** Record the current state as an undo step (call at the end of a gesture). */
	pushState() {
		// Drop any redoable states, then append the current one
		this.#history = [...this.#history.slice(0, this.#historyIndex + 1), deepCopy(this.bodies)];
		this.#historyIndex = this.#history.length - 1;
	}

	undo() {
		if (!this.canUndo) return;
		this.#historyIndex--;
		this.bodies = deepCopy(this.#history[this.#historyIndex]);
	}

	redo() {
		if (!this.canRedo) return;
		this.#historyIndex++;
		this.bodies = deepCopy(this.#history[this.#historyIndex]);
	}

	/** Convert the polygons back to RLE and commit the edited cell. */
	commit() {
		const data = annotationState.data;
		if (!data) return;

		const polygons = deepCopy(this.bodies);
		const { centroid, bbox } = getPolygonsInfo(polygons);
		const editedCell: TrackType = {
			...this.cell,
			SegmentationRLE: polygonsToRle(polygons, this.cell.SegmentationRLE.size),
			Centroid: centroid,
			SegBbox: bbox
		};

		const newData = data.current.map((track) =>
			track.ObjectID === this.cell.ObjectID && track.Frame === this.cell.Frame
				? editedCell
				: track
		);
		annotationState.commitData(newData, `Edit cell ${this.cell.ObjectID}`);
	}
}

class EditorState {
	/** The active editing session, or null when not editing. */
	session: EditingSession | null = $state.raw(null);

	mode = $state(EditorMode.Point);

	/** Radius (in viewBox units) of the smooth tool's influence. */
	smoothRadius = $state(10);

	get isEditing() {
		return this.session !== null;
	}

	/** Settable so UI toggles can cancel an active session (turning it on without a cell is a no-op). */
	set isEditing(value: boolean) {
		if (!value) this.session = null;
	}

	startEditing(cell: TrackType) {
		this.session = new EditingSession(cell);
	}

	/** End the active session, committing it first if `commit` is true. */
	quit(commit: boolean) {
		if (commit) this.session?.commit();
		this.session = null;
	}
}

export const editorState = new EditorState();
