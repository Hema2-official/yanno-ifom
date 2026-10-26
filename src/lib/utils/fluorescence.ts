import type { FrameTime } from '$lib/states/VideoDisplayState.svelte';
import type { TrackType } from '$lib/types/annotation.type';
import { mergedPixels } from './masks';
import { ancestorOf, quantile, type TrackSummary } from './reports';
import { rlePixels } from './rle';

/** A channel's values summed over a region of one frame. */
export type PixelStats = { count: number; sum: number; squares: number };

/**
 * A mother and her daughter measured as one object, from the daughter's first
 * frame to the first of either's last frame or next daughter (`end` excluded).
 */
export type Couple = { mother: number; daughter: number; first: number; end: number };

export function couplesOf(tracks: TrackSummary[]): Couple[] {
	const byId = new Map(tracks.map((track) => [track.trackId, track]));
	const daughters = Map.groupBy(tracks, ancestorOf);
	const nextBud = (trackId: number, after: number) =>
		(daughters.get(trackId) ?? []).reduce(
			(next, { first }) => (first > after && first < next ? first : next),
			Infinity
		);

	return tracks.flatMap((daughter) => {
		const mother = byId.get(ancestorOf(daughter) ?? NaN);
		if (!mother || mother === daughter) return [];
		const first = daughter.first;
		const end = Math.min(
			mother.last + 1,
			daughter.last + 1,
			nextBud(mother.trackId, first),
			nextBud(daughter.trackId, first)
		);
		return end > first
			? { mother: mother.trackId, daughter: daughter.trackId, first, end }
			: [];
	});
}

/** A couple in a frame by its cells, so it keeps its measurement when a track is renumbered. */
const coupleKey = (frame: number, members: TrackType[]) =>
	[frame, ...members.map((cell) => cell.ObjectID).sort()].join(' ');

/** A couple in a frame where both have a cell, with its key into `byCouple`. */
export type CoupleFrame = { frame: number; couple: Couple; members: TrackType[]; key: string };

/** The couples' frames with both cells, couple by couple, so the first one keeps a shared cell. */
export function coupleFrames(cells: TrackType[], couples: Couple[]): CoupleFrame[] {
	const byFrame = Map.groupBy(cells, (cell) => cell.Frame);
	return couples.flatMap((couple) => {
		const frames: CoupleFrame[] = [];
		for (let frame = couple.first; frame < couple.end; frame++) {
			const members = coupleCells(byFrame.get(frame) ?? [], couple);
			if (members) frames.push({ frame, couple, members, key: coupleKey(frame, members) });
		}
		return frames;
	});
}

/** One channel measured under every cell and couple, and outside the cells, frame by frame. */
export type Measurement = {
	/** The cells as measured, which `appliesTo` holds the current ones against. */
	cells: TrackType[];
	byCell: Map<string, PixelStats>;
	byCouple: Map<string, PixelStats>;
	/** By frame, null where nothing is outside the cells or the frame wasn't measured. */
	background: (PixelStats | null)[];
};

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** Reads images' pixels as stored, without color management, through one canvas. */
export function pixelReader(): (blob: Blob) => Promise<Pixels> {
	const canvas = new OffscreenCanvas(1, 1);
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error("Couldn't read the frames' pixels");
	return async (blob) => {
		const image = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
		const { width, height } = image;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		context.drawImage(image, 0, 0);
		image.close();
		return context.getImageData(0, 0, width, height);
	};
}

const READ_AHEAD = 4;

/**
 * Sums each frame's values at `offset` in its RGBA pixels (0 for red, 1 for
 * green, 2 for blue) under every cell and couple and outside the cells. `read`
 * gives null for a frame without that channel's image.
 */
