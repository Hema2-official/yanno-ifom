import type { CellLook } from '$lib/states/svg.svelte';
import type { TrackType } from '$lib/types/annotation.type';
import { cellBodyToPathCached } from './display';
import { getCenterOfPolygonsCached } from './geometry';
import { transferTables, type RGBFunctions } from './imaging';
import type { Matrix } from './layout';
import { rleToPolygons } from './rle';

export const MAX_SNAPSHOT_SIZE = 2048; // px

/** The size in pixels of the snapshot of a `width` × `height` frame. */
export function snapshotSize(width: number, height: number): [width: number, height: number] {
	const scale = Math.min(1, MAX_SNAPSHOT_SIZE / Math.max(width, height));
	return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export type ImageLayer = { image: CanvasImageSource; opacity: number; transfer: RGBFunctions[] };

export function bakeImage(
	layers: ImageLayer[],
	width: number,
	height: number
): HTMLCanvasElement | null {
	const [w, h] = snapshotSize(width, height);
	const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
	const layer = Object.assign(document.createElement('canvas'), { width: w, height: h });
	const context = canvas.getContext('2d');
	const layerContext = layer.getContext('2d', { willReadFrequently: true });
	if (!context || !layerContext) return null;

	for (const { image, opacity, transfer } of layers) {
		layerContext.clearRect(0, 0, w, h);
		layerContext.drawImage(image, 0, 0, w, h);
		if (transfer.length > 0) {
			const pixels = layerContext.getImageData(0, 0, w, h);
			const [red, green, blue] = transferTables(transfer);
			const data = pixels.data;
			for (let p = 0; p < data.length; p += 4) {
				data[p] = red[data[p]];
				data[p + 1] = green[data[p + 1]];
				data[p + 2] = blue[data[p + 2]];
			}
			layerContext.putImageData(pixels, 0, 0);
		}
		context.globalAlpha = opacity;
		context.drawImage(layer, 0, 0);
	}
	return canvas;
}

/** How the display draws a frame's cells (see `Cell`), to draw them alike on a canvas. */
export type OutlineLook = CellLook & {
	selectedStroke: string;
	isSelected: (cell: TrackType) => boolean;
	/** The cell's label, or null for none. */
	label: (cell: TrackType) => string | null;
	fontFamily: string;
};

/** Draws the cells of a `width` × `height` frame on the canvas, `scale` canvas pixels per image pixel. */
export function drawOutlines(
	canvas: HTMLCanvasElement,
	{ width, height, scale }: { width: number; height: number; scale: number },
	cells: TrackType[],
	look: OutlineLook
) {
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const context = canvas.getContext('2d');
	if (!context) return;

	context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
	// Svg's defaults
	context.lineJoin = 'miter';
	context.miterLimit = 4;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.font = `bold ${look.labelSize}px ${look.fontFamily}`;

	for (const cell of cells) {
		const polygons = rleToPolygons(cell.SegmentationRLE);
		const selected = look.isSelected(cell);
		const stroke = selected ? look.selectedStroke : look.stroke;
		for (const body of polygons) {
			const path = new Path2D(cellBodyToPathCached(body));
			if (look.fill) {
				context.fillStyle = look.fill;
				context.fill(path);
			}
			if (stroke) {
				context.strokeStyle = stroke;
				context.lineWidth = selected ? look.width + 1 : look.width;
				context.stroke(path);
			}
		}

		const label = look.label(cell);
		if (label !== null) {
			const { x, y } = getCenterOfPolygonsCached(polygons);
			context.lineWidth = 0.6;
			context.strokeStyle = '#ffffff';
			context.strokeText(label, x, y);
			context.fillStyle = 'black';
			context.fillText(label, x, y);
		}
	}
}

/** A snapshot where a tile shows its frame: `matrix` maps the frame's box into the stage. */
export type StandIn = { image: CanvasImageSource; matrix: Matrix; opacity: number };

/** The area a canvas covers, in CSS pixels, `ratio` canvas pixels each, with the stage's origin at `x`, `y`. */
export type StandInView = { width: number; height: number; ratio: number; x: number; y: number };

/** Draws the stand-ins in order, each over its tile's place, on a canvas covering the view. */
export function drawStandIns(
	canvas: HTMLCanvasElement,
	standIns: StandIn[],
	frame: { width: number; height: number },
	view: StandInView
) {
	const w = Math.max(1, Math.round(view.width * view.ratio));
	const h = Math.max(1, Math.round(view.height * view.ratio));
	if (canvas.width !== w) canvas.width = w;
	if (canvas.height !== h) canvas.height = h;
	const context = canvas.getContext('2d');
	if (!context) return;

	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, w, h);
	const [sx, sy] = [w / view.width, h / view.height];
	for (const { image, matrix, opacity } of standIns) {
		if (opacity <= 0) continue;
		const [a, b, c, d, e, f] = matrix;
		context.globalAlpha = opacity;
		context.setTransform(sx * a, sy * b, sx * c, sy * d, sx * (view.x + e), sy * (view.y + f));
		context.drawImage(image, 0, 0, frame.width, frame.height);
	}
}
