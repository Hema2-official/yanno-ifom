import { get } from 'svelte/store' 
import { _ } from "svelte-i18n";
import type { DataType, FrameType, ChangeType } from "$lib/types";

/**
 * Creates a deep copy of the given object.
 * 
 * @param obj - The object to be copied.
 * @returns A deep copy of the object.
 */
export function deepCopy<T>(obj: T): T {
    if (structuredClone) return structuredClone(obj);
    console.warn("The structuredClone method is not supported in this browser. Falling back to JSON goofery.");
    return JSON.parse(JSON.stringify(obj));
}


/**
 * Converts a text input into a DataType object.
 * 
 * @param input - The input text to be converted.
 * @param progressUpdateCallback - An optional callback function to track the progress of the conversion.
 * @returns A Promise that resolves to a DataType object.
 */
export function textToDataType(input: string) {
    return new Promise<DataType>((resolve, reject) => {
        // Check if expected labels are present, and find their indices
        let firstLine = input.substring(0, input.indexOf('\n'));
        const expectedLabels = ["pos", "f", "cellnum", "x", "y"];
        const labels = {};
        firstLine.trim().split('\t').forEach((item, index) => { labels[item.toLowerCase()] = index; });
        if (!expectedLabels.every(item => (Object.keys(labels).includes(item)))) {
            reject(get(_)("unexpected_file_format") + expectedLabels.join('\t'));
        }

        // Parse each line
        let data: DataType = { pos: null, originalFrames: [], changes: [] };
        let lineStartIndex = firstLine.length + 1;
        for (let newlineIndex = input.indexOf('\n', lineStartIndex); newlineIndex != -1; newlineIndex = input.indexOf('\n', lineStartIndex)) {
            // Get line
            const substr = input.substring(lineStartIndex, newlineIndex);
            lineStartIndex = newlineIndex + 1;
            const line = substr.split('\t');

            // Check for POS consistency
            if (data.pos === null) data.pos = parseInt(line[labels["pos"]]);
            else if (data.pos != parseInt(line[labels["pos"]])) {
                console.warn("POS value changes over time. Look into this one.");
                data.pos = parseInt(line[labels["pos"]]);
            }

            // Check if frame exists
            const frameId = parseInt(line[labels["f"]]);
            let frameIndex = data.originalFrames.findIndex(frame => frame.id === frameId);
            if (frameIndex == -1) frameIndex = data.originalFrames.push({ id: frameId, cells: [] }) - 1;

            // Check if cell exists
            const cellID = parseInt(line[labels["cellnum"]]);
            let cellIndex = data.originalFrames[frameIndex].cells.findIndex(cell => cell.id === cellID);
            if (cellIndex == -1) cellIndex = data.originalFrames[frameIndex].cells.push({ id: cellID, x: [], y: [] }) - 1;

            // Add coordinates
            data.originalFrames[frameIndex].cells[cellIndex].x.push(parseFloat(line[labels["x"]]));
            data.originalFrames[frameIndex].cells[cellIndex].y.push(parseFloat(line[labels["y"]]));
        }
        resolve(data);
    });
}

/**
 * Converts the given data to a formatted text representation.
 * 
 * @param data - The data to convert.
 * @param changeIndex - The index of the change to consider. Defaults to -1 meaning the original data.
 * @returns The formatted text representation of the data, or null in case of invalid parameters.
 */
