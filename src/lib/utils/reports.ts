import type { ChangeType, TrackType } from '$lib/types/annotation.type';
import { isManualEdit } from './history';
import { gapsBetween } from './interpolate';
import { rleMeasure } from './rle';
import { framesLabel, sharedFrames } from './tracks';

export type TrackSummary = {
	trackId: number;
	cells: TrackType[];
	first: number;
	last: number;
	gaps: number[]; // Frame IDs where the track has no cell in between
	ancestors: (number | null)[];
	descendants: number[];
	meanArea: number;
};

export function summarizeTracks(cells: TrackType[]): TrackSummary[] {
	const summaries = new Map<number, TrackSummary>();
	for (const [trackId, members] of Map.groupBy(cells, (c) => c.TrackID)) {
		if (trackId === null) continue;
		members.sort((a, b) => a.Frame - b.Frame);
		const area = members.reduce((sum, cell) => sum + rleMeasure(cell.SegmentationRLE).area, 0);
		summaries.set(trackId, {
			trackId,
			cells: members,
			first: members[0].Frame,
			last: members[members.length - 1].Frame,
			gaps: gapsBetween(members).map((gap) => gap.frame),
			ancestors: Array.from(new Set(members.map((cell) => cell.AncestorID ?? null))),
			descendants: [],
			meanArea: area / members.length
		});
	}
	for (const { trackId, ancestors } of summaries.values()) {
		for (const a of ancestors) if (a !== null) summaries.get(a)?.descendants.push(trackId);
	}
	return Array.from(summaries.values()).sort((a, b) => a.trackId - b.trackId);
}

/** The first ancestor found on the track's cells, as the editor takes it. */
export const ancestorOf = (track: TrackSummary): number | null =>
	track.ancestors.find((ancestor) => ancestor !== null) ?? null;

/** The track's ancestors, nearest first, as far as they go without looping. */
function ancestorChain(track: TrackSummary, byId: Map<number, TrackSummary>): number[] {
	const chain: number[] = [];
	for (let id = ancestorOf(track); id !== null && !chain.includes(id); ) {
		chain.push(id);
		const next = byId.get(id);
		id = next ? ancestorOf(next) : null;
	}
	return chain;
}

/** Something a check found, with the cells that show it. */
type Finding = { text: string; cells: TrackType[] };

/** Worst first. */
export const checkLevelOrder = ['error', 'warning', 'note'] as const;
export type CheckLevel = (typeof checkLevelOrder)[number];

