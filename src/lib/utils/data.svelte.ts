import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { TrackType } from '$lib/types/annotation.type';
import { polygonsToRle, rleToPolygons } from '$lib/utils/rle';

/**
 * Returns the minimum value in an array.
 * Replacement for Math.min(...) to get around spread operator limitations.
 *
 * @param arr the array to find the minimum of
 */
export function getMin<T extends number | bigint>(arr: ArrayLike<T>): T {
	if (arr.length === 0) return Infinity as T;
	let min = arr[0];
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] < min) min = arr[i];
	}
	return min;
}

/**
 * Returns the maximum value in an array.
 * Replacement for Math.max(...) to get around spread operator limitations.
 *
 * @param arr the array to find the maximum of
 */
export function getMax<T extends number | bigint>(arr: ArrayLike<T>): T {
	if (arr.length === 0) return -Infinity as T;
	let max = arr[0];
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] > max) max = arr[i];
	}
	return max;
}

/**
 * Converts a text input into a TrackType list.
 *
 * @param input - The input text to be converted. Expects a TSV with columns: POS, F, CELLNUM, X, Y.
 * @returns A Promise resolving to a TrackType list.
 */
export function textToTracks(input: string): TrackType[] {
	// Check if expected labels are present, and find their indices
	const firstLine = input.substring(0, input.indexOf('\n'));
	const expectedLabels = ['pos', 'f', 'cellnum', 'x', 'y'];
	const labels: { [key: string]: number } = {};
	firstLine
		.trim()
		.split('\t')
		.forEach((item, index) => {
			labels[item.toLowerCase()] = index;
		});
	if (!expectedLabels.every((item) => Object.keys(labels).includes(item))) {
		throw new Error(get(_)('unexpected_file_format') + expectedLabels.join('\t'));
	}

	// Parse each line into raw entries
	interface RawEntry {
		pos: number;
		frame: number;
		cellId: number;
		x: number;
		y: number;
	}
	const entries: RawEntry[] = [];

	let lineStartIndex = firstLine.length + 1;
	for (
		let newlineIndex = input.indexOf('\n', lineStartIndex);
		newlineIndex != -1;
		newlineIndex = input.indexOf('\n', lineStartIndex)
	) {
		const substr = input.substring(lineStartIndex, newlineIndex);
		lineStartIndex = newlineIndex + 1;
		const line = substr.split('\t');

		if (line.length <= labels['y']) continue;

		entries.push({
			pos: Number.parseInt(line[labels['pos']]),
			frame: Number.parseInt(line[labels['f']]),
			cellId: Number.parseInt(line[labels['cellnum']]),
			x: Number.parseFloat(line[labels['x']]),
			y: Number.parseFloat(line[labels['y']])
		});
	}

	// Group entries by (frame, cellId)
	const groups: {
		[frameCell: string]: { frame: number; cellId: number; xs: number[]; ys: number[] };
	} = {};

	for (const entry of entries) {
		const key = `${entry.frame}_${entry.cellId}`;
		if (!groups[key]) {
			groups[key] = { frame: entry.frame, cellId: entry.cellId, xs: [], ys: [] };
		}
		groups[key].xs.push(entry.x);
		groups[key].ys.push(entry.y);
	}

	// Convert each group to a TrackType
	const tracks: TrackType[] = [];
	let trackId = 1;

	const defaultSize: [number, number] = [512, 512];

	for (const key of Object.keys(groups)) {
		const group = groups[key];

		// Build polygon points from the coordinate arrays
		const points = group.xs.map((x, i) => ({ x, y: group.ys[i] }));

		// Convert polygon outline to RLE-encoded segmentation mask
		const rle = polygonsToRle([points], defaultSize);

		tracks.push({
			Frame: group.frame,
			ObjectID: String(group.cellId).padStart(8, '0'),
			SegmentationRLE: rle,
			TrackID: trackId++,
			Interpolated: false
		});
	}

	return tracks;
}

/**
 * Converts a TrackType list into a formatted text representation.
 *
 * @param tracks - The TrackType list to convert.
 * @param pos - The position value (default: 0).
 * @returns The formatted text representation.
 */
export function tracksToText(tracks: TrackType[], pos: number = 0): string {
	// Sort tracks by Frame ascending, then by ObjectID ascending
	const sortedTracks = [...tracks].sort((a, b) => {
		if (a.Frame !== b.Frame) {
			return a.Frame - b.Frame;
		}
		const idA = Number.parseInt(a.ObjectID, 10);
		const idB = Number.parseInt(b.ObjectID, 10);
		if (Number.isNaN(idA) || Number.isNaN(idB)) {
			return a.ObjectID.localeCompare(b.ObjectID);
		}
		return idA - idB;
	});

	let text = 'POS\tF\tCELLNUM\tX\tY\n';

	for (const track of sortedTracks) {
		const polygons = rleToPolygons(track.SegmentationRLE);
		if (polygons.length === 0) continue;

		// Use the first polygon representing the cell outline
		const polygon = polygons[0];
		const parsedId = Number.parseInt(track.ObjectID, 10);
		const cellId = Number.isNaN(parsedId) ? track.ObjectID : parsedId;

		for (const point of polygon) {
			// limit x and y values to 1 decimal place
			const limX = Math.round(point.x * 10) / 10;
			const limY = Math.round(point.y * 10) / 10;

			text += `${pos}\t${track.Frame}\t${cellId}\t${limX}\t${limY}\n`;
		}
	}

	return text;
}

/**
 * Downloads (saves) a file with the given data.
 *
 * @param data - The data to be downloaded.
 * @param filename - The name of the file to be downloaded.
 * @param type - The MIME type of the file (default: "text/plain").
 */
export function download(data: BlobPart, filename: string, type: string) {
	const url = URL.createObjectURL(new Blob([data], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.tabIndex = -1;
	document.body.appendChild(a);
	a.click();
	setTimeout(function () {
		a.remove();
		URL.revokeObjectURL(url);
	}, 0);
}
