import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type {
	NewDataType,
	NewFrameType,
	NewChangeType,
	CellBodyType
} from '$lib/types/annotation.type';

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

// /**
//  * Compares two objects and returns true if they are deeply equal.
//  *
//  * @param obj1 - The first object to compare.
//  * @param obj2 - The second object to compare.
//  * @returns True if the objects are deeply equal, false otherwise.
//  */
// function deepEqual(obj1: object, obj2: object): boolean {
// 	if (obj1 === obj2)
// 		// it's just the same object. No need to compare.
// 		return true;

// 	if (isPrimitive(obj1) && isPrimitive(obj2))
// 		// compare primitives
// 		return obj1 === obj2;

// 	if (Object.keys(obj1).length !== Object.keys(obj2).length) return false;

// 	// compare objects with same number of keys
// 	for (const key in obj1) {
// 		if (!(key in obj2)) return false; //other object doesn't have this prop
// 		// @ts-expect-error - obj1[key] and obj2[key] CAN be indexed with key frfr
// 		if (!deepEqual(obj1[key], obj2[key])) return false;
// 	}

// 	return true;
// }

// //check if value is primitive
// function isPrimitive(obj: unknown): boolean {
// 	return obj !== Object(obj);
// }

/**
 * Converts a text input into a DataType object.
 *
 * @param input - The input text to be converted.
 * @param progressUpdateCallback - An optional callback function to track the progress of the conversion.
 * @returns A Promise that resolves to a DataType object.
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
