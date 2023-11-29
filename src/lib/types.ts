export type CellType = {
    id: number,
    x: number[],
    y: number[]
};

export type FrameType = {
    cells: CellType[]
};

export type DataType = {
    pos: number,
    frames: FrameType[]
};