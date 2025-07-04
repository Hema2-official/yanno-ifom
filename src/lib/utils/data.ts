import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type {
	NewDataType,
	NewFrameType,
	NewChangeType,
	CellBodyType,
	TrackType,
	RLEType
} from '$lib/types/annotation.type';
import * as jsondiffpatch from 'jsondiffpatch';

/**
 * Creates a deep copy of the given object.
 *
 * @param obj - The object to be copied.
 * @returns A deep copy of the object.
 */
export function deepCopy<T>(obj: T): T {
	if (structuredClone) return structuredClone(obj);
	console.warn(
		'The structuredClone method is not supported in this browser. Falling back to JSON goofery.'
	);
	return JSON.parse(JSON.stringify(obj));
}

export function cellBodiesEqual<T extends CellBodyType | CellBodyType[]>(a: T, b: T): boolean {
	// Check if both are arrays
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!cellBodiesEqual(a[i], b[i])) return false;
		}
		return true;
	}

	// Both are not arrays, so they must be CellBodyType objects
	if (Array.isArray(a) || Array.isArray(b))
		throw new Error('Cannot compare array with non-array.');

	// Warning: This assumes that the lengths of x and y are the same
	if (a.x.length !== a.y.length || b.x.length !== b.y.length)
		console.warn('x and y lengths differ in cell body comparison:', a, b);

	if (a.x.length !== b.x.length || a.y.length !== b.y.length) return false;
	for (let i = 0; i < a.x.length; i++) {
		if (a.x[i] !== b.x[i] || a.y[i] !== b.y[i]) return false;
	}
	return true;
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
 * Converts a text input into a DataType object.
 *
 * @param input - The input text to be converted.
 * @returns A Promise resolving to a DataType object.
 */
export async function textToDataType(input: string): Promise<NewDataType> {
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

	// Parse each line
	const data: NewDataType = { pos: null, originalFrames: [], changes: [] };
	let lineStartIndex = firstLine.length + 1;
	for (
		let newlineIndex = input.indexOf('\n', lineStartIndex);
		newlineIndex != -1;
		newlineIndex = input.indexOf('\n', lineStartIndex)
	) {
		// Get line
		const substr = input.substring(lineStartIndex, newlineIndex);
		lineStartIndex = newlineIndex + 1;
		const line = substr.split('\t');

		// Check for POS consistency
		if (data.pos === null) data.pos = parseInt(line[labels['pos']]);
		else if (data.pos != parseInt(line[labels['pos']])) {
			console.warn('POS value changes over time. Look into this one.');
			data.pos = parseInt(line[labels['pos']]);
		}

		// Check if frame exists
		const frameId = parseInt(line[labels['f']]);
		let frameIndex = data.originalFrames.findIndex((frame) => frame.id === frameId);
		if (frameIndex == -1) frameIndex = data.originalFrames.push({ id: frameId, cells: [] }) - 1;

		// Check if cell exists
		const cellID = parseInt(line[labels['cellnum']]);
		let cellIndex = data.originalFrames[frameIndex].cells.findIndex(
			(cell) => cell.id === cellID
		);

		// If doesn't exist yet, create a cell with a single empty body
		if (cellIndex == -1)
			cellIndex =
				data.originalFrames[frameIndex].cells.push({
					id: cellID,
					bodies: [{ x: [], y: [] }]
				}) - 1;

		// Add coordinates
		data.originalFrames[frameIndex].cells[cellIndex].bodies[0].x.push(
			parseFloat(line[labels['x']])
		);
		data.originalFrames[frameIndex].cells[cellIndex].bodies[0].y.push(
			parseFloat(line[labels['y']])
		);
	}
	return data;
}

/**
 * Converts a text input into a TrackType list.
 *
 * @param input - The input text to be converted.
 * @returns A Promise resolving to a TrackType list.
 */
