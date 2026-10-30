import type { RLEType, TrackType, VersionManaged } from '$lib/types/annotation.type';
import type { Polygon } from '$lib/types/geometry.type';
import {
	ancestorsOf,
	cellsLabel,
	framesLabel,
	newCell,
	newObjectId,
	occupiedFrames,
	sharedFrames,
	tracksLabel,
	withMask,
	withOutline
} from '$lib/utils/tracks';
import { gapsBetween, interpolatedCell, type Gap } from '$lib/utils/interpolate';
import { mergeMasks } from '$lib/utils/masks';
import { toastError } from '$lib/api/errors';
import { jsondiffer, makeBulkChange, makeChange } from '$lib/utils/delta';
import { projectState } from './ProjectState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';
import { toast } from 'svelte-sonner';

/** How long a commit waits for further commits before it is persisted. */
const SAVE_DELAY_MS = 1000;

/** The state before the last `count` changes of `data`. */
export function stateBefore(data: VersionManaged<TrackType[]>, count: number): TrackType[] {
	let result = structuredClone(data.current); // patch() mutates in place
	for (let i = data.changes.length - 1; i >= data.changes.length - count; i--) {
		result = jsondiffer.patch(result, structuredClone(data.changes[i].reverse)) as TrackType[];
	}
	return result;
}

/**
 * The frame of every cell each change added, removed or edited, read off its
 * delta while walking the history back.
 */
export function framesOfChanges(data: VersionManaged<TrackType[]>): number[][] {
	const frames: number[][] = data.changes.map(() => []);
	let state = structuredClone(data.current); // patch() mutates in place
	for (let i = data.changes.length - 1; i >= 0; i--) {
		const reverse = structuredClone(data.changes[i].reverse);
		const isArrayDelta = (reverse as Record<string, unknown>)._t === 'a';
		const keys = isArrayDelta ? Object.keys(reverse).filter((key) => key !== '_t') : [];
		const add = (cell: TrackType | undefined) => cell && frames[i].push(cell.Frame);

		// "_N" is a cell's index after the change (one it added or moved), "N" its index before
		for (const key of keys) if (key.startsWith('_')) add(state[Number(key.slice(1))]);
		state = jsondiffer.patch(state, reverse) as TrackType[];
		for (const key of keys) if (!key.startsWith('_')) add(state[Number(key)]);
	}
	return frames;
}

class AnnotationState {
	/** The data as saved in the local database. */
	saved: VersionManaged<TrackType[]> | null = $state.raw(null);

	// Kept beyond the last place the window fits, so a narrower one brings it back
	#currentFrameIndex = $state(0);

