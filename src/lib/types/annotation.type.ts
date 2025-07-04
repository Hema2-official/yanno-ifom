import type { Delta } from 'jsondiffpatch';

export type CellBodyType = {
	x: number[];
	y: number[];
};

export type NewCellType = {
	id: number;
	bodies: CellBodyType[];
};

export type NewFrameType = {
	id: number;
	cells: NewCellType[];
};

export type NewChangeType = {
	time: number;
	message?: string;
	frames: NewFrameType[];
};

export type NewDataType = {
	pos: number | null;
	originalFrames: NewFrameType[];
	changes: NewChangeType[];
};

// export type CellType = {
// 	id: number;
// 	// bodies: CellBodyType[];
// 	x: number[] | null;
// 	y: number[] | null;
// };

// export type FrameType = {
// 	id: number;
// 	cells: CellType[];
// };

// export type ChangeType = {
// 	time: number;
// 	frames: FrameType[];
// };

// export type DataType = {
// 	pos: number | null;
// 	originalFrames: FrameType[];
// 	changes: ChangeType[];
// };

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
