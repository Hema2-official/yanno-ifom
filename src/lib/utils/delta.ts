import type { ChangeType, TrackType } from '$lib/types/annotation.type';
import * as jsondiffpatch from 'jsondiffpatch/with-text-diffs';

// ! This config must match the backend's
export const jsondiffer = jsondiffpatch.create({
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

export function makeChange(
	newData: TrackType[],
	oldData: TrackType[],
	msg?: string
): ChangeType | null {
	const reverse = jsondiffer.diff(newData, oldData);
	if (reverse === undefined) return null;
	return { time: new Date().toISOString(), reverse, ...(msg ? { msg } : {}) };
}

/** The longest run of the pairs whose second entries increase, in their order (patience sorting). */
function increasingRun(pairs: [number, number][]): [number, number][] {
	// tails[n]: the pair ending the best run of length n + 1 found so far
	const tails: number[] = [];
	const previous = new Int32Array(pairs.length);
	for (let k = 0; k < pairs.length; k++) {
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (pairs[tails[middle]][1] < pairs[k][1]) low = middle + 1;
			else high = middle;
		}
		previous[k] = low > 0 ? tails[low - 1] : -1;
		tails[low] = k;
	}
	const run: [number, number][] = new Array(tails.length);
	for (let k = tails.at(-1) ?? -1, n = tails.length - 1; k >= 0; k = previous[k], n--) {
		run[n] = pairs[k];
	}
	return run;
}

/**
 * `makeChange` for changes that may touch every cell, as a step's result or its undo.
 * The delta only removes, inserts and changes cells.
 */
export function makeBulkChange(
	newData: TrackType[],
	oldData: TrackType[],
	msg: string
): ChangeType | null {
	const oldIndex = new Map(oldData.map((cell, j) => [cell.ObjectID, j]));
	const newIds = new Set(newData.map((cell) => cell.ObjectID));
	// Repeated IDs can't be matched this way
	if (oldIndex.size < oldData.length || newIds.size < newData.length) {
		return makeChange(newData, oldData, msg);
	}

	// The cells both have, in the new order, of which the longest run in the old order stays put
	const shared: [number, number][] = [];
	newData.forEach((cell, i) => {
		const j = oldIndex.get(cell.ObjectID);
		if (j !== undefined) shared.push([i, j]);
	});
	const kept = increasingRun(shared);
	const keptNew = new Uint8Array(newData.length);
	const keptOld = new Uint8Array(oldData.length);
	for (const [i, j] of kept) keptNew[i] = keptOld[j] = 1;

	// Removals at their index in the new cells, insertions and changes at theirs in the old
	const reverse: Record<string, unknown> = { _t: 'a' };
	newData.forEach((cell, i) => {
		if (!keptNew[i]) reverse[`_${i}`] = [structuredClone(cell), 0, 0];
	});
	oldData.forEach((cell, j) => {
		if (!keptOld[j]) reverse[j] = [structuredClone(cell)];
	});
	for (const [i, j] of kept) {
		const delta = jsondiffer.diff(newData[i], oldData[j]);
		if (delta !== undefined) reverse[j] = delta;
	}
	if (Object.keys(reverse).length === 1) return null;
	return { time: new Date().toISOString(), msg, reverse: reverse as ChangeType['reverse'] };
}