	/** The first of the shown frames. */
	get currentFrameIndex(): number {
		return Math.min(this.#currentFrameIndex, videoDisplayState.maxFrameIndex);
	}
	set currentFrameIndex(value: number) {
		this.#currentFrameIndex = value;
	}

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
		const undoChange = makeBulkChange(undoCurrent, current, message);
		return { current: undoCurrent, changes: undoChange ? changes.concat(undoChange) : changes };
	});

	canUndo = $derived((this.saved?.changes.length ?? 0) > this.undoneCount);
	canRedo = $derived(this.undoneCount > 0);

	/** True while the visible data isn't persisted yet (pending save or local undo). */
	isDirty = $derived(this.#saveTimer !== null || this.undoneCount > 0);

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
			changes: change ? this.data.changes.concat(change) : this.data.changes
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

	/** Replaces the masks of the given cells, deleting those given null; false if one can't be traced. */
	setMasks(updates: { cell: TrackType; mask: RLEType | null }[], message: string): boolean {
		const deleted = new Set(
			updates.filter(({ mask }) => !mask).map(({ cell }) => cell.ObjectID)
		);
		return this.#replaceCells(
			() => updates.flatMap(({ cell, mask }) => (mask ? [withMask(cell, mask)] : [])),
			message,
			deleted
		);
	}

	/** Appends the cell that `build` makes from the current data, or returns null if it can't. */
	addCell(build: (tracks: TrackType[]) => TrackType): TrackType | null {
		const cells = this.addCells(
			(tracks) => [build(tracks)],
			([cell]) => `Add cell ${cell.ObjectID}`
		);
		return cells?.[0] ?? null;
	}

	/** Appends the cells that `build` makes from the current data, or returns null if it can't. */
	addCells(
		build: (tracks: TrackType[]) => TrackType[],
		message: (cells: TrackType[]) => string
	): TrackType[] | null {
		const data = this.data;
		if (!data) return null;

		const cells = this.#tryBuild(() => build(data.current));
		if (cells) this.commitData(data.current.concat(cells), message(cells));
		return cells;
	}

	/** Copies the cells `offset` frames away, into their tracks, and returns the copies. */
	copyCells(cells: TrackType[], offset: number): TrackType[] | null {
		const beyond = cells.find(({ Frame }) => {
			const frame = Frame + offset;
			return frame < 0 || frame >= projectState.frameCount;
		});
		if (beyond) {
			toastError(`There is no frame ${beyond.Frame + offset} to copy to`);
			return null;
		}
		const taken = cells.find(
			({ Frame, TrackID }) =>
				TrackID !== null &&
				(this.getFrame(Frame + offset) ?? []).some((cell) => cell.TrackID === TrackID)
		);
		if (taken) {
			toastError(
				`Track ${taken.TrackID} already has a cell in frame ${taken.Frame + offset}`
			);
			return null;
		}

		return this.addCells(
			(tracks) => {
				const next = tracks.slice();
				return cells.map((cell) => {
					const frame = cell.Frame + offset;
					const copy: TrackType = {
						Frame: frame,
						ObjectID: newObjectId(frame, next),
						SegmentationRLE: cell.SegmentationRLE,
						TrackID: cell.TrackID,
						Interpolated: false,
						Class: cell.Class ?? null,
						AncestorID: cell.AncestorID ?? null
					};
					next.push(copy);
					return copy;
				});
			},
			(copies) =>
				`Copy ${cellsLabel(copies)} to ${framesLabel(copies.map((copy) => copy.Frame))}`
		);
	}

	/** Removes the cells and offers an undo. */
	deleteCells(cells: TrackType[]) {
		if (!this.data || cells.length === 0) return;

		const ids = new Set(cells.map((cell) => cell.ObjectID));
		const label = cellsLabel(cells);
		this.commitData(
			this.data.current.filter((track) => !ids.has(track.ObjectID)),
			`Delete ${label}`
		);
		toast(`Deleted ${label}`, { action: { label: 'Undo', onClick: () => this.undo() } });
	}

	/** Merges the cells of one frame into `into`, which keeps its IDs. */
	mergeCells(cells: TrackType[], into: TrackType): boolean {
		const others = cells.filter((cell) => cell.ObjectID !== into.ObjectID);
		if (others.length === 0) return false;
		if (others.some((cell) => cell.Frame !== into.Frame)) {
			toastError('Only cells of the same frame can be merged');
			return false;
		}

		const masks = others.concat(into).map((cell) => cell.SegmentationRLE);
		return this.#replaceCells(
			() => [withMask(into, mergeMasks(masks))],
			`Merge ${cellsLabel(others)} into cell ${into.ObjectID}`,
			new Set(others.map((cell) => cell.ObjectID))
		);
	}

	/**
	 * Replaces each cell by the pieces it was cut into: the first keeps the
	 * cell's IDs, the others become new, untracked cells. Returns all the pieces.
	 */
	splitCells(splits: { cell: TrackType; pieces: RLEType[] }[]): TrackType[] | null {
		const data = this.data;
		if (!data || splits.length === 0) return null;

		const built = this.#tryBuild(() => {
			const next = data.current.slice();
			const cells: TrackType[] = [];
			for (const { cell, pieces } of splits) {
				const [kept, ...rest] = pieces;
				const index = next.findIndex((track) => track.ObjectID === cell.ObjectID);
				next[index] = withMask(cell, kept);
				cells.push(next[index]);
				for (const mask of rest) {
					const piece = newCell(cell.Frame, next, mask);
					next.push(piece);
					cells.push(piece);
				}
			}
			return { next, cells };
		});
		if (!built) return null;

		const label = cellsLabel(splits.map(({ cell }) => cell));
		this.commitData(built.next, `Split ${label} into ${built.cells.length} cells`);
		return built.cells;
	}

	/**
	 * Assigns the TrackID to the given cells with the first ancestor found in the track's cells.
	 * If the renaming was exhaustive, the descendants follow it with their ancestor ID.
	 */
	setTrackId(cells: TrackType[], trackId: number): boolean {
		const next = this.#withTrackId(cells, trackId);
		if (next) this.commitData(next, `Set track ${trackId} on ${cellsLabel(cells)}`);
		return next !== null;
	}

	/** The data with `setTrackId`'s change, or null (with a toast) where the track would break. */
	#withTrackId(cells: TrackType[], trackId: number): TrackType[] | null {
		const data = this.data;
		if (!data || cells.length === 0) return null;

		const crowded = sharedFrames(cells).concat(occupiedFrames(data.current, cells, trackId));
		if (crowded.length > 0) {
			toastError(`Track ${trackId} would have two cells in ${framesLabel(crowded)}`);
			return null;
		}

		const ids = new Set(cells.map((cell) => cell.ObjectID));
		const memberWithAncestor = data.current.find(
			(cell) => cell.TrackID === trackId && !ids.has(cell.ObjectID) && cell.AncestorID != null
		);
		const ancestorId =
			memberWithAncestor?.AncestorID ??
			cells.find((cell) => cell.AncestorID != null)?.AncestorID ??
			null;

		const remaining = new Set(
			data.current.flatMap((cell) => (ids.has(cell.ObjectID) ? [] : (cell.TrackID ?? [])))
		);
		const emptied = new Set(
			cells.flatMap(({ TrackID }) =>
				TrackID === null || TrackID === trackId || remaining.has(TrackID) ? [] : TrackID
			)
		);

		const next = data.current.map((cell) => {
			if (ids.has(cell.ObjectID)) {
				return { ...cell, TrackID: trackId, AncestorID: ancestorId };
			}
			if (cell.AncestorID == null || !emptied.has(cell.AncestorID)) return cell;
			return { ...cell, AncestorID: trackId };
		});
		// Moved into its own ancestor or descendant, the track would descend from itself
		const ownAncestors = next.flatMap((cell) =>
			cell.TrackID === trackId ? (cell.AncestorID ?? []) : []
		);
		if (ownAncestors.includes(trackId) || ancestorsOf(next, trackId).includes(trackId)) {
			toastError(`Track ${trackId} would be its own ancestor`);
			return null;
		}
		return next;
	}

	/** Sets the ancestor of the cells' whole tracks, and of the untracked cells themselves (null clears). */
	setAncestor(cells: TrackType[], ancestorId: number | null): boolean {
		const data = this.data;
		if (!data || cells.length === 0) return false;

		const ids = new Set(cells.map((cell) => cell.ObjectID));
		const trackIds = new Set(cells.flatMap((cell) => cell.TrackID ?? []));
		if (ancestorId !== null) {
			const lineage = [ancestorId, ...ancestorsOf(data.current, ancestorId)];
			const looping = lineage.find((id) => trackIds.has(id));
			if (looping !== undefined) {
				toastError(`Track ${looping} would be its own ancestor`);
				return false;
			}
		}

		const next = data.current.map((cell) => {
			const member =
				ids.has(cell.ObjectID) || (cell.TrackID !== null && trackIds.has(cell.TrackID));
			if (!member || (cell.AncestorID ?? null) === ancestorId) return cell;
			return { ...cell, AncestorID: ancestorId };
		});
		const label = tracksLabel(cells);
		this.commitData(
			next,
			ancestorId === null
				? `Clear the ancestor of ${label}`
				: `Set ancestor ${ancestorId} on ${label}`
		);
		return true;
	}

	/**
	 * Fills each frame between the cells with a cell blended from the nearest
	 * ones before and after, and returns the new cells. When the cells hold a
	 * single track ID, the new cells and the untracked ones join that track.
	 */
	interpolateCells(cells: TrackType[]): TrackType[] | null {
		if (!this.data) return null;

		const shared = sharedFrames(cells);
		if (shared.length > 0) {
			toastError(
				`Select one cell per frame to interpolate, not several in ${framesLabel(shared)}`
			);
			return null;
		}
		const gaps = gapsBetween(cells);
		if (gaps.length === 0) {
			toastError('There are no frames between the selected cells to fill');
			return null;
		}

		const trackIds = new Set(cells.flatMap((cell) => cell.TrackID ?? []));
		const only = trackIds.size === 1 ? [...trackIds][0] : null;
		const trackOf = ({ before, after }: Gap) => only ?? before.TrackID ?? after.TrackID;
		const crowded = gaps.filter((gap) => {
			const trackId = trackOf(gap);
			if (trackId === null) return false;
			return (this.getFrame(gap.frame) ?? []).some((cell) => cell.TrackID === trackId);
		});
		if (crowded.length > 0) {
			const frames = crowded.map((gap) => gap.frame);
			toastError(`The track already has a cell in ${framesLabel(frames)}`);
			return null;
		}

		const joining = only === null ? [] : cells.filter((cell) => cell.TrackID === null);
		const base =
			only !== null && joining.length > 0
				? this.#withTrackId(joining, only)
				: this.data.current;
		if (!base) return null;
		const added = this.#tryBuild(() => {
			const next = base.slice();
			return gaps.map((gap) => {
				const cell = interpolatedCell(gap, next, trackOf(gap));
				next.push(cell);
				return cell;
			});
		});
		if (!added) return null;

		const label =
			`${cellsLabel(added)} in ${framesLabel(added.map((cell) => cell.Frame))}` +
			(joining.length > 0 ? ` and set track ${only} on ${cellsLabel(joining)}` : '');
		this.commitData(base.concat(added), `Interpolate ${label}`);
		toast(`Interpolated ${label}`, { action: { label: 'Undo', onClick: () => this.undo() } });
		return added;
	}

	#replaceCells(build: () => TrackType[], message: string, deleted = new Set<string>()): boolean {
		const data = this.data;
		if (!data) return false;

		const cells = this.#tryBuild(build);
		if (!cells) return false;

		const byId = new Map(cells.map((cell) => [cell.ObjectID, cell]));
		this.commitData(
			data.current
				.filter((track) => !deleted.has(track.ObjectID))
				.map((track) => byId.get(track.ObjectID) ?? track),
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