export function dataTypeToText(data: DataType, changeIndex: number = -1): string | null {
    // Check if changeIndex is valid
    if (changeIndex < -1 || changeIndex >= data.changes.length) return null;

    // Get frames
    const frames = deepCopy( changeIndex == -1 ? data.originalFrames : getFramesAtChangeIndex(data, changeIndex) );

    // Sort frames and cells
    frames.sort((a, b) => a.id - b.id);
    frames.forEach(frame => frame.cells.sort((a, b) => a.id - b.id));

    // Generate text
    let text = "POS\tF\tCELLNUM\tX\tY\n";
    frames.forEach(frame => {
        frame.cells.forEach(cell => {
            cell.x.forEach((x, index) => {
                // limit x and y values to 1 decimal place
                const limX = Math.round(x * 10) / 10;
                const limY = Math.round(cell.y[index] * 10) / 10;
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
export function download(data: BlobPart, filename: string, type: string = "text/plain") {
    var file = new Blob([data], {type: type});
    // IE10+
    if ((window.navigator as any).msSaveOrOpenBlob)
        (window.navigator as any).msSaveOrOpenBlob(file, filename);
    // Others
    else {
        var a = document.createElement("a"),
            url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        a.tabIndex = -1;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0);
    }
}

/**
 * Retrieves the frames at the specified change index from the given data.
 * If the change index is invalid, returns null.
 * 
 * @param data - The data containing original frames and changes.
 * @param changeIndex - The index of the change to retrieve frames from.
 * @returns An array of frames at the specified change index, or null if the change index is invalid.
 */
export function getFramesAtChangeIndex(data: DataType, changeIndex: number): FrameType[] | null {
    // Check if changeIndex is valid
    if (changeIndex === -1) return data.originalFrames;
    if (changeIndex < 0 || changeIndex >= data.changes.length) return null;

    // Copy original frames
    let newFrames = deepCopy(data.originalFrames);

    // Apply changes
    for (let i = 0; i <= changeIndex; i++) {
        const change = deepCopy(data.changes[i]);
        change.frames.forEach(frame => {
            let frameIndex = newFrames.findIndex(f => f.id === frame.id);
            if (frameIndex == -1) {
                alert(get(_)("nonexistent_frame"));
                newFrames.push(frame);
            } else {
                frame.cells.forEach(cell => {
                    const cellIndex = newFrames[frameIndex].cells.findIndex(c => c.id === cell.id);
                    const markedForDeletion = (cell.x === null || cell.y === null);

                    // If cell is not found and isn't marked for deletion, add it
                    if (cellIndex === -1 && !markedForDeletion) newFrames[frameIndex].cells.push(cell);

                    // If cell is found and is marked for deletion, delete it
                    else if (cellIndex !== -1 && markedForDeletion) newFrames[frameIndex].cells.splice(cellIndex, 1);
                    
                    // If cell is found and isn't marked for deletion, update it
                    else if (cellIndex !== -1 && !markedForDeletion) {
                        newFrames[frameIndex].cells[cellIndex].x = cell.x;
                        newFrames[frameIndex].cells[cellIndex].y = cell.y;
                    }
                });
            }
        });
    }

    // Sort frames and cells
    newFrames.sort((a, b) => a.id - b.id);
    newFrames.forEach(frame => frame.cells.sort((a, b) => a.id - b.id));

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
export function getFramesDifference(oldFrames: FrameType[], newFrames: FrameType[], changeTime: number = Date.now()): ChangeType {
    // Create empty change
    const change: ChangeType = { time: changeTime, frames: [] };
    const newFramesCopy = deepCopy(newFrames);

    // Find differences between each frame
    newFramesCopy.forEach(newFrame => {
        let oldFrameIndex = oldFrames.findIndex(f => f.id === newFrame.id);
        if (oldFrameIndex == -1) {
            alert(get(_)("nonexistent_frame"));
            change.frames.push(newFrame);
        } else {
            // Look for cells that were added or modified
            let changedCells = newFrame.cells.filter(newCell => {
                let oldCellIndex = oldFrames[oldFrameIndex].cells.findIndex(c => c.id === newCell.id);
                if (oldCellIndex == -1) return true;
                else if (oldFrames[oldFrameIndex].cells[oldCellIndex].x.join(',') != newCell.x.join(',') || oldFrames[oldFrameIndex].cells[oldCellIndex].y.join(',') != newCell.y.join(',')) return true;
                else return false;
            });

            // Look for cells that were deleted
            oldFrames[oldFrameIndex].cells.forEach(oldCell => {
                let newCellIndex = newFrame.cells.findIndex(c => c.id === oldCell.id);
                if (newCellIndex == -1) changedCells.push({ id: oldCell.id, x: null, y: null });
            });

            // If anything changed, add frame
            if (changedCells.length > 0) change.frames.push({ id: newFrame.id, cells: changedCells });
        }
    });

    // Sort frames and cells
    change.frames.sort((a, b) => a.id - b.id);
    change.frames.forEach(frame => frame.cells.sort((a, b) => a.id - b.id));

    return change;
}
