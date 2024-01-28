export type CellType = {
    id: number,
    x: number[] | null,
    y: number[] | null
};

export type FrameType = {
    id: number,
    cells: CellType[]
};

export type ChangeType = {
    time: number,
    frames: FrameType[]
};

export type DataType = {
    pos: number,
    originalFrames: FrameType[],
    changes: ChangeType[]
};

export enum EditorMode {
    Point,
    Whole,
    Smooth
}