export async function measureFluorescence(
	cells: TrackType[],
	coupled: CoupleFrame[],
	frameCount: number,
	read: (frame: number) => Promise<Pixels | null>,
	offset: number,
	{ signal, onFrame }: { signal: AbortSignal; onFrame: (done: number) => void }
): Promise<Measurement> {
	const byFrame = Map.groupBy(cells, (cell) => cell.Frame);
	const couplesByFrame = Map.groupBy(coupled, ({ frame }) => frame);
	const measurement: Measurement = {
		cells,
		byCell: new Map(),
		byCouple: new Map(),
		background: []
	};

	// The next frames are read while one is measured
	const reads = new Map<number, Promise<Pixels | null>>();
	const readAhead = (frame: number) => {
		if (frame >= frameCount || reads.has(frame)) return;
		const reading = read(frame);
		reading.catch(() => {}); // Awaited in turn, unless the measurement stops first
		reads.set(frame, reading);
	};

	// One mask of what the cells cover, cleared for each frame
	let covered = new Uint8Array(0);
	for (let frame = 0; frame < frameCount; frame++) {
		for (let ahead = 0; ahead < READ_AHEAD; ahead++) readAhead(frame + ahead);
		const pixels = await reads.get(frame);
		reads.delete(frame);
		signal.throwIfAborted();
		if (pixels) {
			const size = pixels.width * pixels.height;
			covered = covered.length === size ? covered.fill(0) : new Uint8Array(size);
			measurement.background[frame] = measureFrame(
				measurement,
				byFrame.get(frame) ?? [],
				couplesByFrame.get(frame) ?? [],
				pixels,
				offset,
				covered
			);
		} else {
			measurement.background[frame] = null;
		}
		onFrame(frame + 1);
	}
	return measurement;
}

/** Measures the frame's cells and couples into the measurement, and returns its background. */
function measureFrame(
	measurement: Measurement,
	cells: TrackType[],
	couples: CoupleFrame[],
	{ data, width, height }: Pixels,
	offset: number,
	covered: Uint8Array
): PixelStats | null {
	const pixelsOf = new Map<string, Uint32Array>();
	for (const cell of cells) {
		const [rows, cols] = cell.SegmentationRLE.size;
		if (rows !== height || cols !== width) {
			throw new Error(
				`Cell ${cell.ObjectID} is ${cols}×${rows} px, its frame ${width}×${height}`
			);
		}
		const pixels = rlePixels(cell.SegmentationRLE);
		pixelsOf.set(cell.ObjectID, pixels);
		measurement.byCell.set(cell.ObjectID, statsOf(pixels, data, offset));
		for (const pixel of pixels) covered[pixel] = 1;
	}

	for (const { members, key } of couples) {
		// Joined as a merge joins them, across the neck
		const joined = mergedPixels(
			members.map((cell) => pixelsOf.get(cell.ObjectID)!),
			[height, width]
		);
		measurement.byCouple.set(key, statsOf(joined, data, offset));
	}

	let [count, sum, squares] = [0, 0, 0];
	for (let pixel = 0; pixel < covered.length; pixel++) {
		if (covered[pixel]) continue;
		const value = data[pixel * 4 + offset];
		count++;
		sum += value;
		squares += value * value;
	}
	return count > 0 ? { count, sum, squares } : null;
}

/** The couple's cells in a frame, if both of them have one there. */
function coupleCells(cells: TrackType[], { mother, daughter }: Couple): TrackType[] | null {
	const members = cells.filter((cell) => cell.TrackID === mother || cell.TrackID === daughter);
	const both =
		members.some((cell) => cell.TrackID === mother) &&
		members.some((cell) => cell.TrackID === daughter);
	return both ? members : null;
}

function statsOf(pixels: Uint32Array, data: Uint8ClampedArray, offset: number): PixelStats {
	let [sum, squares] = [0, 0];
	for (const pixel of pixels) {
		const value = data[pixel * 4 + offset];
		sum += value;
		squares += value * value;
	}
	return { count: pixels.length, sum, squares };
}

/**
 * Whether the measurement is of these cells: the same ones with the masks they
 * had, and each of the couples' frames measured.
 */
export function appliesTo(measurement: Measurement, cells: TrackType[], coupled: CoupleFrame[]) {
	const measured = new Map(measurement.cells.map((cell) => [cell.ObjectID, cell]));
	const same = (cell: TrackType) => {
		const was = measured.get(cell.ObjectID);
		return (
			was !== undefined &&
			was.Frame === cell.Frame &&
			was.SegmentationRLE.counts === cell.SegmentationRLE.counts
		);
	};
	return (
		cells.length === measured.size &&
		cells.every(same) &&
		coupled.every(({ key }) => measurement.byCouple.has(key))
	);
}

