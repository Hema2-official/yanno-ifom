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
	LocalTrackRLE: RLEType[] | null;
	Centroid: [number, number] | null;
	SegBbox: BoundingBoxType | null;
	TrackBbox: BoundingBoxType | null;
	PrevID: string | null;
	NextID: string | null;
	TrackID: number | null;
	Interpolated: boolean;
};

export type ChangeType = {
	time?: string; // ISO 8601
	msg?: string;
	reverse: Exclude<Delta, undefined>;
};

export type VersionManaged<T> = {
	current: T;
	changes: ChangeType[];
};
