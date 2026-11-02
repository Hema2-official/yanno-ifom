/**
 * Runs one step of symmetry-tracker-web on a local project's video and cells, and answers with
 * the step's cells and the change that records it, as the backend's runners did. One worker per
 * run: terminating it is the cancel, and frees the GPU.
 */
import * as ort from 'onnxruntime-web/webgpu';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortGlue from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { inheritRecords } from '$lib/tracker/inherit/euclidean';
import { ChannelFrames, scanChannel, selectChannel } from '$lib/tracker/io/frames';
import { TiffVideo } from '$lib/tracker/io/video';
import type { TrackType as TrackerRecord } from '$lib/tracker/output/records';
import { BackendOrder } from '$lib/tracker/output/sinks';
import { Segmenter } from '$lib/tracker/segment/segmenter';
import {
	FRAME_SIZE,
	TemporalSegmenter,
	type FirstPassFrame
} from '$lib/tracker/temporal/segmenter';
import { CropTrackingKernel } from '$lib/tracker/track/crop';
import { TrackingKernel, type LocalTrackKernel } from '$lib/tracker/track/kernel';
import { trackRecordsAsync, type TrackingStepParams } from '$lib/tracker/track/pipeline';
import {
	VideoColor,
	type InheritanceParams,
	type SegmentationParams,
	type TrackingParams
} from '$lib/types/api.type';
import type { TrackType } from '$lib/types/annotation.type';
import { makeBulkChange } from '$lib/utils/delta';
import {
	CpuCropTrackingKernel,
	CpuSegmenter,
	CpuTemporalSegmenter,
	CpuTrackingKernel
} from './cpu';
import { loadManifest, loadModel, trackingModels, type ModelManifest } from './models';
import type { ComputeRequest, ComputeResult } from './run';

export type WorkerRequest = ComputeRequest & {
	/** The URL of the models' folder. */
	models: string;
};

export type WorkerMessage =
	| { type: 'progress'; message: string; fraction?: number }
	| { type: 'done'; result: ComputeResult }
	| { type: 'error'; message: string };

type Progress = (message: string, fraction?: number) => void;

/** As the backend's segmentation drops them */
const MIN_OBJECT_SIZE = 20;

/** The post-processing the temporal model was tuned with */
const TEMPORAL_PARAMS = { minSeed: 8, minArea: 20 };

/** The local tracks' kernel of either device; the CPU's report each object. */
type ComputeKernel = LocalTrackKernel & {
	onObject?: () => void;
	release(): Promise<void>;
};

const post = (message: WorkerMessage) => postMessage(message);

/** The cells as the tracker reads them: the seven fields in the backend's order, with explicit nulls. */
const asRecord = (cell: TrackType): TrackerRecord => ({
	Frame: cell.Frame,
	ObjectID: cell.ObjectID,
	SegmentationRLE: cell.SegmentationRLE,
	TrackID: cell.TrackID,
	Interpolated: cell.Interpolated,
	Class: (cell.Class as string | null | undefined) ?? null,
	AncestorID: cell.AncestorID ?? null
});

/** A video's frames as a model reads them, a pixel's colors together. */
interface ModelFrames {
	readonly count: number;
	readonly width: number;
	readonly height: number;
	readonly colors: 1 | 3;
	frame(index: number, out: Uint8Array): Promise<Uint8Array>;
}

// libpng's weights for the 0.299 and 0.587 OpenCV asks for, in 1/32768
const RED = 9797;
const GREEN = 19234;
const BLUE = 32768 - RED - GREEN;

/** An RGB frame in gray, as cv2.IMREAD_GRAYSCALE reads the backend's color PNGs. */
function rgbToGray(rgb: Uint8Array, out: Uint8Array): Uint8Array {
	for (let i = 0, j = 0; i < out.length; i++, j += 3) {
		out[i] = (RED * rgb[j] + GREEN * rgb[j + 1] + BLUE * rgb[j + 2]) >> 15;
	}
	return out;
}

/** The primary channel's frames: an RGB video's in color if `color`, else in gray. */
async function openFrames(
	{ video, videoConfig }: WorkerRequest,
	progress: Progress,
	color: boolean
): Promise<ModelFrames> {
	progress('Reading the video...');
	const tiff = await TiffVideo.open(video);
	const pages = selectChannel(
		tiff.pageCount,
		videoConfig.channel_period,
		videoConfig.start_period
	);
	const frames = new ChannelFrames(tiff, await scanChannel(tiff, pages));
	const { count, width, height, samplesPerPixel } = frames;
	if (samplesPerPixel === 1 || color) {
		return {
			count,
			width,
			height,
			colors: samplesPerPixel,
			frame: (k, out) => frames.frame(k, out)
		};
	}
	const rgb = new Uint8Array(width * height * 3);
	return {
		count,
		width,
		height,
		colors: 1,
		frame: async (k, out) => rgbToGray(await frames.frame(k, rgb), out)
	};
}