/** One object in one frame: a track's cells, a couple's, or an untracked cell. */
export type FluorescenceRow = {
	frame: number;
	/** The track, or the mother of a couple; null for an untracked cell. */
	track: number | null;
	daughter: number | null;
	cells: TrackType[];
	area: number;
	/** Less the background, when it's removed. */
	mean: number;
	/** The sample standard deviation, as ImageJ gives it. */
	std: number;
	/** The sum, less the background over the area when it's removed (the corrected total cell fluorescence). */
	total: number;
	/** The frame's mean outside the cells; null where they cover it, so nothing is removed. */
	background: number | null;
};

/** What the chart and the table can show of the rows. */
export const fluorescenceMeasures = {
	mean: 'Mean',
	std: 'Standard deviation',
	total: 'Total'
} as const;
export type FluorescenceMeasure = keyof typeof fluorescenceMeasures;

/** The object a row belongs to: its track and daughter, or its untracked cell. */
export const objectKey = (row: FluorescenceRow) =>
	row.track === null ? row.cells[0].ObjectID : `${row.track} ${row.daughter}`;

/**
 * Each object's measurement in each frame, of the cells as they are now (see
 * `appliesTo`). Measured together, a couple's cells count only in the couple
 * there, so every cell counts once.
 */
export function fluorescenceRows(
	measurement: Measurement,
	cells: TrackType[],
	coupled: CoupleFrame[],
	{ removeBackground, together }: { removeBackground: boolean; together: boolean }
): FluorescenceRow[] {
	const rows: FluorescenceRow[] = [];
	const add = (
		frame: number,
		track: number | null,
		daughter: number | null,
		cells: TrackType[],
		stats: PixelStats
	) => {
		const outside = measurement.background[frame];
		const background = outside ? outside.sum / outside.count : null;
		const removed = removeBackground ? (background ?? 0) : 0;
		const variance =
			stats.count > 1
				? (stats.squares - (stats.sum * stats.sum) / stats.count) / (stats.count - 1)
				: 0;
		rows.push({
			frame,
			track,
			daughter,
			cells,
			area: stats.count,
			mean: stats.sum / stats.count - removed,
			std: Math.sqrt(Math.max(0, variance)),
			total: stats.sum - removed * stats.count,
			background
		});
	};

	const inCouples = new Set<string>();
	if (together) {
		for (const { frame, couple, members, key } of coupled) {
			const stats = measurement.byCouple.get(key);
			// A cell in two couples at once, as with twins, stays in the first
			const taken = members.some((cell) => inCouples.has(cell.ObjectID));
			if (!stats || taken) continue;
			for (const cell of members) inCouples.add(cell.ObjectID);
			add(frame, couple.mother, couple.daughter, members, stats);
		}
	}

	const singles = cells.filter(
		(cell) => !inCouples.has(cell.ObjectID) && measurement.byCell.has(cell.ObjectID)
	);
	const objects = Map.groupBy(singles, (cell) =>
		cell.TrackID === null ? cell.ObjectID : `${cell.Frame} ${cell.TrackID}`
	);
	for (const cells of objects.values()) {
		const pooled = { count: 0, sum: 0, squares: 0 };
		for (const cell of cells) {
			const stats = measurement.byCell.get(cell.ObjectID)!;
			pooled.count += stats.count;
			pooled.sum += stats.sum;
			pooled.squares += stats.squares;
		}
		if (pooled.count > 0) add(cells[0].Frame, cells[0].TrackID, null, cells, pooled);
	}
	return rows.sort((a, b) => a.frame - b.frame || (a.track ?? -1) - (b.track ?? -1));
}

/** An object over its frames: a track, a couple or an untracked cell. */
export type FluorescenceObject = {
	key: string;
	track: number | null;
	daughter: number | null;
	rows: FluorescenceRow[];
	/** The measure's average over its frames. */
	average: number;
	/** Its frame with the measure's highest value. */
	peak: FluorescenceRow;
};

