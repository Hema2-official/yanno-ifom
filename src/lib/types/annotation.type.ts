import type { Delta } from 'jsondiffpatch';

export type RLEType = {
	size: [number, number];
	counts: string;
};

export type BoundingBoxType = [number, number, number, number];

export type TrackType = {
	Frame: number;
	ObjectID: string;
	SegmentationRLE: RLEType;
	LocalTrackRLE: RLEType[];
	Centroid: [number, number];
	SegBbox: BoundingBoxType;
	TrackBbox: BoundingBoxType;
	PrevID: string | null;
	NextID: string | null;
	TrackID: number;
	Interpolated: boolean;
};

export type ChangeType = {
	time?: string; // ISO 8601
	msg?: string;
	reverse: Delta;
};

export type VersionManaged<T> = {
	current: T;
	changes: ChangeType[];
};