/** The models, downloaded on the first run. */
async function loadModels(
	request: WorkerRequest,
	manifest: ModelManifest,
	names: string[],
	progress: Progress
): Promise<Uint8Array[]> {
	const total = names.reduce((sum, name) => sum + (manifest.models[name]?.bytes ?? 0), 0);
	const models: Uint8Array[] = [];
	let done = 0;
	for (const name of names) {
		models.push(
			await loadModel(request.models, manifest, name, (loaded) =>
				progress('Downloading the models...', (done + loaded) / total)
			)
		);
		done += models.at(-1)!.length;
	}
	progress('Loading the models...');
	return models;
}

/** The temporal model's cells in place of the first pass's, reading the video in gray. */
async function temporalPass(
	request: WorkerRequest,
	firstPass: TrackerRecord[],
	model: Uint8Array,
	progress: Progress
): Promise<TrackerRecord[]> {
	const frames = await openFrames(request, progress, false);
	const { count, height, width } = frames;
	progress('Loading the temporal model...');
	const segmenter =
		request.device === 'gpu'
			? await TemporalSegmenter.create(model, count, height, width, TEMPORAL_PARAMS)
			: await CpuTemporalSegmenter.create(model, count, height, width, TEMPORAL_PARAMS);
	const firstPassCells: TrackerRecord[][] = Array.from({ length: count }, () => []);
	for (const record of firstPass) firstPassCells[record.Frame].push(record);
	const frame = new Uint8Array(height * width);
	async function* firstPassFrames(): AsyncGenerator<FirstPassFrame> {
		for (let index = 0; index < count; index++) {
			yield {
				index,
				frame: await frames.frame(index, frame),
				records: firstPassCells[index]
			};
		}
	}
	const records: TrackerRecord[] = [];
	for await (const [t, cells] of segmenter.run(firstPassFrames())) {
		progress(`Temporal pass: ${t + 1}/${count}`, (t + 1) / count);
		records.push(...cells);
	}
	await segmenter.release();
	return records;
}

async function segmentation(request: WorkerRequest, progress: Progress): Promise<TrackerRecord[]> {
	const parameters = request.parameters as SegmentationParams;
	const frames = await openFrames(
		request,
		progress,
		request.videoConfig.color === VideoColor.RGB
	);
	const { height, width, colors } = frames;
	if (parameters.temporal_pass && (height !== FRAME_SIZE || width !== FRAME_SIZE)) {
		throw new Error(
			`The temporal pass needs ${FRAME_SIZE}×${FRAME_SIZE} frames, and this video's are ${width}×${height}`
		);
	}
	const manifest = await loadManifest(request.models);
	const [dense, box, mask, temporal] = await loadModels(
		request,
		manifest,
		[
			'seg_dense.onnx',
			'seg_box.onnx',
			'seg_mask.onnx',
			...(parameters.temporal_pass ? ['temporal.onnx'] : [])
		],
		progress
	);
	const params = { scoreThreshold: parameters.score_threshold, minObjectSize: MIN_OBJECT_SIZE };
	const segmenter =
		request.device === 'gpu'
			? await Segmenter.create({ dense, box, mask }, height, width, params, { colors })
			: await CpuSegmenter.create({ dense, box, mask }, height, width, params, colors);
	const records: TrackerRecord[] = [];
	const frame = new Uint8Array(height * width * colors);
	for (let k = 0; k < frames.count; k++) {
		progress(`Segmentation: ${k + 1}/${frames.count}`, k / frames.count);
		records.push(...(await segmenter.segment(await frames.frame(k, frame), k)));
	}
	await segmenter.release();
	// One model on the GPU at a time
	return temporal ? await temporalPass(request, records, temporal, progress) : records;
}

