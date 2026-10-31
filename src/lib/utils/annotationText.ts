import type { TrackType } from '$lib/types/annotation.type';
import type { Polygon } from '$lib/types/geometry.type';
import type { VideoShape } from './frames';
import { summarizeTracks } from './reports';
import { getPolygonSize, polygonsToRle, rleMeasure, rleToPolygons } from './rle';
import { newTrackId } from './tracks';

// The lab's text exports of phyloCell count frames and pixels from 1, as MATLAB does.
// The tracker's own `WriteTracks` counts pixels from 0, and marks its files with this POS
const TRACKER_POS = -1;

export const isAnnotationText = (file: File) => /\.txt$/i.test(file.name);

/** A table's rows as numbers, in the order of the columns asked for; `optional` ones may be NaN. */
function readTable(text: string, columns: string[], optional: string[] = []): number[][] {
	if (!text.trim()) return [];
	const [header, ...lines] = text.trimStart().split(/\r?\n/);
	const labels = header.trim().toLowerCase().split(/\s+/);
	if (!columns.every((column) => labels.includes(column))) {
		throw new Error(`Expected the columns ${columns.join(', ')}, not "${header.trim()}"`);
	}

	const indexes = [...columns, ...optional].map((column) => labels.indexOf(column));
	const rows: number[][] = [];
	lines.forEach((line, i) => {
		if (!line.trim()) return;
		const cells = line.trim().split(/\s+/);
		const row = indexes.map((index) => Number(cells[index]));
		if (row.slice(0, columns.length).some(Number.isNaN)) {
			throw new Error(`Line ${i + 2} doesn't have the numbers expected: "${line.trim()}"`);
		}
		rows.push(row);
	});
	return rows;
}

/**
 * Reads the outlines of F, CELLNUM, X and Y (POS being optional, the columns in any order), one
 * row per vertex, with the `_mothers` file's CellNum and DaughNum as ancestors. A file doesn't
 * know its video, so `video` gives it the size; the BirthFrame has no field to go in.
 */
export function textToTracks(text: string, video: VideoShape, mothersText = ''): TrackType[] {
	const outlines = new Map<string, { frame: number; cell: number; polygon: Polygon }>();
	const positions = new Set<number>();
	for (const [frame, cell, x, y, pos] of readTable(text, ['f', 'cellnum', 'x', 'y'], ['pos'])) {
		if (frame < 1 || frame > video.frames) {
			throw new Error(`Frame ${frame} isn't among the video's frames, 1 to ${video.frames}`);
		}
		if (!Number.isNaN(pos)) positions.add(pos);

		const key = `${frame}_${cell}`;
		if (!outlines.has(key)) outlines.set(key, { frame, cell, polygon: [] });
		outlines.get(key)?.polygon.push({ x, y });
	}
	if (positions.size > 1) {
		throw new Error(`The file holds several positions: ${Array.from(positions).join(', ')}`);
	}

	const origin = positions.has(TRACKER_POS) ? 0 : 1;
	const mothers = readTable(mothersText, ['cellnum', 'daughnum']);
	const ancestors = new Map(mothers.map(([mother, daughter]) => [daughter, mother]));

	return Array.from(outlines.values(), ({ frame, cell, polygon }) => {
		const SegmentationRLE = polygonsToRle(
			[polygon.map(({ x, y }) => ({ x: x - origin, y: y - origin }))],
			[video.height, video.width]
		);
		if (rleMeasure(SegmentationRLE).area === 0) {
			throw new Error(
				`Cell ${cell} of frame ${frame} is outside the video, ${video.width}×${video.height}`
			);
		}
		return {
			Frame: frame - 1,
			ObjectID: String(frame).padStart(4, '0') + String(cell).padStart(4, '0'),
			SegmentationRLE,
			TrackID: cell,
			Interpolated: false,
			Class: null,
			AncestorID: ancestors.get(cell) ?? null
		};
	});
}

/** The file `textToTracks` reads. A cell with no CELLNUM of its own takes an unused one. */
export function tracksToText(tracks: TrackType[], pos: number = 1): string {
	const seen = new Set<string>();
	let unused = newTrackId(tracks) ?? 1;
	const numbered = tracks.map((cell) => {
		const key = `${cell.Frame}_${cell.TrackID}`;
		const number = cell.TrackID === null || seen.has(key) ? unused++ : cell.TrackID;
		seen.add(key);
		return { cell, number };
	});
	numbered.sort((a, b) => a.cell.Frame - b.cell.Frame || a.number - b.number);

	let text = 'POS\tF\tCELLNUM\tX\tY\n';
	for (const { cell, number } of numbered) {
		const polygons = rleToPolygons(cell.SegmentationRLE);
		if (polygons.length === 0) continue;

		// The format has one outline per cell
		const outline = polygons.reduce((largest, polygon) =>
			getPolygonSize(polygon) > getPolygonSize(largest) ? polygon : largest
		);
		for (const { x, y } of outline) {
			text += `${pos}\t${cell.Frame + 1}\t${number}\t${x + 1}\t${y + 1}\n`;
		}
	}
	return text;
}

/** The `_mothers` file: each track with an ancestor, born at its first frame. */
export function tracksToMothersText(tracks: TrackType[], pos: number = 1): string {
	const rows = summarizeTracks(tracks).flatMap(({ trackId, first, ancestors }) => {
		const mother = ancestors.find((ancestor) => ancestor !== null);
		return mother === undefined ? [] : [{ mother, daughter: trackId, birth: first + 1 }];
	});
	rows.sort((a, b) => a.mother - b.mother || a.birth - b.birth);

	let text = 'pos\tCellNum\tDaughNum\tBirthFrame\n';
	for (const { mother, daughter, birth } of rows) {
		text += `${pos}\t${mother}\t${daughter}\t${birth}\n`;
	}
	return text;
}
