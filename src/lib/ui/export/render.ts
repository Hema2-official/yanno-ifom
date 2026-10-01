import { annotationState } from '$lib/states/AnnotationState.svelte';
import { frameCache } from '$lib/states/FrameCache.svelte';
import { bakeFrame, channelLooks, type ChannelLook } from '$lib/states/FrameSnapshots.svelte';
import { projectState } from '$lib/states/ProjectState.svelte';
import { svgState, type CellLook, type LabelKey } from '$lib/states/svg.svelte';
import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
import {
	encodeImage,
	imageFormats,
	readRgb,
	TiffStack,
	zipFiles,
	type ImageFormat
} from '$lib/utils/export';
import type { Matrix } from '$lib/utils/layout';
import {
	drawCells,
	drawOutlines,
	drawStandIns,
	fillBackground,
	setTileTransform,
	type Background,
	type DisplayView,
	type OutlineLook,
	type StandIn
} from '$lib/utils/snapshots';

/** How an export draws the cells. */
export type AnnotationLook = CellLook & { opacity: number; labelKey: LabelKey | null };

export type FrameRender = {
	/** Output pixels per image pixel. */
	scale: number;
	background: Background;
	/** The channels' looks (`channelLooks`), null without the video. */
	looks: ChannelLook[] | null;
	/** Null without the annotation. */
	annotation: AnnotationLook | null;
};

/** Browsers refuse larger canvases, Safari first. */
export const MAX_CANVAS_SIDE = 16384;

/** The frames' size in an export at this scale. */
export function frameSize(scale: number): [w: number, h: number] {
	const { width, height } = svgState.svgViewBox;
	return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

/** The annotation as the display draws it now. */
export function shownAnnotationLook(): AnnotationLook {
	return {
		...svgState.cellLook,
		opacity: svgState.annotationOpacity.current,
		labelKey: svgState.labelSwitch.current ? svgState.labelKey.current : null
	};
}

function outlineLook({ labelKey, ...look }: AnnotationLook): OutlineLook {
	return {
		...look,
		selectedStroke: '',
		isSelected: () => false,
		label: (cell) => (labelKey === null ? null : String(cell[labelKey] ?? '')),
		fontFamily: getComputedStyle(document.body).fontFamily
	};
}

const read = (imageIndex: number) => frameCache.readUncached(imageIndex);

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
	const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
	const context = canvas.getContext('2d');
	if (!context) throw new Error("Couldn't draw the image");
	return [canvas, context];
}

/** A frame with its cells, without the selection. */
export async function renderFrame(
	frameIndex: number,
	{ scale, background, looks, annotation }: FrameRender
): Promise<HTMLCanvasElement> {
	const { width, height } = svgState.svgViewBox;
	const [w, h] = frameSize(scale);
	const [canvas, context] = newCanvas(w, h);
	fillBackground(context, background);

	if (looks) {
		const image = await bakeFrame(frameIndex, looks, [w, h], read);
		if (image) context.drawImage(image, 0, 0);
	}

	if (annotation && annotation.opacity > 0) {
		const layer = document.createElement('canvas');
		const cells = annotationState.getFrame(frameIndex) ?? [];
		drawOutlines(layer, { width, height, scale: w / width }, cells, outlineLook(annotation));
		context.globalAlpha = annotation.opacity;
		context.drawImage(layer, 0, 0);
	}
	return canvas;
}

/** The canvas size of a viewport export at this scale. */
export function viewportSize({ view }: DisplayView, scale: number): [w: number, h: number] {
	const ratio = devicePixelRatio * scale;
	return [
		Math.max(1, Math.round(view.width * ratio)),
		Math.max(1, Math.round(view.height * ratio))
	];
}

/** A frame's size where the tile shows it, native at most. */
function bakeSize([a, b, c, d]: Matrix, ratio: number): [w: number, h: number] {
	const scale = Math.min(1, ratio * Math.max(Math.hypot(a, b), Math.hypot(c, d)));
	return frameSize(scale);
}

/**
 * The display as it's shown, `scale` times the screen's pixels: the layout,
 * pan, zoom, fades and annotation, without the selection, hover or tools.
 */
export async function renderViewport(
	{ layout, placement, frames, view, annotationOpacity }: DisplayView,
	{ scale, background }: { scale: number; background: Background }
): Promise<HTMLCanvasElement> {
	const scaled = { ...view, ratio: devicePixelRatio * scale };
	const looks = channelLooks(videoDisplayState.channelFilters);

	const images: StandIn[] = [];
	for (const { offset, fade } of layout.tiles) {
		const matrix = placement.matrices[offset];
		const image = await bakeFrame(frames[offset], looks, bakeSize(matrix, scaled.ratio), read);
		if (image) images.push({ image, matrix, opacity: fade });
	}
	const vb = svgState.svgViewBox;
	const canvas = document.createElement('canvas');
	drawStandIns(canvas, images, vb, scaled, background);
	if (annotationOpacity <= 0) return canvas;

	// Each tile's cells fade as one and stay within the frame, like the tile's svg
	const context = canvas.getContext('2d');
	const [layer, layerContext] = newCanvas(canvas.width, canvas.height);
	if (!context) throw new Error("Couldn't draw the image");
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.globalAlpha = annotationOpacity;
	const look = outlineLook(shownAnnotationLook());
	for (const { offset } of layout.tiles) {
		layerContext.clearRect(0, 0, layer.width, layer.height);
		layerContext.save();
		setTileTransform(layerContext, placement.matrices[offset], scaled);
		layerContext.beginPath();
		layerContext.rect(0, 0, vb.width, vb.height);
		layerContext.clip();
		drawCells(layerContext, annotationState.getFrame(frames[offset]) ?? [], look);
		layerContext.restore();
		context.drawImage(layer, 0, 0);
	}
	return canvas;
}

/** What a frames export writes: image files, or one TIFF stack. */
export type FramesOutput = ImageFormat | 'tiff';

type Progress = { signal: AbortSignal; onProgress: (framesDone: number) => void };

/**
 * The frames rendered one by one into a TIFF stack, one image file, or a ZIP
 * of image files named by frame.
 */
export async function exportFrames(
	frames: number[],
	output: FramesOutput,
	quality: number,
	render: FrameRender,
	{ signal, onProgress }: Progress
): Promise<{ blob: Blob; extension: string }> {
	const draw = async (frameIndex: number) => {
		signal.throwIfAborted();
		const canvas = await renderFrame(frameIndex, render);
		signal.throwIfAborted();
		return canvas;
	};

	if (output === 'tiff') {
		const stack = new TiffStack(...frameSize(render.scale), frames.length);
		for (const [i, frameIndex] of frames.entries()) {
			stack.add(readRgb(await draw(frameIndex)));
			onProgress(i + 1);
		}
		return { blob: stack.finish(), extension: 'tif' };
	}

	const format: ImageFormat = output;
	const { extension } = imageFormats[format];
	if (frames.length === 1) {
		const blob = await encodeImage(await draw(frames[0]), format, quality);
		onProgress(1);
		return { blob, extension };
	}

	const digits = Math.max(4, String(projectState.frameCount - 1).length);
	async function* files() {
		for (const [i, frameIndex] of frames.entries()) {
			const input = await encodeImage(await draw(frameIndex), format, quality);
			onProgress(i + 1);
			const name = `frame_${String(frameIndex).padStart(digits, '0')}.${extension}`;
			yield { name, input, lastModified: new Date() };
		}
	}
	return { blob: await zipFiles(files()), extension: 'zip' };
}
