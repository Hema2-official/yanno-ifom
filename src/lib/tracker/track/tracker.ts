/**
 * The streaming symmetry tracker of Symmetry-Tracker-experimental (streaming_tracker.py with
 * TrackIoUSimilarity), frame by frame:
 * 1. the objects of frame g arrive with their local tracks (the kernel's 15-frame masks);
 * 2. for dt = 1 .. maxTimeKernelShift - 1, the still unlinked objects of frame g - dt and of frame g are
 *    scored (3D IoU of the local tracks, for pairs whose track boxes overlap) and assigned (scipy's
 *    LSAP); accepted pairs are linked;
 * 3. a linked object takes its predecessor's track ID, the gap between them is interpolated, and the
 *    unlinked objects start new tracks;
 * 4. frame g - (maxTimeKernelShift - 1) is now final: its records go to the sink and its local tracks
 *    are dropped.
 * Only the frames of the window are kept, so the memory does not grow with the video.
 */
import { AssignmentError, linearSumAssignment } from '../assign/lsap';
import { boxOverlap } from '../geometry/boxes';
import { encodeCounts } from '../rle/coco';
import { channel, channelCount, intersectionArea, type MultiRle } from '../rle/rle';
import { trackType, type TrackType } from '../output/records';
import { interpolateGap, type InterpolatedObject } from './interpolate';
import type { TrackedObject } from './objects';

export interface TrackingParams {
	readonly timeKernelSize: number;
	/** the largest frame distance plus one; null: 2 * timeKernelSize, as the library defaults it */
	readonly maxTimeKernelShift: number | null;
	readonly minRequiredSimilarity: number;
}

/** One assignment between two frames, as AssignFramePair solves it (for tests and diagnostics). */
export interface FramePairAssignment {
	readonly dt: number;
	readonly t0: readonly TrackedObject[];
	readonly tdt: readonly TrackedObject[];
	/** the similarity matrix, t0.length x tdt.length, row-major */
	readonly scores: Float64Array;
	readonly rows: Int32Array;
	readonly columns: Int32Array;
	readonly links: readonly (readonly [TrackedObject, TrackedObject])[];
}

/** Receives the records of a frame once they are final: its objects, then its interpolated objects by track ID. */
export type FrameSink = (frame: number, records: TrackType[]) => void;

/**
 * TracksIOU_RLE of the library: the 3D IoU of two local tracks dt frames apart, over the channel pairs
 * (dt + i of a, i of b), from their runs and channel areas.
 */
export function localTrackIou(
	a: MultiRle,
	areasA: ArrayLike<number>,
	b: MultiRle,
	areasB: ArrayLike<number>,
	dt: number
): number {
	const n = channelCount(a) - dt;
	let intersection = 0,
		union = 0;
	for (let i = 0; i < n; i++) {
		const inter = intersectionArea(channel(a, dt + i), channel(b, i));
		intersection += inter;
		union += areasA[dt + i] + areasB[i] - inter;
	}
	return union === 0 ? 0 : intersection / union;
}

export function tracksIou(a: TrackedObject, b: TrackedObject, dt: number): number {
	return localTrackIou(a.localTrack!, a.localAreas!, b.localTrack!, b.localAreas!, dt);
}

let scoreScratch = new Float64Array(64 * 64);
let costScratch = new Float64Array(64 * 64);

/**
 * AssignFramePair of the library: links the unlinked objects of an earlier frame (t0All) to the unlinked
 * objects of the current frame (tdtAll) and returns the new links. An assignment error (which needs
 * invalid scores) is reported and gives no links, as in the library.
 */
