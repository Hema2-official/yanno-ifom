import type { ChangeType, RLEType, TrackType, VersionManaged } from '$lib/types/annotation.type';
import type { Polygon } from '$lib/types/geometry.type';
import { withMask, withOutline } from '$lib/utils/tracks';
import { toastError } from '$lib/api/errors';
import * as jsondiffpatch from 'jsondiffpatch/with-text-diffs';
import { projectState } from './ProjectState.svelte';
import { toast } from 'svelte-sonner';

/** How long a commit waits for further commits before it is persisted. */
const SAVE_DELAY_MS = 1000;

// The delta format is a cross-repo contract: the backend re-applies these
// deltas with its own differ, so its configuration must match this one
const jsondiffer = jsondiffpatch.create({
	// Matches array items that aren't equal by reference
	objectHash: function (obj) {
		if ('ObjectID' in obj) return (obj as TrackType).ObjectID;
	},
	arrays: {
		detectMove: true,
		includeValueOnMove: false
	},
	cloneDiffValues: structuredClone
});

function makeChange(newData: TrackType[], oldData: TrackType[], msg?: string): ChangeType | null {
	const reverse = jsondiffer.diff(newData, oldData);
	if (reverse === undefined) return null;
	return { time: new Date().toISOString(), reverse, ...(msg ? { msg } : {}) };
}

/** The state before the last `count` changes of `data`. */
export function stateBefore(data: VersionManaged<TrackType[]>, count: number): TrackType[] {
	let result = structuredClone(data.current); // patch() mutates in place
	for (let i = data.changes.length - 1; i >= data.changes.length - count; i--) {
		result = jsondiffer.patch(result, structuredClone(data.changes[i].reverse)) as TrackType[];
	}
	return result;
}

class AnnotationState {
	/** The data as saved on the server (or in the local database). */
	saved: VersionManaged<TrackType[]> | null = $state.raw(null);
	currentFrameIndex = $state(0);

	// Undos stay local: they count back until something new is committed or saved
	undoneCount = $state(0);

	// A commit replaces `saved` at once but persists it only once the commits pause
	#saveTimer: ReturnType<typeof setTimeout> | null = $state(null);

	/** The saved data with the undone changes reverted as one more change. */
	readonly data: typeof this.saved = $derived.by(() => {
		if (!this.saved || this.undoneCount === 0) return this.saved;

		const { current, changes } = this.saved;
		const undone = changes.slice(-this.undoneCount).reverse();
		const message = `Undo ${undone.map((change) => change.msg ?? 'change').join(', ')}`;
		const undoCurrent = stateBefore(this.saved, this.undoneCount);
		const undoChange = makeChange(undoCurrent, current, message);
		return { current: undoCurrent, changes: undoChange ? [...changes, undoChange] : changes };
	});

	canUndo = $derived((this.saved?.changes.length ?? 0) > this.undoneCount);
	canRedo = $derived(this.undoneCount > 0);

	/** True while the visible data isn't persisted yet (pending save or local undo). */
	// A viewer's undos only browse the history, since viewers never save
	isDirty = $derived(
		this.#saveTimer !== null || (this.undoneCount > 0 && !projectState.readOnly)
	);

	#tracksByFrame: Map<number, TrackType[]> = $derived.by(() =>
		Map.groupBy(this.data?.current ?? [], (track) => track.Frame)
	);

	#cellsById: Map<string, TrackType> = $derived(
		new Map((this.data?.current ?? []).map((track) => [track.ObjectID, track]))
	);

	getFrame(frameIndex: number): TrackType[] | null {
		return this.data ? (this.#tracksByFrame.get(frameIndex) ?? []) : null;
	}

	getCell(objectId: string): TrackType | undefined {
		return this.#cellsById.get(objectId);
	}

	load(data: VersionManaged<TrackType[]> | null) {
		this.#cancelScheduledSave();
		this.saved = data;
		this.undoneCount = 0;
	}

	/**
	 * Replaces the data with a new array. Untouched cells must stay the same
	 * objects (the diff skips them and the display keeps their memoized
	 * outlines), and nothing in it may be a Svelte state proxy.
	 */
	commitData(newData: TrackType[], message?: string) {
		if (!this.data) throw new Error('No data to commit changes to');

		const change = makeChange(newData, this.data.current, message);
		if (!change && !this.canRedo) return;

		this.saved = {
			current: newData,
			changes: change ? [...this.data.changes, change] : this.data.changes
		};
		this.undoneCount = 0;
		this.#scheduleSave();
	}

	undo() {
		if (this.canUndo) this.undoneCount++;
	}

	redo() {
		if (this.canRedo) this.undoneCount--;
	}

	/** Persists the visible state now, folding local undos into the history. */
	save() {
		if (!this.data) return;

		this.#cancelScheduledSave();
		this.saved = this.data;
		this.undoneCount = 0;
		this.#persist(this.saved);
	}

	/** Replaces the outlines of the given cells from polygons; false if one can't be rasterized. */
	setOutlines(updates: { cell: TrackType; polygons: Polygon[] }[], message: string): boolean {
		return this.#replaceCells(
			() => updates.map(({ cell, polygons }) => withOutline(cell, polygons)),
			message
		);
	}

	/** Replaces the masks of the given cells; false if one can't be traced. */
	setMasks(updates: { cell: TrackType; mask: RLEType }[], message: string): boolean {
		return this.#replaceCells(
			() => updates.map(({ cell, mask }) => withMask(cell, mask)),
			message
		);
	}

	/** Appends the cell that `build` makes from the current data, or returns null if it can't. */
	addCell(build: (tracks: TrackType[]) => TrackType): TrackType | null {
		const data = this.data;
		if (!data) return null;

		const cell = this.#tryBuild(() => build(data.current));
		if (cell) this.commitData([...data.current, cell], `Add cell ${cell.ObjectID}`);
		return cell;
	}

	/** Removes the cells and offers an undo. */
	deleteCells(cells: TrackType[]) {
		if (!this.data || cells.length === 0) return;

		const ids = new Set(cells.map((cell) => cell.ObjectID));
		const label = cells.length === 1 ? `cell ${cells[0].ObjectID}` : `${cells.length} cells`;
		this.commitData(
			this.data.current.filter((track) => !ids.has(track.ObjectID)),
			`Delete ${label}`
		);
		toast(`Deleted ${label}`, { action: { label: 'Undo', onClick: () => this.undo() } });
	}

	#replaceCells(build: () => TrackType[], message: string): boolean {
		const data = this.data;
		if (!data) return false;

		const cells = this.#tryBuild(build);
		if (!cells) return false;

		const byId = new Map(cells.map((cell) => [cell.ObjectID, cell]));
		this.commitData(
			data.current.map((track) => byId.get(track.ObjectID) ?? track),
			message
		);
		return true;
	}

	/** Runs an outline conversion, toasting instead of throwing when it fails. */
	#tryBuild<T>(build: () => T): T | null {
		try {
			return build();
		} catch (error) {
			toastError("Couldn't apply the edit", error);
			return null;
		}
	}

	#scheduleSave() {
		this.#cancelScheduledSave();
		this.#saveTimer = setTimeout(() => {
			this.#saveTimer = null;
			if (this.saved) this.#persist(this.saved);
		}, SAVE_DELAY_MS);
	}

	#cancelScheduledSave() {
		if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
		this.#saveTimer = null;
	}

	#persist(data: VersionManaged<TrackType[]>) {
		projectState.saveData(data).catch((error: unknown) => {
			toastError('Failed to save annotation data', error);
		});
	}
}

export const annotationState = new AnnotationState();
