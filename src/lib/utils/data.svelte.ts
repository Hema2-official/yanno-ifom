import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { TrackType, RLEType } from '$lib/types/annotation.type';
import { maskToRle, rleToPolygons } from '$lib/utils/rle';
import * as jsondiffpatch from 'jsondiffpatch';

/**
 * Creates a deep copy of the given object or proxy.
 *
 * @param obj - The object or proxy to be copied.
 * @returns A deep copy of the object.
 */
export function deepCopy<T>(obj: T) {
	// Let Svelte do its magic unwrapping proxies before we clone anything
	// ($state.snapshot doesn't care if it's not a proxy)
	const snapshot = $state.snapshot(obj);

	return structuredClone(snapshot);
}

/**
 * Returns the minimum value in an array.
 * Replacement for Math.min(...) to get around spread operator limitations.
 *
 * @param arr the array to find the minimum of
 */
export function getMin<T extends number | bigint>(arr: T[]): T {
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
export function getMax<T extends number | bigint>(arr: T[]): T {
	if (arr.length === 0) return -Infinity as T;
	let max = arr[0];
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] > max) max = arr[i];
	}
	return max;
}

/**
 * Determines the unordered and deep equality of two values.
 * @returns True if the objects are deeply equal, false otherwise.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	// check if it's either the same object, or the same primitive value
	if (a === b) return true;

	// check if they are both objects
	if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

	// check if they have the same amount of keys
	if (Object.keys(a).length !== Object.keys(b).length) return false;

	// compare objects
	for (const key in a) {
		if (!Object.hasOwn(b, key)) return false; // other object doesn't have this prop
		if (!deepEqual((<{ [k: string]: object }>a)[key], (<{ [k: string]: object }>b)[key]))
			return false;
	}
	return true;
}

/**
 * Fill a polygon into a binary mask using the scanline algorithm (even-odd rule).
 *
 * @param mask The binary mask to fill (mutated in place).
 * @param size The mask dimensions as [height, width].
 * @param polygon Array of {x, y} points defining the polygon outline.
 */
