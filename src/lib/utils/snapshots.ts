import type { CellLook } from '$lib/states/svg.svelte';
import type { TrackType } from '$lib/types/annotation.type';
import { arrowPath, cellBodyToPathCached } from './display';
import { getCenterOfPolygonsCached } from './geometry';
import { transferTables, type RGBFunctions } from './imaging';
import type { FrameLayout, Matrix, Placement } from './layout';
import { rleToPolygons } from './rle';
import { ancestryArrows } from './tracks';

export const MAX_SNAPSHOT_SIZE = 2048; // px

/** The size in pixels of the snapshot of a `width` × `height` frame. */
export function snapshotSize(width: number, height: number): [width: number, height: number] {
	const scale = Math.min(1, MAX_SNAPSHOT_SIZE / Math.max(width, height));
	return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export type ImageLayer = { image: CanvasImageSource; opacity: number; transfer: RGBFunctions[] };

/** The layers through their filters, stacked on a canvas of `w` × `h`. */
export function bakeImage(layers: ImageLayer[], w: number, h: number): HTMLCanvasElement | null {
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

/** How the display draws a frame's cells (see `Cell` and `FrameAnnotation`), to draw them alike on a canvas. */
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
	drawCells(context, cells, look);
}

/** Draws the cells through the context's transform, in image pixels. */
export function drawCells(
	context: CanvasRenderingContext2D,
	cells: TrackType[],
	look: OutlineLook
) {
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

	if (look.arrows) {
		const { color, width, only } = look.arrows;
		context.fillStyle = color;
		context.strokeStyle = color;
		context.lineWidth = width;
		for (const { from, to } of ancestryArrows(cells, look.labelSize, only)) {
			const path = new Path2D(arrowPath(from, to, width));
			context.fill(path);
			context.stroke(path);
		}
	}
}

/** A snapshot where a tile shows its frame: `matrix` maps the frame's box into the stage. */
export type StandIn = { image: CanvasImageSource; matrix: Matrix; opacity: number };

/** The area a canvas covers, in CSS pixels, `ratio` canvas pixels each, with the stage's origin at `x`, `y`. */
export type StandInView = { width: number; height: number; ratio: number; x: number; y: number };

/** What the display shows, for export rendering. */
export type DisplayView = {
	layout: FrameLayout;
	placement: Placement;
	/** The shown frames, by their offset in the window. */
	frames: number[];
	view: StandInView;
	annotationOpacity: number;
};

/** A color under all that's drawn, `alpha` from 0 to 1. */
export type Background = { color: string; alpha: number };

/** Draws the stand-ins in order, each over its tile's place, on a canvas covering the view. */
export function drawStandIns(
	canvas: HTMLCanvasElement,
	standIns: StandIn[],
	frame: { width: number; height: number },
	view: StandInView,
	background?: Background
) {
	const w = Math.max(1, Math.round(view.width * view.ratio));
	const h = Math.max(1, Math.round(view.height * view.ratio));
	if (canvas.width !== w) canvas.width = w;
	if (canvas.height !== h) canvas.height = h;
	const context = canvas.getContext('2d');
	if (!context) return;

	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, w, h);
	if (background) fillBackground(context, background);
	for (const { image, matrix, opacity } of standIns) {
		if (opacity <= 0) continue;
		context.globalAlpha = opacity;
		setTileTransform(context, matrix, view);
		context.drawImage(image, 0, 0, frame.width, frame.height);
	}
}

/** Draws in a tile's frame, in image pixels, on a canvas covering the view. */
export function setTileTransform(
	context: CanvasRenderingContext2D,
	[a, b, c, d, e, f]: Matrix,
	view: StandInView
) {
	const sx = context.canvas.width / view.width;
	const sy = context.canvas.height / view.height;
	context.setTransform(sx * a, sy * b, sx * c, sy * d, sx * (view.x + e), sy * (view.y + f));
}

export function fillBackground(context: CanvasRenderingContext2D, { color, alpha }: Background) {
	context.save();
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.globalAlpha = alpha;
	context.fillStyle = color;
	context.fillRect(0, 0, context.canvas.width, context.canvas.height);
	context.restore();
}