export type Check = {
	title: string;
	description?: string;
	level: CheckLevel;
	findings: Finding[];
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function runChecks(
	cells: TrackType[],
	tracks: TrackSummary[],
	lastFrame: number,
	{ jump, areaFactor }: { jump: number; areaFactor: number }
): Check[] {
	const byId = new Map(tracks.map((track) => [track.trackId, track]));
	const untracked = Map.groupBy(
		tracks.length > 0 ? cells.filter((cell) => cell.TrackID === null) : [],
		(cell) => cell.Frame
	);
	// The pairs of cells in adjacent frames of a track
	const measured = tracks.flatMap((track) =>
		track.cells.slice(1).flatMap((after, i) => {
			const before = track.cells[i];
			if (after.Frame !== before.Frame + 1) return [];
			return {
				track,
				pair: [before, after],
				from: rleMeasure(before.SegmentationRLE),
				to: rleMeasure(after.SegmentationRLE)
			};
		})
	);
	const between = ([before, after]: TrackType[]) => `frames ${before.Frame} and ${after.Frame}`;

	return [
		{
			title: 'Tracks with several ancestors',
			level: 'error',
			findings: tracks
				.filter((track) => track.ancestors.length > 1)
				.map((track) => {
					const counts = Map.groupBy(track.cells, (cell) => cell.AncestorID ?? null);
					const [[usual], ...others] = Array.from(counts).sort(
						(a, b) => b[1].length - a[1].length
					);
					const parts = Array.from(counts, ([ancestor, members]) =>
						ancestor === null
							? `none on ${plural(members.length, 'cell')}`
							: `ancestor ${ancestor} on ${plural(members.length, 'cell')}`
					);
					return {
						text: `Track ${track.trackId} has ${parts.join(', ')} (${usual === null ? 'none' : usual} is the usual)`,
						cells: others.flatMap(([, members]) => members)
					};
				})
		},
		{
			title: 'Tracks with several instances in one frame',
			level: 'error',
			findings: tracks.flatMap((track) => {
				const frames = sharedFrames(track.cells);
				if (frames.length === 0) return [];
				return {
					text: `Track ${track.trackId} in ${framesLabel(frames)}`,
					cells: track.cells.filter((cell) => cell.Frame === frames[0])
				};
			})
		},
		{
			title: 'Ancestors younger than their descendants',
			description: 'The arrow may be pointing the wrong way.',
			level: 'error',
			findings: tracks.flatMap((track) => {
				const ancestor = byId.get(ancestorOf(track) ?? NaN);
				if (!ancestor || ancestor.first <= track.first) return [];
				return {
					text: `Track ${track.trackId} starts in frame ${track.first}, its ancestor ${ancestor.trackId} in frame ${ancestor.first}`,
					cells: track.cells.slice(0, 1)
				};
			})
		},
		{
			title: 'Nonexistent ancestors',
			level: 'error',
			findings: tracks.flatMap((track) =>
				track.ancestors
					.filter((ancestor) => ancestor !== null && !byId.has(ancestor))
					.map((ancestor) => ({
						text: `Track ${track.trackId}'s ancestor ${ancestor} has no cells`,
						cells: track.cells.slice(0, 1)
					}))
			)
		},
		{
			title: 'Tracks descending from themselves',
			description: 'Following the ancestors completes a circuit.',
			level: 'error',
			findings: tracks
				.filter((track) => ancestorChain(track, byId).includes(track.trackId))
				.map((track) => ({
					text: `Track ${track.trackId} is among its own ancestors`,
					cells: track.cells.slice(0, 1)
				}))
		},
		{
			title: 'Tracks ending before the last frame',
			level: 'warning',
			findings: tracks
				.filter((track) => track.last < lastFrame)
				.map((track) => ({
					text: `Track ${track.trackId} ends in frame ${track.last}`,
					cells: track.cells.slice(-1)
				}))
		},
		{
			title: 'Tracks with gaps',
			level: 'warning',
			findings: tracks
				.filter((track) => track.gaps.length > 0)
				.map((track) => {
					const after = track.cells.findIndex((cell) => cell.Frame > track.gaps[0]);
					return {
						text: `Track ${track.trackId} misses ${framesLabel(track.gaps)}`,
						cells: track.cells.slice(after - 1, after + 1)
					};
				})
		},
		{
			title: 'Cells without a track',
			description: 'Left out by the tracking, or added since.',
			level: 'warning',
			findings: Array.from(untracked)
				.sort(([a], [b]) => a - b)
				.map(([frame, members]) => ({
					text: `${plural(members.length, 'untracked cell')} in frame ${frame}`,
					cells: members
				}))
		},
		{
			title: 'Young tracks without an ancestor',
			level: 'note',
			findings: tracks
				.filter((track) => track.first > 0 && ancestorOf(track) === null)
				.map((track) => ({
					text: `Track ${track.trackId} starts in frame ${track.first}`,
					cells: track.cells.slice(0, 1)
				}))
		},
		{
			title: 'Jumps',
			description: `A cell's center moves more than ${jump} px between two frames: possibly two cells under one track.`,
			level: 'note',
			findings: measured.flatMap(({ track, pair, from, to }) => {
				const distance = Math.hypot(to.x - from.x, to.y - from.y);
				if (distance <= jump) return [];
				return {
					text: `Track ${track.trackId} moves ${Math.round(distance)} px between ${between(pair)}`,
					cells: pair
				};
			})
		},
		{
			title: 'Sudden size changes',
			description: `A cell's area changes more than ${areaFactor} times between two frames: possibly a merged or split outline.`,
			level: 'note',
			findings: measured.flatMap(({ track, pair, from, to }) => {
				const factor =
					Math.max(from.area, to.area) / Math.max(1, Math.min(from.area, to.area));
				if (factor <= areaFactor) return [];
				return {
					text: `Track ${track.trackId} goes from ${from.area} to ${to.area} px between ${between(pair)}`,
					cells: pair
				};
			})
		}
	];
}

export const frameMetrics = {
	cells: 'Cells',
	started: 'New tracks',
	ended: 'Ended tracks',
	edits: 'Manual edits',
	area: 'Mean area (px)'
} as const;
export type FrameMetric = keyof typeof frameMetrics;
type FrameStats = Record<FrameMetric, number[]>;

export function frameStats(
	cells: TrackType[],
	tracks: TrackSummary[],
	changes: ChangeType[],
	changeFrames: number[][],
	frameCount: number
): FrameStats {
	const zeros = () => Array<number>(frameCount).fill(0);
	const stats: FrameStats = {
		cells: zeros(),
		started: zeros(),
		ended: zeros(),
		edits: zeros(),
		area: zeros()
	};
	for (const cell of cells) {
		if (cell.Frame >= frameCount) continue;
		stats.cells[cell.Frame]++;
		stats.area[cell.Frame] += rleMeasure(cell.SegmentationRLE).area;
	}
	stats.area = stats.area.map((area, frame) => Math.round(area / (stats.cells[frame] || 1)));
	for (const { first, last } of tracks) {
		if (first > 0 && first < frameCount) stats.started[first]++;
		if (last < frameCount - 1) stats.ended[last]++;
	}
	changes.forEach((change, i) => {
		if (!isManualEdit(change)) return;
		for (const frame of new Set(changeFrames[i])) if (frame < frameCount) stats.edits[frame]++;
	});
	return stats;
}

/** A track with its ancestor: where it starts and how it sits in the lineage. */
export type Ancestry = {
	ancestor: number;
	descendant: TrackSummary;
	/** Frames since the ancestor's previous descendant started, null for its first. */
	interval: number | null;
	/** How many ancestors up the lineage goes, 1 for a descendant of a track without one. */
	generation: number;
};

export function lineage(tracks: TrackSummary[]): Ancestry[] {
	const byId = new Map(tracks.map((track) => [track.trackId, track]));
	const descendants = tracks
		.filter((track) => ancestorOf(track) !== null)
		.sort((a, b) => ancestorOf(a)! - ancestorOf(b)! || a.first - b.first);
	return descendants.map((descendant, i) => {
		const ancestor = ancestorOf(descendant)!;
		const previous = descendants[i - 1];
		const sibling = previous && ancestorOf(previous) === ancestor ? previous : null;
		return {
			ancestor,
			descendant,
			interval: sibling ? descendant.first - sibling.first : null,
			generation: ancestorChain(descendant, byId).length
		};
	});
}

export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = values.toSorted((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
