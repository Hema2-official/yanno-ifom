/**
 * The detections from the box head's outputs on the proposals, as detectron2's FastRCNNOutputLayers
 * inference makes them (fast_rcnn_inference_single_image): softmax over the class logits, the deltas
 * decoded (weights 10, 10, 5, 5), the boxes clipped, scores above the threshold, NMS per class, the best
 * 1,000. Then detector_postprocess's filter: only boxes that are not empty get a mask.
 */
import { torchSoftmax2 } from '../math/float32';
import { applyDeltas, batchedNms, clipBoxes, nonempty } from './boxes';
import type { Proposals } from './proposals';

export interface Detections {
	readonly count: number;
	/** four float32 entries per detection */
	readonly boxes: Float32Array<ArrayBuffer>;
	readonly scores: Float32Array;
	readonly classes: Int32Array;
	/** the proposal each detection comes from */
	readonly rows: Int32Array;
}

export interface DetectionParams {
	/** ROI_HEADS.SCORE_THRESH_TEST, the backend's score threshold */
	readonly scoreThreshold: number;
	readonly nmsThreshold: number;
	readonly topk: number;
}

const BOX_WEIGHTS = [10, 10, 5, 5] as const;

/**
 * The detections of one image with one class (the model's): classLogits holds two logits per proposal
 * (the class, then background), boxDeltas four deltas per proposal.
 */
export function detectBoxes(
	proposals: Proposals,
	classLogits: Float32Array,
	boxDeltas: Float32Array,
	imageHeight: number,
	imageWidth: number,
	params: DetectionParams
): Detections {
	const r = proposals.count;
	const probabilities = new Float32Array(2 * r),
		boxes = new Float32Array(4 * r),
		rows = new Int32Array(r);
	let valid = 0;
	for (let i = 0; i < r; i++) {
		torchSoftmax2(classLogits[2 * i], classLogits[2 * i + 1], probabilities, 2 * valid);
		applyDeltas(proposals.boxes, i, boxDeltas, i, BOX_WEIGHTS, boxes, valid);
		let finite =
			Number.isFinite(probabilities[2 * valid]) &&
			Number.isFinite(probabilities[2 * valid + 1]);
		for (let c = 0; c < 4; c++) finite &&= Number.isFinite(boxes[4 * valid + c]);
		rows[valid] = i;
		if (finite) valid++;
	}
	clipBoxes(boxes, valid, imageHeight, imageWidth);

	// scores > threshold, with the threshold as the float32 PyTorch compares with
	const threshold = Math.fround(params.scoreThreshold);
	let m = 0;
	const scores = new Float32Array(valid);
	for (let i = 0; i < valid; i++) {
		if (!(probabilities[2 * i] > threshold)) continue;
		boxes.copyWithin(4 * m, 4 * i, 4 * i + 4);
		scores[m] = probabilities[2 * i];
		rows[m++] = rows[i];
	}
	const keep = new Int32Array(m);
	const kept = Math.min(
		batchedNms(boxes, scores, new Int32Array(m), m, params.nmsThreshold, keep),
		params.topk
	);
	const out = {
		count: kept,
		boxes: new Float32Array(4 * kept),
		scores: new Float32Array(kept),
		classes: new Int32Array(kept),
		rows: new Int32Array(kept)
	};
	for (let k = 0; k < kept; k++) {
		out.boxes.set(boxes.subarray(4 * keep[k], 4 * keep[k] + 4), 4 * k);
		out.scores[k] = scores[keep[k]];
		out.rows[k] = rows[keep[k]];
	}
	return out;
}

/** detector_postprocess at the input's size (scale 1): the indices of the detections whose boxes are not empty. */
export function nonemptyDetections(detections: Detections): number[] {
	const indices: number[] = [];
	for (let i = 0; i < detections.count; i++) if (nonempty(detections.boxes, i)) indices.push(i);
	return indices;
}