export async function textToTracks(input: string): Promise<TrackType[]> {
	// Check if expected labels are present, and find their indices
	const firstLine = input.substring(0, input.indexOf('\n')).trim();
	const expectedLabels = ['pos', 'f', 'cellnum', 'x', 'y'];
	const labels: { [key: string]: number } = {};
	firstLine.split('\t').forEach((item, index) => (labels[item.toLowerCase()] = index));

	if (expectedLabels.some((item) => !Object.keys(labels).includes(item)))
		throw new Error(get(_)('unexpected_file_format') + expectedLabels.join('\t'));

	let previousPos: number | null = null;
	const tracks: TrackType[] = [];

	let lineStartIndex = firstLine.length + 1;
	for (
		let newlineIndex = input.indexOf('\n', lineStartIndex);
		newlineIndex != -1;
		newlineIndex = input.indexOf('\n', lineStartIndex)
	) {
		// Get line
		const substr = input.substring(lineStartIndex, newlineIndex);
		lineStartIndex = newlineIndex + 1;
		const line = substr.split('\t');

		// Check for POS consistency
		const currentPos = parseInt(line[labels['pos']]);
		if (previousPos === null) previousPos = currentPos;
		if (previousPos !== currentPos) {
			// TODO make a notice to the user
			console.warn('POS value changes over time. Look into this one.');
			previousPos = currentPos;
		}

		// Check if frame exists
		const frameId = parseInt(line[labels['f']]);
		let frameIndex = data.originalFrames.findIndex((frame) => frame.id === frameId);
		if (frameIndex == -1) frameIndex = data.originalFrames.push({ id: frameId, cells: [] }) - 1;

		// Check if cell exists
		const cellID = parseInt(line[labels['cellnum']]);
		let cellIndex = data.originalFrames[frameIndex].cells.findIndex(
			(cell) => cell.id === cellID
		);

		// If doesn't exist yet, create a cell with a single empty body
		if (cellIndex == -1)
			cellIndex =
				data.originalFrames[frameIndex].cells.push({
					id: cellID,
					bodies: [{ x: [], y: [] }]
				}) - 1;

		// Add coordinates
		data.originalFrames[frameIndex].cells[cellIndex].bodies[0].x.push(
			parseFloat(line[labels['x']])
		);
		data.originalFrames[frameIndex].cells[cellIndex].bodies[0].y.push(
			parseFloat(line[labels['y']])
		);
	}
}

/**
 * Converts the given data to a formatted text representation.
 *
 * @param data - The data to convert.
 * @param changeIndex - The index of the change to consider. Defaults to -1 meaning the original data.
 * @returns The formatted text representation of the data, or null in case of invalid parameters.
 */
