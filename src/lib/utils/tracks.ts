import type { RLEType, TrackType } from '$lib/types/annotation.type';
import type { Point, Polygon } from '$lib/types/geometry.type';
import { getCenterOfPolygonsCached } from './geometry';
import { polygonsToRle, rleToPolygons } from './rle';

/** ObjectIDs look like FFFFNNNN: the frame number, then the cell's number within the frame. */
export function newObjectId(frame: number, tracks: TrackType[]): string {
	const prefix = String(frame).padStart(4, '0');
	const taken = new Set(tracks.map((track) => track.ObjectID));
	let number = tracks.filter((track) => track.Frame === frame).length + 1;
	while (taken.has(prefix + String(number).padStart(4, '0'))) number++;
	return prefix + String(number).padStart(4, '0');
}

/** "cell 00120003" or "3 cells", for messages. */
export function cellsLabel(cells: TrackType[]): string {
	return cells.length === 1 ? `cell ${cells[0].ObjectID}` : `${cells.length} cells`;
}

/** "track 4" or "tracks 2–3, 7", or the cells themselves when one has no track. */
export function tracksLabel(cells: TrackType[]): string {
	const ids = new Set(cells.map((cell) => cell.TrackID));
	if (ids.has(null)) return cellsLabel(cells);
	const sorted = (Array.from(ids) as number[]).sort((a, b) => a - b);
	return `track${sorted.length > 1 ? 's' : ''} ${formatRanges(sorted)}`;
}

/** The next unused track ID, or null while the data isn't tracked at all. */
export function newTrackId(tracks: TrackType[]): number | null {
	let max: number | null = null;
	for (const { TrackID } of tracks) {
		if (TrackID !== null && (max === null || TrackID > max)) max = TrackID;
	}
	return max === null ? null : max + 1;
}

export function trackAncestor(cells: TrackType[], trackId: number): number | null {
	const member = cells.find((cell) => cell.TrackID === trackId && cell.AncestorID != null);
	return member?.AncestorID ?? null;
}

/** The track's ancestors, nearest first, as far as they go without looping. */
export function ancestorsOf(cells: TrackType[], trackId: number): number[] {
	const chain: number[] = [];
	let id = trackAncestor(cells, trackId);
	while (id !== null && !chain.includes(id)) {
		chain.push(id);
		id = trackAncestor(cells, id);
	}
	return chain;
}

export function cellCenter(cell: TrackType): Point {
	return getCenterOfPolygonsCached(rleToPolygons(cell.SegmentationRLE));
}

/** Each cell of the frame whose ancestor has a cell there, with that cell. */
function ancestryLinks(frame: TrackType[]): { ancestor: TrackType; cell: TrackType }[] {
	const byTrack = new Map(frame.map((cell) => [cell.TrackID, cell]));
	return frame.flatMap((cell) => {
		const ancestor = cell.AncestorID == null ? undefined : byTrack.get(cell.AncestorID);
		return ancestor && ancestor !== cell ? { ancestor, cell } : [];
	});
}

/** Of the frames' ancestry links, in order, the cells of the first one between each two tracks. */
export function firstLinkedCells(frames: TrackType[][]): Set<string> {
	const seen = new Set<string>();
	const first = new Set<string>();
	for (const frame of frames) {
		for (const { cell } of ancestryLinks(frame)) {
			const link = `${cell.TrackID ?? cell.ObjectID}<${cell.AncestorID}`;
			if (!seen.has(link)) first.add(cell.ObjectID);
			seen.add(link);
		}
	}
	return first;
}

/**
 * An arrow per cell of the frame whose ancestor has a cell there (of `only`
 * those cells, unless it's null), between their centers and short of both,
 * leaving labels of that size readable.
 */
export function ancestryArrows(
	frame: TrackType[],
	labelSize: number,
	only: ReadonlySet<string> | null
): { id: string; from: Point; to: Point }[] {
	return ancestryLinks(frame).flatMap(({ ancestor, cell }) => {
		if (only && !only.has(cell.ObjectID)) return [];

		const [from, to] = [cellCenter(ancestor), cellCenter(cell)];
		const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
		const gap = Math.min(0.75 * labelSize, length / 4) / length;
		const [gapX, gapY] = [(to.x - from.x) * gap, (to.y - from.y) * gap];
		return {
			id: cell.ObjectID,
			from: { x: from.x + gapX, y: from.y + gapY },
			to: { x: to.x - gapX, y: to.y - gapY }
		};
	});
}

/** A new cell of the frame with the given mask, shaped like the cells the backend writes. */
export function newCell(frame: number, tracks: TrackType[], mask: RLEType): TrackType {
	const cell: TrackType = {
		Frame: frame,
		ObjectID: newObjectId(frame, tracks),
		SegmentationRLE: mask,
		TrackID: newTrackId(tracks),
		Interpolated: false,
		Class: null,
		AncestorID: null
	};
	return withMask(cell, mask);
}

/** The cell with its outline rasterized into a new mask. */
export function withOutline(cell: TrackType, polygons: Polygon[]): TrackType {
	return withMask(cell, polygonsToRle(polygons, cell.SegmentationRLE.size));
}

/**
 * The cell with its mask replaced. The mask is traced back to polygons purely as
 * validation (and the trace is memoized, so the display reuses it). Throws when the
 * mask is empty or can't be traced.
 */
export function withMask(cell: TrackType, mask: RLEType): TrackType {
	const polygons = rleToPolygons(mask);
	if (polygons.length === 0) throw new Error('The cell would have no outline');
	return { ...cell, SegmentationRLE: mask };
}

/** Sorted numbers as a compact list, e.g. "3, 5–8, 12". */
export function formatRanges(numbers: number[]): string {
	const ranges: string[] = [];
	for (let i = 0; i < numbers.length; i++) {
		let end = i;
		while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++;
		ranges.push(end > i ? `${numbers[i]}–${numbers[end]}` : String(numbers[i]));
		i = end;
	}
	return ranges.join(', ');
}

/** "frame 4" or "frames 2–3, 7", for messages. */
export function framesLabel(frames: number[]): string {
	const sorted = Array.from(new Set(frames)).sort((a, b) => a - b);
	return `frame${sorted.length > 1 ? 's' : ''} ${formatRanges(sorted)}`;
}

/** The frames holding more than one of the cells. */
export function sharedFrames(cells: TrackType[]): number[] {
	const counts = new Map<number, number>();
	for (const { Frame } of cells) counts.set(Frame, (counts.get(Frame) ?? 0) + 1);
	return Array.from(counts)
		.filter(([, count]) => count > 1)
		.map(([frame]) => frame)
		.sort((a, b) => a - b);
}

/** The frames of the cells where the track has another cell. */
export function occupiedFrames(tracks: TrackType[], cells: TrackType[], trackId: number): number[] {
	const ids = new Set(cells.map((cell) => cell.ObjectID));
	const frames = new Set(cells.map((cell) => cell.Frame));
	const occupied = new Set<number>();
	for (const track of tracks) {
		if (track.TrackID === trackId && frames.has(track.Frame) && !ids.has(track.ObjectID)) {
			occupied.add(track.Frame);
		}
	}
	return Array.from(occupied).sort((a, b) => a - b);
}