export function fluorescenceObjects(
	rows: FluorescenceRow[],
	measure: FluorescenceMeasure
): Map<string, FluorescenceObject> {
	const objects = new Map<string, FluorescenceObject>();
	for (const [key, members] of Map.groupBy(rows, objectKey)) {
		objects.set(key, {
			key,
			track: members[0].track,
			daughter: members[0].daughter,
			rows: members,
			average: members.reduce((sum, row) => sum + row[measure], 0) / members.length,
			peak: members.reduce((peak, row) => (row[measure] > peak[measure] ? row : peak))
		});
	}
	return objects;
}

/** A frame's spread of a measure over its objects. */
export type FrameQuartiles = {
	frame: number;
	objects: number;
	lower: number;
	median: number;
	upper: number;
};

/** Each frame's median and quartiles of the measure, null for a frame without objects. */
export function quartilesByFrame(
	rows: FluorescenceRow[],
	measure: FluorescenceMeasure,
	frameCount: number
): (FrameQuartiles | null)[] {
	const byFrame = Map.groupBy(rows, (row) => row.frame);
	return Array.from({ length: frameCount }, (_, frame) => {
		const values = (byFrame.get(frame) ?? []).map((row) => row[measure]).sort((a, b) => a - b);
		if (values.length === 0) return null;
		return {
			frame,
			objects: values.length,
			lower: quantile(values, 0.25),
			median: quantile(values, 0.5),
			upper: quantile(values, 0.75)
		};
	});
}

/** A frame's time once it's set, else the frame itself. */
export const timeAt = (time: FrameTime | null, frame: number) =>
	time ? time.start + frame * time.interval : frame;

/** The CSVs' first columns, the project and channel, so several projects' files stack into one table. */
export type CsvContext = {
	movie: string;
	channel: string;
	time: FrameTime | null;
	removeBackground: boolean;
};

type CsvRow = (string | number | null)[];

const round = (value: number) => Math.round(value * 1000) / 1000;

const contextHeader = ({ time }: CsvContext) => [
	'Movie',
	'Channel',
	'Frame',
	...(time ? [`Time (${time.unit})`] : [])
];
const contextColumns = ({ movie, channel, time }: CsvContext, frame: number): CsvRow => [
	movie,
	channel,
	frame,
	...(time ? [round(timeAt(time, frame))] : [])
];

// The standard deviation is the same without the background
const measureHeader = (measure: FluorescenceMeasure, removeBackground: boolean) =>
	removeBackground && measure !== 'std'
		? `${fluorescenceMeasures[measure]} less background`
		: fluorescenceMeasures[measure];

/** Every object in every frame, with all the measures. */
export function cellsCsv(rows: FluorescenceRow[], context: CsvContext) {
	const { removeBackground } = context;
	return {
		header: [
			...contextHeader(context),
			'Track',
			'Daughter',
			'Cells',
			'Area (px)',
			measureHeader('mean', removeBackground),
			'Std',
			measureHeader('total', removeBackground),
			'Background'
		],
		rows: (): CsvRow[] =>
			rows.map((row) => [
				...contextColumns(context, row.frame),
				row.track,
				row.daughter,
				row.cells.map((cell) => cell.ObjectID).join(' '),
				row.area,
				round(row.mean),
				round(row.std),
				round(row.total),
				row.background === null ? null : round(row.background)
			])
	};
}

/** The objects' median and quartiles of a measure, by frame. */
export function medianCsv(
	quartiles: (FrameQuartiles | null)[],
	measure: FluorescenceMeasure,
	context: CsvContext
) {
	return {
		header: [
			...contextHeader(context),
			'Objects',
			`Median ${measureHeader(measure, context.removeBackground).toLowerCase()}`,
			'Lower quartile',
			'Upper quartile'
		],
		rows: (): CsvRow[] =>
			quartiles
				.filter((spread) => spread !== null)
				.map((spread) => [
					...contextColumns(context, spread.frame),
					spread.objects,
					round(spread.median),
					round(spread.lower),
					round(spread.upper)
				])
	};
}