export function assignFramePair(
	t0All: readonly TrackedObject[],
	tdtAll: readonly TrackedObject[],
	dt: number,
	minRequiredSimilarity: number,
	observer?: (assignment: FramePairAssignment) => void
): [TrackedObject, TrackedObject][] {
	const t0 = t0All.filter((o) => o.nextId === null);
	const tdt = tdtAll.filter((o) => o.prevId === null);
	const links: [TrackedObject, TrackedObject][] = [];
	if (t0.length === 0 || tdt.length === 0) return links;
	const n0 = t0.length,
		n1 = tdt.length;
	if (n0 * n1 > scoreScratch.length) {
		scoreScratch = new Float64Array(n0 * n1);
		costScratch = new Float64Array(n0 * n1);
	}
	const scores = scoreScratch,
		cost = costScratch;
	for (let i = 0; i < n0; i++) {
		for (let j = 0; j < n1; j++) {
			scores[i * n1 + j] =
				boxOverlap(t0[i].trackBbox!, tdt[j].trackBbox!) !== 0
					? tracksIou(t0[i], tdt[j], dt)
					: 0;
		}
	}
	// MaximizeSimilarity.Cost: 1 - Matrix * (Matrix >= MinRequiredSimilarity)
	for (let k = 0; k < n0 * n1; k++)
		cost[k] = 1 - (scores[k] >= minRequiredSimilarity ? scores[k] : 0);
	let assignment;
	try {
		assignment = linearSumAssignment(cost, n0, n1);
	} catch (error) {
		if (!(error instanceof AssignmentError)) throw error;
		console.warn(
			`Error in linear_sum_assignment at Frame ${t0[0].frame} to Frame ${tdt[0].frame}`
		);
		return links;
	}
	for (let k = 0; k < assignment.rows.length; k++) {
		const i = assignment.rows[k],
			j = assignment.columns[k];
		if (scores[i * n1 + j] >= minRequiredSimilarity) {
			t0[i].nextId = tdt[j].objectId;
			tdt[j].prevId = t0[i].objectId;
			links.push([t0[i], tdt[j]]);
		}
	}
	observer?.({
		dt,
		t0,
		tdt,
		scores: scores.slice(0, n0 * n1),
		rows: assignment.rows,
		columns: assignment.columns,
		links
	});
	return links;
}

export class SymmetryTracker {
	private readonly maxTimeKernelShift: number;
	private readonly window = new Map<number, TrackedObject[]>();
	private readonly interpolated = new Map<number, InterpolatedObject[]>();
	private nextTrackId = 1;
	objects = 0;
	interpolatedObjects = 0;

	constructor(
		private readonly params: TrackingParams,
		private readonly sink: FrameSink,
		private readonly observer?: (assignment: FramePairAssignment) => void
	) {
		this.maxTimeKernelShift = params.maxTimeKernelShift ?? 2 * params.timeKernelSize;
	}

	get tracks(): number {
		return this.nextTrackId - 1;
	}

	/** Adds frame `frame` (every frame of the video in order, empty ones included), with local tracks set. */
	addFrame(frame: number, objects: TrackedObject[]): void {
		this.window.set(frame, objects);
		const links: [TrackedObject, TrackedObject][] = [];
		for (let dt = 1; dt < Math.min(this.maxTimeKernelShift, frame + 1); dt++) {
			links.push(
				...assignFramePair(
					this.window.get(frame - dt) ?? [],
					objects,
					dt,
					this.params.minRequiredSimilarity,
					this.observer
				)
			);
		}
		for (const [o0, odt] of links) {
			odt.trackId = o0.trackId;
			for (const object of interpolateGap(o0, odt, o0.trackId!)) {
				const pending = this.interpolated.get(object.frame);
				if (pending) pending.push(object);
				else this.interpolated.set(object.frame, [object]);
				this.interpolatedObjects++;
			}
		}
		for (const object of objects) {
			if (object.trackId === null) object.trackId = this.nextTrackId++;
		}
		this.objects += objects.length;
		this.evict(frame - (this.maxTimeKernelShift - 1));
	}

	/** Writes out every frame still in the window. */
	finish(): void {
		for (const frame of [...this.window.keys()]) this.evict(frame);
	}

	private evict(frame: number): void {
		const objects = this.window.get(frame);
		if (objects === undefined) return;
		this.window.delete(frame);
		const records = objects.map((o) =>
			trackType(
				o.frame,
				o.objectId,
				o.h,
				o.w,
				o.counts,
				o.trackId,
				false,
				o.className,
				o.ancestorId
			)
		);
		const interpolated = (this.interpolated.get(frame) ?? []).sort(
			(a, b) => a.trackId - b.trackId
		);
		this.interpolated.delete(frame);
		for (const o of interpolated)
			records.push(
				trackType(
					o.frame,
					o.objectId,
					o.h,
					o.w,
					encodeCounts(o.runs),
					o.trackId,
					true,
					null,
					null
				)
			);
		for (const o of objects) {
			// only needed while the frame is in the window
			o.localTrack = null;
			o.localAreas = null;
		}
		this.sink(frame, records);
	}
}