async function tracking(request: WorkerRequest, progress: Progress): Promise<TrackerRecord[]> {
	const parameters = request.parameters as TrackingParams;
	// The tracker reads frames in order, and keeps the cells of a frame in theirs
	const records = request.current.map(asRecord).sort((a, b) => a.Frame - b.Frame);
	if (records.length === 0) throw new Error('The project has no cells: run segmentation first');
	// As the backend's GRAYSCALE mode: no tracking model takes color
	const frames = await openFrames(request, progress, false);
	const { count, height, width } = frames;
	const misfit = records.find(
		({ SegmentationRLE: { size } }) => size[0] !== height || size[1] !== width
	);
	if (misfit) {
		const [h, w] = misfit.SegmentationRLE.size;
		throw new Error(
			`Cell ${misfit.ObjectID} is ${w}×${h} pixels, the video ${width}×${height}`
		);
	}
	const manifest = await loadManifest(request.models);
	const tracker = trackingModels.find(({ file }) => file === parameters.model_name);
	if (!tracker) throw new Error(`There's no tracking model ${parameters.model_name}`);
	const { file, timeKernelSize, crop } = tracker;
	const [model] = await loadModels(request, manifest, [file], progress);
	const confidence = parameters.segmentation_confidence;
	const Kernel =
		request.device === 'gpu'
			? crop
				? CropTrackingKernel
				: TrackingKernel
			: crop
				? CpuCropTrackingKernel
				: CpuTrackingKernel;
	const kernel: ComputeKernel = await Kernel.create(
		model,
		count,
		height,
		width,
		timeKernelSize,
		confidence
	);

	let tracked = 0;
	const report = (frame: number) =>
		progress(`Tracking: ${frame + 1}/${count}`, tracked / Math.max(records.length, 1));
	let current = 0;
	if (request.device === 'cpu') {
		kernel.onObject = () => {
			tracked++;
			report(current);
		};
	}

	const params: TrackingStepParams = {
		faultyObjectRemoval: parameters.remove_faulty_objects,
		minObjectPixelNumber: parameters.min_object_pixel_number,
		maxOverlapRatio: parameters.max_overlap_ratio,
		timeKernelSize,
		maxTimeKernelShift: parameters.max_time_kernel_shift ?? null,
		minRequiredSimilarity: parameters.min_required_similarity
	};
	const output = new BackendOrder();
	const frame = new Uint8Array(height * width);
	let next = 0;
	// As the tracker's trackVideo: the frames reach the kernel as its window moves, each once
	await trackRecordsAsync(
		records,
		count,
		height,
		width,
		params,
		async (g, objects) => {
			current = g;
			report(g);
			for (
				next = Math.max(next, g - timeKernelSize);
				next <= Math.min(g + timeKernelSize, count - 1);
				next++
			) {
				kernel.uploadFrame(next, await frames.frame(next, frame));
			}
			const tracks = await kernel.localTracks(
				g,
				objects.map((o) => {
					if (!o.centroid) throw new Error(`${o.objectId} has no centroid to mark`);
					return o.centroid;
				})
			);
			if (request.device === 'gpu') tracked += objects.length;
			return tracks;
		},
		output.add
	);
	await kernel.release();
	return output.records();
}

function inheritance(request: WorkerRequest, progress: Progress): TrackerRecord[] {
	const parameters = request.parameters as InheritanceParams;
	progress('Detecting inheritance...');
	const records = request.current.map(asRecord);
	// Untracked cells neither have nor are mothers
	const tracked = records.filter((r) => r.TrackID !== null);
	if (tracked.length === 0) throw new Error('No cell has a track ID: run tracking first');
	const mothers = new Map(
		inheritRecords(tracked, parameters.max_centroid_distance).map((r) => [
			r.TrackID,
			r.AncestorID
		])
	);
	return records.map((r) => ({
		...r,
		AncestorID: r.TrackID === null ? null : (mothers.get(r.TrackID) ?? null)
	}));
}

const steps = { segmentation, tracking, inheritance };

const messages = {
	segmentation: 'Perform segmentation',
	tracking: 'Perform tracking',
	inheritance: 'Perform inheritance'
};

async function run(request: WorkerRequest): Promise<ComputeResult> {
	const progress: Progress = (message, fraction) => post({ type: 'progress', message, fraction });
	if (request.device === 'gpu' && !(await navigator.gpu?.requestAdapter())) {
		throw new Error('This browser has no WebGPU: run the step on the CPU');
	}
	const current = (await steps[request.step](request, progress)) as TrackType[];
	progress('Recording the change...');
	return { current, change: makeBulkChange(current, request.current, messages[request.step]) };
}

ort.env.logLevel = 'warning';
// From its own files: bundled into this worker, ONNX Runtime would start its threads from this script
ort.env.wasm.wasmPaths = { wasm: ortWasm, mjs: ortGlue };

onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
	run(data).then(
		(result) => post({ type: 'done', result }),
		(error: unknown) =>
			post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
	);
};
