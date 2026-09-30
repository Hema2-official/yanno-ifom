import type { RLEType, TrackType } from '$lib/types/annotation.type';
import type { Polygon } from '$lib/types/geometry.type';
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

/** A new cell of the frame with the given outline, shaped like the cells the backend writes. */
export function newCell(
	frame: number,
	tracks: TrackType[],
	outline: Polygon[],
	maskSize: [number, number]
): TrackType {
	const cell: TrackType = {
		Frame: frame,
		ObjectID: newObjectId(frame, tracks),
		SegmentationRLE: { size: maskSize, counts: '' },
		TrackID: newTrackId(tracks),
		Interpolated: false,
		Class: null,
		AncestorID: null
	};
	return withOutline(cell, outline);
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
