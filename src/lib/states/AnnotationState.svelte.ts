import type { ChangeType, TrackType, VersionManaged } from '$lib/types/annotation.type';
import { deepCopy } from '$lib/utils/data.svelte';
import * as jsondiffpatch from 'jsondiffpatch/with-text-diffs';
import { projectState } from './ProjectState.svelte';
import { toast } from 'svelte-sonner';

export interface HistoryController {
	undo(): void;
	redo(): void;
	canUndo: boolean;
	canRedo: boolean;
}

const jsondiffer = jsondiffpatch.create({
	// used to match objects when diffing arrays, by default only === operator is used
	// only called when objects are not equal by reference
	objectHash: function (obj) {
		// for TrackType
		if ('ObjectID' in obj) return (obj as TrackType).ObjectID;

		// for RLEType
		// if ('size' in obj && 'counts' in obj && (obj as RLEType).size.length === 2) {
		// 	const { size } = obj as RLEType;
		// 	return `${size[0]}x${size[1]}`;
		// }
	},
	arrays: {
		// default true, detect items moved inside the array (otherwise they will be registered as remove+add)
		detectMove: true,
		// default false, the value of items moved is not included in deltas
		includeValueOnMove: false
	},
	cloneDiffValues: structuredClone // maybe change to deepCopy
});

function makeChange(newData: TrackType[], oldData: TrackType[], msg?: string): ChangeType | null {
	const reverse = jsondiffer.diff(newData, oldData);
	if (reverse === undefined) return null;
	return { time: new Date().toISOString(), reverse, ...(msg ? { msg } : {}) };
}

/** The state before the last `count` changes of `data`. */
export function stateBefore(data: VersionManaged<TrackType[]>, count: number): TrackType[] {
	let result = deepCopy(data.current);
	for (let i = data.changes.length - 1; i >= data.changes.length - count; i--) {
		result = jsondiffer.patch(result, data.changes[i].reverse) as TrackType[];
	}
	return result;
}

class AnnotationState implements HistoryController {
	/** The data as saved on the server (or in the local database). */
	saved: VersionManaged<TrackType[]> | null = $state.raw(null);
	currentFrameIndex = $state(0);

	// Undoing doesn't push to the server, just increments this counter until something new is committed
	#undoneCount = $state(0);

	/** The saved data with the undone changes reverted as one more change. */
	readonly data: typeof this.saved = $derived.by(() => {
		if (!this.saved || this.#undoneCount === 0) return this.saved;

		const { current, changes } = this.saved;
		const undone = changes.slice(-this.#undoneCount).reverse();
		const message = `Undo ${undone.map((change) => change.msg ?? 'change').join(', ')}`;
		const undoCurrent = stateBefore(this.saved, this.#undoneCount);
		const undoChange = makeChange(undoCurrent, current, message);
		return { current: undoCurrent, changes: undoChange ? [...changes, undoChange] : changes };
	});

	canUndo = $derived((this.saved?.changes.length ?? 0) > this.#undoneCount);
	canRedo = $derived(this.#undoneCount > 0);
	hasPendingUndo = $derived(this.#undoneCount > 0);

	currentFrame: TrackType[] | null = $derived(this.getFrame(this.currentFrameIndex));

	// Cache of data entries for faster querying
	#tracksByFrame: Map<number, TrackType[]> = $derived.by(() =>
		Map.groupBy(this.data?.current ?? [], (track) => track.Frame)
	);

	getFrame(frameIndex: number): TrackType[] | null {
		return this.data ? (this.#tracksByFrame.get(frameIndex) ?? []) : null;
	}

	load(data: VersionManaged<TrackType[]> | null) {
		this.saved = data;
		this.#undoneCount = 0;
	}

	commitData(newData: TrackType[], message?: string) {
		if (!this.data) throw new Error('No data to commit changes to');

		const newDataCopy = deepCopy(newData);
		const change = makeChange(newDataCopy, this.data.current, message);
		if (!change && !this.hasPendingUndo) return;

		this.#save({
			current: newDataCopy,
			changes: change ? [...this.data.changes, change] : this.data.changes
		});
	}

	undo() {
		if (this.canUndo) this.#undoneCount++;
	}

	redo() {
		if (this.canRedo) this.#undoneCount--;
	}

	save() {
		if (this.data) this.#save(this.data);
	}

	#save(data: VersionManaged<TrackType[]>) {
		this.saved = data;
		this.#undoneCount = 0;

		projectState.saveData(data).catch((error: unknown) => {
			toast.error('Failed to save annotation data', { description: String(error) });
		});
	}

	getDataAtChangeIndex(index: number): TrackType[] {
		if (!this.saved) throw new Error('No data to get from');
		if (index < 0 || index > this.saved.changes.length) throw new Error('Index out of bounds');

		return stateBefore(this.saved, this.saved.changes.length - index);
	}
}

export const annotationState = new AnnotationState();
