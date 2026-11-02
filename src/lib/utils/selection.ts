import type { TrackType } from '$lib/types/annotation.type';
import { rleIoU } from './rle';

/** The overlap, as intersection over union, that makes a cell the same one a frame later. */
const MIN_OVERLAP = 0.3;

type Match = { cell: TrackType; overlap: number };

/** The candidate overlapping `reference` most, if it overlaps enough. */
function bestMatch(reference: TrackType, candidates: TrackType[]): Match | null {
	let best: Match | null = null;
	for (const cell of candidates) {
		const overlap = rleIoU(reference.SegmentationRLE, cell.SegmentationRLE);
		if (overlap >= MIN_OVERLAP && (!best || overlap > best.overlap)) best = { cell, overlap };
	}
	return best;
}

/**
 * The cells leading from `from` to `to`, inclusive.
 * Only considers cells which overlap enough, and prefers the biggest overlap.
 */
export function rangeBetween(
	from: TrackType,
	to: TrackType,
	getFrame: (frameIndex: number) => TrackType[]
): TrackType[] {
	if (from.Frame === to.Frame) return from === to ? [from] : [from, to];

	const picks = new Map<number, Match>();
	// From both ends, so a cell that moved too far to match the one before can match the one after
	const walk = (start: TrackType, end: TrackType) => {
		const step = Math.sign(end.Frame - start.Frame);
		let reference = start;
		for (let frame = start.Frame + step; frame !== end.Frame; frame += step) {
			const match = bestMatch(reference, getFrame(frame));
			if (!match) continue;
			const picked = picks.get(frame);
			if (!picked || match.overlap > picked.overlap) picks.set(frame, match);
			reference = match.cell;
		}
	};
	walk(from, to);
	walk(to, from);

	const between = Array.from(picks.values(), ({ cell }) => cell);
	return [from].concat(between, [to]);
}
