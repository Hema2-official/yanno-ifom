import type { ChangeType, TrackType, VersionManaged } from '$lib/types/annotation.type';
import { deepCopy } from '$lib/utils/data.svelte';
import * as jsondiffpatch from 'jsondiffpatch/with-text-diffs';
import { projectState } from './ProjectState.svelte';

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

class AnnotationState {
	data: VersionManaged<TrackType[]> | null = $state.raw(null);
	currentFrameIndex = $state(0);

	currentFrame: TrackType[] | null = $derived(this.getFrame(this.currentFrameIndex));

	// Cache of data entries for faster querying
	#tracksByFrame: Map<number, TrackType[]> = $derived.by(() =>
		Map.groupBy(this.data?.current ?? [], (track) => track.Frame)
	);

	getFrame(frameIndex: number): TrackType[] | null {
		return this.data ? (this.#tracksByFrame.get(frameIndex) ?? []) : null;
	}

	commitData(newData: TrackType[], message?: string) {
		if (!this.data) throw new Error('No data to commit changes to');

		const newDataCopy = deepCopy(newData);

		const newChange: ChangeType = {
			time: new Date().toISOString(),
			reverse: jsondiffer.diff(newDataCopy, this.data.current),
			...(message ? { msg: message } : {})
		};
		this.data = { current: newDataCopy, changes: this.data.changes.concat(newChange) };

		projectState.saveData(this.data);
	}

	getDataAtChangeIndex(index: number): TrackType[] {
		if (!this.data) throw new Error('No data to get from');
		if (index < 0 || index > this.data.changes.length) throw new Error('Index out of bounds');

		let result = deepCopy(this.data.current);
		for (let i = this.data.changes.length - 1; i >= index; i--) {
			result = jsondiffer.patch(result, this.data.changes[i].reverse) as TrackType[];
		}

		return result;
	}
}

export const annotationState = new AnnotationState();