export function dataTypeToText(data: NewDataType, changeIndex: number = -1): string {
	// Check if changeIndex is valid
	if (changeIndex < -1 || changeIndex >= data.changes.length)
		throw new Error('Invalid change index.');

	// Get frames
	const frames = getFramesAtChangeIndex(data, changeIndex);

	// Sort frames and cells
	frames.sort((a, b) => a.id - b.id);
	frames.forEach((frame) => frame.cells.sort((a, b) => a.id - b.id));

	// Generate text
	let text = 'POS\tF\tCELLNUM\tX\tY\n';
	frames.forEach((frame) => {
		frame.cells.forEach((cell) => {
			if (cell.bodies.length > 1) {
				alert(get(_)('multiple_bodies'));
				throw new Error('Multiple bodies in a single cell.');
			}

			if (cell.bodies.length === 0) {
				console.warn('Cell marked for deletion? Cell:', cell.id);
				return; // continue
			}

			cell.bodies[0].x.forEach((x, index) => {
				// limit x and y values to 1 decimal place
				const limX = Math.round(x * 10) / 10;
				const limY = Math.round(cell.bodies[0].y[index] * 10) / 10;

				// Append line
				text += `${data.pos}\t${frame.id}\t${cell.id}\t${limX}\t${limY}\n`;
			});
		});
	});

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

/**
 * Retrieves the frames at the specified change index from the given data.
 * If the change index is invalid, returns null.
 *
 * @param data - The data containing original frames and changes.
 * @param changeIndex - Either -1 (original frames) or valid index of the data.changes array.
 * @returns An array of frames at the specified change index, separated in memory with deepCopy.
 * @throws An error if the change index is invalid.
 */
export function getFramesAtChangeIndex(data: NewDataType, changeIndex: number): NewFrameType[] {
	// Check if changeIndex is valid
	if (changeIndex < -1 || changeIndex >= data.changes.length)
		throw new Error('Invalid change index.');

	// Return original frames when changeIndex is -1
	if (changeIndex === -1) return deepCopy(data.originalFrames);

	// Copy original frames
	const newFrames = deepCopy(data.originalFrames);

	// Apply changes
	for (let i = 0; i <= changeIndex; i++) {
		const change = deepCopy(data.changes[i]);
		change.frames.forEach((frame) => {
			const frameIndex = newFrames.findIndex((f) => f.id == frame.id);
			if (frameIndex == -1) {
				alert(get(_)('nonexistent_frame'));
				newFrames.push(frame);
			} else {
				frame.cells.forEach((cell) => {
					const cellIndex = newFrames[frameIndex].cells.findIndex((c) => c.id == cell.id);
					const cellFound = cellIndex !== -1;
					const markedForDeletion = cell.bodies.length === 0;

					// If cell is not found and isn't marked for deletion, add it
					if (!cellFound && !markedForDeletion) newFrames[frameIndex].cells.push(cell);
					// If cell is found and is marked for deletion, delete it
					else if (cellFound && markedForDeletion)
						newFrames[frameIndex].cells.splice(cellIndex, 1);
					// If cell is found and isn't marked for deletion, update it
					else if (cellFound && !markedForDeletion) {
						// !!! bodies are already deep copied in the change object !!!
						newFrames[frameIndex].cells[cellIndex].bodies = cell.bodies;
					}
				});
			}
		});
	}

	// Sort frames and cells
	newFrames.sort((a, b) => a.id - b.id);
	newFrames.forEach((frame) => frame.cells.sort((a, b) => a.id - b.id));

	return newFrames;
}

/**
 * Returns a ChangeType object, which, when applied to oldFrames, will result in newFrames.
 *
 * @param oldFrames - The array of old frames.
 * @param newFrames - The array of new frames.
 * @param changeTime - The timestamp of the change (default: current timestamp).
 * @returns The object representing the changes between the old and new frames.
 */
export function getFramesDifference(
	oldFrames: NewFrameType[],
	newFrames: NewFrameType[],
	changeTime: number = Date.now()
): NewChangeType {
	// Create empty change
	const change: NewChangeType = { time: changeTime, frames: [] };
	const newFramesCopy = deepCopy(newFrames);

	// Find differences between each frame
	newFramesCopy.forEach((newFrame) => {
		const oldFrameIndex = oldFrames.findIndex((f) => f.id == newFrame.id);
		if (oldFrameIndex == -1) {
			alert(get(_)('nonexistent_frame'));
			change.frames.push(newFrame);
		} else {
			// Look for cells that were added or modified
			const changedCells = newFrame.cells.filter((newCell) => {
				const oldCellIndex = oldFrames[oldFrameIndex].cells.findIndex(
					(c) => c.id == newCell.id
				);

				// Cell was added in newFrame
				if (oldCellIndex === -1) return true;

				// Check if bodies are different
				const oldCell = oldFrames[oldFrameIndex].cells[oldCellIndex];
				return !cellBodiesEqual(oldCell.bodies, newCell.bodies);
			});

			// Look for cells that were deleted
			oldFrames[oldFrameIndex].cells.forEach((oldCell) => {
				const newCellExists = newFrame.cells.some((newCell) => newCell.id == oldCell.id);
				if (!newCellExists) changedCells.push({ id: oldCell.id, bodies: [] });
			});

			// If anything changed, add frame
			if (changedCells.length > 0)
				change.frames.push({ id: newFrame.id, cells: changedCells });
		}
	});

	// Sort frames and cells
	change.frames.sort((a, b) => a.id - b.id);
	change.frames.forEach((frame) => frame.cells.sort((a, b) => a.id - b.id));

	return change;
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