function fillPolygon(
	mask: Uint8Array,
	size: [number, number],
	polygon: { x: number; y: number }[]
) {
	const height = size[0];
	const width = size[1];
	const n = polygon.length;
	if (n < 2) return;

	for (let i = 0; i < n; i++) {
		const p1 = polygon[i];
		const p2 = polygon[(i + 1) % n];

		const x0 = Math.round(p1.x);
		const y0 = Math.round(p1.y);
		const x1 = Math.round(p2.x);
		const y1 = Math.round(p2.y);

		if (y0 === y1) continue; // skip horizontal edges

		const minY = Math.min(y0, y1);
		const maxY = Math.max(y0, y1);

		for (let y = minY; y <= maxY; y++) {
			if (y < 0 || y >= height) continue;
			const xIntersect = Math.round(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
			for (let x = Math.max(0, xIntersect); x < width; x++) {
				mask[y * width + x] = mask[y * width + x] ? 0 : 1;
			}
		}
	}
}

/**
 * Convert polygon points to an RLE-encoded mask.
 *
 * @param points Array of {x, y} points defining the polygon outline.
 * @param size The mask dimensions as [height, width].
 * @returns An RLEType object representing the filled polygon.
 */
function polygonToRle(points: { x: number; y: number }[], size: [number, number]): RLEType {
	const mask = new Uint8Array(size[0] * size[1]);
	fillPolygon(mask, size, points);
	return maskToRle(mask, size);
}

/**
 * Compute the centroid and bounding box from polygon points.
 *
 * @param points Array of {x, y} points.
 * @returns Object containing centroid [x, y] and bounding box [minX, minY, maxX, maxY].
 */
function getPolygonInfo(points: { x: number; y: number }[]): {
	centroid: [number, number];
	bbox: [number, number, number, number];
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let sumX = 0;
	let sumY = 0;

	for (const p of points) {
		sumX += p.x;
		sumY += p.y;
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}

	return {
		centroid: [
			Math.round((sumX / points.length) * 10) / 10,
			Math.round((sumY / points.length) * 10) / 10
		],
		bbox: [Math.round(minX), Math.round(minY), Math.round(maxX), Math.round(maxY)]
	};
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
		const rle = polygonToRle(points, defaultSize);

		// Compute centroid and bounding box
		const { centroid, bbox } = getPolygonInfo(points);

		tracks.push({
			Frame: group.frame,
			ObjectID: String(group.cellId).padStart(8, '0'),
			SegmentationRLE: rle,
			LocalTrackRLE: [],
			Centroid: centroid,
			SegBbox: bbox,
			TrackBbox: [...bbox] as [number, number, number, number],
			PrevID: null,
			NextID: null,
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
export function download(data: BlobPart, filename: string, type: string = 'text/plain') {
	const url = URL.createObjectURL(new Blob([data], { type: type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.tabIndex = -1;
	document.body.appendChild(a);
	a.click();
	setTimeout(function () {
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	}, 0);
}

const data1 = [
	{
		Frame: 0,
		ObjectID: '00000001',
		SegmentationRLE: {
			size: [512, 512],
			counts: 'Q[]39e?4M2N2N2N1O2O0O10000O100000O101N1O101M3N2M4LTUW4'
		},
		LocalTrackRLE: [
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N101N1O2O0O2O000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N2O0N201O1N10000000O1O10001N100O1O3M2N1N2O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N1O2N101N101O000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'Pk\\3<b?3O1N2O0O2N1O2O0O2O000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'Pk\\3<b?3O1N2O0O2N1O2O1N10000000O1O10001N100N2O3N1M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N2O0O1O2O1N10000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2O0O2N1O2O1N10000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N101N1O2O0O2O000000O1O10001N100N202M2N1N2O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N2N1O101N2O00000000O100O101N100O1O2N3M1N2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N2N1O101N2O00000000O100O101N100O1O2N2N2M2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N2N1O101N2O1O000000O1O1O100O2O0O1O2N2N2M2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'V[\\31h?<J2N2O1N2N1O101N2O00000000O100O100O2O0O1O2N2N2M2O2MTUV4'
			},
			{
				size: [512, 512],
				counts: 'U[\\33f?<K1N2O0O2N1O2O0O2O1O000000O1O1O10001N1O1O2N2N2M2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'R[\\39c?6M2O1N101N1O2O0O2O1O000000O1O1O10001N1O1O2N2N2N1O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'R[\\39c?6M2O1N101N1O2O0O2O1O000000O1O1O10001N1O1O2N2N2M201LUUV4'
			}
		],
		Centroid: [228, 355],
		SegBbox: [344, 218, 368, 241],
		TrackBbox: [345, 216, 371, 243],
		PrevID: null,
		NextID: '00010001',
		TrackID: 1,
		Interpolated: false
	},
	{
		Frame: 0,
		ObjectID: '00000002',
		SegmentationRLE: {
			size: [512, 512],
			counts: 'iT^57f?6K3N2N2O1N101N100O101O0000O10001O0O101N2N2N2N3L\\[U2'
		},
		LocalTrackRLE: [
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N1000000O10001OO2O00000O2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M2N1O10001O000O1000O2O00000O2O1O1N1N3M2N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N1000000O10001OO2O00000O2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'id^57g?5M0N3N3M1O2N10000000000O2OO2O00000O2O1O1N1M4N1N2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4M0N3N3M1O2N1000000O10000001O00000O2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N100000000O101OO2O00000O2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4M0N3N3M1O2N10001O000O1000O2O00000O2O1O1N1N3M2N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N100000001N1000O2O00000O2O1O1N1N3M2N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N10000O2O000000O10001O0O2O1O0O2M3M2N2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N10001N10000000O10001O0O2O1O1N1N3M2N2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^54k?4L4L1O2N3M2N1O100O2O0000000000O10001N2O1O001L3O2M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?3M4L2N1O3M2N1O100O2O00000000O1000001N2O1O0O2M2N3M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?4L3M2N2N2M3N10000O2O0000000000O10001N102N001L3O2M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?4K4M2O1N2M3N10000O2O0000000000O10001N102N001L3O2M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?4K4M2N2N2N2N10001N100000000000O10001N101O1O1L3O2M2O\\[T2'
			}
		],
		Centroid: [360, 155],
		SegBbox: [143, 348, 169, 373],
		TrackBbox: [144, 348, 168, 375],
		PrevID: null,
		NextID: '00010005',
		TrackID: 2,
		Interpolated: false
	}
];

const data2: TrackType[] = [
	{
		Frame: 0,
		ObjectID: '00000002',
		SegmentationRLE: {
			size: [512, 512],
			counts: 'iT^57f?6K3N2N2O1N101N100O1ABCDEFGH0O101N2N2N2N3L\\[U2' // changed something to ABCDEFGH
		},
		LocalTrackRLE: [
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N1000000O10001OO2O00000O2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M2N1O10001O000O1000O2O00000O2O1O1N1N3M2N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N1000000OasdasdasdO2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'id^57g?5M0N3N3M1O2N10000000asdasdasdasdadO1O1N1M4N1N2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4M0N3N3M1sdaO10000001O00000O2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2ssssss1O2N100000000O101OO2O00000O2O1O1N1M4N1N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4Msads3M1O2N10001O000O1000O2O00000O2O1O1N1N3M2N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?a1O2N100000001N1000O2O00000O2O1O1N1N3M2N3N[[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N10000O2O000000O10001O0O2O1O0O2M3M2N2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'hd^58g?4L1O2N3M1O2N10001N10000000O10001O0O2O1O1N1N3M2N2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^54k?4L4L1O2N3M2N1O100O2O0000000000O10001N2O1O001L3O2M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?3M4L2N1O3M2N1O100O2O00000000O1000001N2O1O0O2M2N3M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?4L3M2N2N2M3N10000O2O0000000000O10001N102N001L3O2M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?4K4M2O1N2M3N10000O2O0000000000O10001N102N001L3O2M2O\\[T2'
			},
			{
				size: [512, 512],
				counts: 'iT^55j?4K4M2N2N2N2N10001N100000000000O10001N101O1O1L3O2M2O\\[T2'
			}
		],
		Centroid: [360, 200], // changed: 155 -> 200
		SegBbox: [1010, 1010, 1010, 1010], // changed everything to 1010
		TrackBbox: [144, 348, 168, 380], // changed: 375 -> 380
		PrevID: null,
		NextID: '00010005',
		TrackID: 2,
		Interpolated: true // changed: false -> true
	},
	{
		Frame: 0,
		ObjectID: '00000001',
		SegmentationRLE: {
			size: [512, 512],
			counts: 'Q[]39e?4M2N2N2N1O2O0O10000O100000O101N1O101M3N2M4LTUW4'
		},
		LocalTrackRLE: [
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N101N1O2O0O2O000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N2O0N201O1N10000000O1O10001N100O1O3M2N1N2O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N1O2N101N101O000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'Pk\\3<b?3O1N2O0O2N1O2O0O2O000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'Pk\\3<b?3O1N2O0O2N1O2O1N10000000O1O10001N100N2O3N1M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N2O0O1O2O1N10000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2O0O2N1O2O1N10000000O1O10001N100N202M2M2O1O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2O1N2N101N1O2O0O2O000000O1O10001N100N202M2N1N2O2KVUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N2N1O101N2O00000000O100O101N100O1O2N3M1N2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N2N1O101N2O00000000O100O101N100O1O2N2N2M2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'oj\\3=b?2N2O1N2N1O101N2O1O000000O1O1O100O2O0O1O2N2N2M2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'V[\\31h?<J2N2O1N2N1O101N2O00000000O100O100O2O0O1O2N2N2M2O2MTUV4'
			},
			{
				size: [512, 512],
				counts: 'U[\\33f?<K1N2O0O2N1O2O0O2O1O000000O1O1O10001N1O1O2N2N2M2O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'R[\\39c?6M2O1N101N1O2O0O2O1O000000O1O1O10001N1O1O2N2N2N1O2LUUV4'
			},
			{
				size: [512, 512],
				counts: 'R[\\39c?6M2O1N101N1O2O0O2O1O000000O1O1O10001N1O1O2N2N2M201LUUV4'
			}
		],
		Centroid: [228, 355],
		SegBbox: [344, 218, 368, 241],
		TrackBbox: [346, 216, 377, 243], // changed: 345 -> 346, 371 -> 377
		PrevID: null,
		NextID: '00010001',
		TrackID: 5, // changed: 1 -> 5
		Interpolated: false
	}
];

const jsondiffpatchInstance = jsondiffpatch.create({
	// used to match objects when diffing arrays, by default only === operator is used
	objectHash: function (obj) {
		// this function is used only to when objects are not equal by ref
		return (obj as TrackType).ObjectID ?? Math.pow(...(obj as RLEType).size);
	},
	arrays: {
		// default true, detect items moved inside the array (otherwise they will be registered as remove+add)
		detectMove: true,
		// default false, the value of items moved is not included in deltas
		includeValueOnMove: false
	},
	cloneDiffValues: structuredClone
});

const delta = jsondiffpatchInstance.diff(data1, data2);
console.debug('delta:', delta);

const patched = jsondiffpatchInstance.patch(data2, jsondiffpatchInstance.reverse(delta));
console.debug('patched:', patched);

// See if the data is the same
console.debug('Does patched equal to original:', deepEqual(data2, patched as object));

// saving the data:
//  pass the old VersionManaged and the new current data to the function
//  diff the old current and the new current data
///....
