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

export type CellType = {
	id: number;
	// bodies: CellBodyType[];
	x: number[] | null;
	y: number[] | null;
};

export type FrameType = {
	id: number;
	cells: CellType[];
};

export type ChangeType = {
	time: number;
	frames: FrameType[];
};

export type DataType = {
	pos: number | null;
	originalFrames: FrameType[];
	changes: ChangeType[];
};
