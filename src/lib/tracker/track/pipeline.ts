/**
 * The tracking step without the network: SingleVideoSymmetryTracking of the experimental copy, with
 * the local tracks supplied by the caller (the GPU kernel in the browser, the reference dumps in the
 * replay tests).
 */
import { outerBoundingBox } from '../geometry/contours';
import type { TrackType } from '../output/records';
import { area, channel, channelCount, type MultiRle } from '../rle/rle';
import { faultyObjectIds, type FaultyObjectParams } from './faulty';
import { trackedObject, type TrackedObject } from './objects';
import {
	SymmetryTracker,
	type FrameSink,
	type FramePairAssignment,
	type TrackingParams
} from './tracker';

export interface TrackingStepParams extends TrackingParams, FaultyObjectParams {
	readonly faultyObjectRemoval: boolean;
}

/** The local tracks of a frame's objects (after faulty-object removal), in their order. */
export type LocalTrackProvider = (frame: number, objects: readonly TrackedObject[]) => MultiRle[];

export interface TrackingObservers {
	/** every object of a frame as loaded, and the ones faulty-object removal drops */
	objects?(frame: number, objects: readonly TrackedObject[], faulty: ReadonlySet<string>): void;
	assignment?(assignment: FramePairAssignment): void;
}

/** (frame, records) for runs of records of the same frame; frames must not decrease (GroupRecordsByFrame). */
export function* groupConsecutiveFrames(
	records: Iterable<TrackType>
): Generator<[number, TrackType[]]> {
	let current: number | null = null;
	let group: TrackType[] = [];
	for (const record of records) {
		if (current !== null && record.Frame < current) {
			throw new Error(
				`Annotation rows must be ordered by frame (frame ${record.Frame} came after frame ${current})`
			);
		}
		if (record.Frame !== current) {
			if (group.length) yield [current!, group];
			current = record.Frame;
			group = [];
		}
		group.push(record);
	}
	if (group.length) yield [current!, group];
}

/** The local tracks of a frame's objects, computed asynchronously (the GPU kernel). */
export type AsyncLocalTrackProvider = (
	frame: number,
	objects: readonly TrackedObject[]
) => Promise<MultiRle[]>;

/**
 * Each frame's tracked objects, after faulty-object removal (an empty list for a frame without
 * records), for numFrames frames.
 */
function* framesOfObjects(
	records: Iterable<TrackType>,
	numFrames: number,
	height: number,
	width: number,
	params: TrackingStepParams,
	observers: TrackingObservers
): Generator<[number, TrackedObject[]]> {
	const groups = groupConsecutiveFrames(records);
	let next = groups.next();
	for (let frame = 0; frame < numFrames; frame++) {
		let objects: TrackedObject[] = [];
		if (!next.done && next.value[0] === frame) {
			objects = next.value[1].map(trackedObject);
			next = groups.next();
		}
		if (params.faultyObjectRemoval && objects.length) {
			const faulty = faultyObjectIds(objects, height, width, params);
			observers.objects?.(frame, objects, faulty);
			if (faulty.size) objects = objects.filter((o) => !faulty.has(o.objectId));
		} else if (objects.length) {
			observers.objects?.(frame, objects, new Set());
		}
		yield [frame, objects];
	}
	if (!next.done)
		throw new Error(
			`The annotation has objects on frame ${next.value[0]} but the video has only ${numFrames} frames`
		);
}

/** Sets each object's local track, the pixel counts of its channels and its TrackBbox. */
function attachLocalTracks(objects: TrackedObject[], tracks: readonly MultiRle[]): void {
	for (let k = 0; k < objects.length; k++) {
		const track = tracks[k];
		const areas = new Int32Array(channelCount(track));
		for (let c = 0; c < areas.length; c++) areas[c] = area(channel(track, c));
		objects[k].localTrack = track;
		objects[k].localAreas = areas;
		objects[k].trackBbox = outerBoundingBox(track);
	}
}

/**
 * Tracks the segmentation records of a video of numFrames frames of height x width pixels: faulty-object
 * removal, the local tracks, the streaming tracker. The final records go to the sink frame by frame.
 */
export function trackRecords(
	records: Iterable<TrackType>,
	numFrames: number,
	height: number,
	width: number,
	params: TrackingStepParams,
	localTracks: LocalTrackProvider,
	sink: FrameSink,
	observers: TrackingObservers = {}
): SymmetryTracker {
	const tracker = new SymmetryTracker(params, sink, observers.assignment);
	for (const [frame, objects] of framesOfObjects(
		records,
		numFrames,
		height,
		width,
		params,
		observers
	)) {
		if (objects.length) attachLocalTracks(objects, localTracks(frame, objects));
		tracker.addFrame(frame, objects);
	}
	tracker.finish();
	return tracker;
}

/** trackRecords with local tracks that come asynchronously, one frame at a time. */
export async function trackRecordsAsync(
	records: Iterable<TrackType>,
	numFrames: number,
	height: number,
	width: number,
	params: TrackingStepParams,
	localTracks: AsyncLocalTrackProvider,
	sink: FrameSink,
	observers: TrackingObservers = {}
): Promise<SymmetryTracker> {
	const tracker = new SymmetryTracker(params, sink, observers.assignment);
	for (const [frame, objects] of framesOfObjects(
		records,
		numFrames,
		height,
		width,
		params,
		observers
	)) {
		if (objects.length) attachLocalTracks(objects, await localTracks(frame, objects));
		tracker.addFrame(frame, objects);
	}
	tracker.finish();
	return tracker;
}
