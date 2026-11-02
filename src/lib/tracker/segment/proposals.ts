/**
 * The RPN's proposals from its head's outputs, as detectron2's find_top_rpn_proposals makes them at test
 * time: per FPN level the top logits (torch.topk), only those anchors decoded (weights 1, 1, 1, 1), the
 * boxes of all levels clipped, empty ones dropped, an NMS per level (batched_nms), and the best of what
 * is left.
 */
import { torchTopk } from '../math/stdsort';
import { applyDeltas, batchedNms, clipBoxes, nonempty } from './boxes';

/** One FPN level of the RPN head's outputs, in the head's layout, with the level's anchors. */
export interface RpnLevel {
	/** (anchors per cell, height, width) */
	readonly objectness: Float32Array;
	/** (anchors per cell, 4, height, width) */
	readonly deltas: Float32Array;
	readonly height: number;
	readonly width: number;
	/** levelAnchors of the level */
	readonly anchors: Float32Array;
}

export interface Proposals {
	readonly count: number;
	/** four float32 entries per proposal */
	readonly boxes: Float32Array<ArrayBuffer>;
	readonly logits: Float32Array;
}

export interface RpnParams {
	readonly preNmsTopk: number;
	readonly postNmsTopk: number;
	readonly nmsThreshold: number;
	readonly minSize: number;
}

/** The model's configuration (config_larger_set.yaml, MODEL.RPN and MODEL.PROPOSAL_GENERATOR). */
export const RPN_PARAMS: RpnParams = {
	preNmsTopk: 4000,
	postNmsTopk: 4000,
	nmsThreshold: 0.7,
	minSize: 0
};

const UNIT_WEIGHTS = [1, 1, 1, 1] as const;

/** One level's best anchors as torch.topk picks them, best first: their indices, (row * width + column) * A + a, and logits. */
export interface TopAnchors {
	readonly anchors: Int32Array;
	readonly logits: Float32Array;
}

/** The top k anchors of a level from its objectness logits, (A, cells) in the head's layout. */
export function topAnchors(objectness: Float32Array, cells: number, k: number): TopAnchors {
	const anchorsPerCell = objectness.length / cells,
		count = objectness.length;
	// permute(0, 2, 3, 1).flatten(1): (row, column, anchor)
	const logits = new Float32Array(count);
	for (let a = 0; a < anchorsPerCell; a++) {
		for (let cell = 0; cell < cells; cell++)
			logits[cell * anchorsPerCell + a] = objectness[a * cells + cell];
	}
	const n = Math.min(k, count);
	const order = torchTopk(logits, count, n);
	return {
		anchors: order.slice(0, n),
		logits: Float32Array.from(order.subarray(0, n), (i) => logits[i])
	};
}

/** The four deltas of each top anchor from a level's deltas, (A, 4, cells) in the head's layout, written from out[4 * at] on. */
export function gatherDeltas(
	deltas: Float32Array,
	cells: number,
	top: TopAnchors,
	out: Float32Array,
	at: number
): void {
	const anchorsPerCell = deltas.length / (4 * cells);
	top.anchors.forEach((i, j) => {
		const cell = Math.floor(i / anchorsPerCell),
			a = i - cell * anchorsPerCell;
		for (let c = 0; c < 4; c++) out[4 * (at + j) + c] = deltas[(a * 4 + c) * cells + cell];
	});
}

/** All levels' proposals from their RPN outputs. */
export function rpnProposals(
	levels: readonly RpnLevel[],
	imageHeight: number,
	imageWidth: number,
	params: RpnParams = RPN_PARAMS
): Proposals {
	const tops = levels.map((level) =>
		topAnchors(level.objectness, level.height * level.width, params.preNmsTopk)
	);
	const deltas = new Float32Array(4 * tops.reduce((sum, top) => sum + top.anchors.length, 0));
	let at = 0;
	levels.forEach((level, l) => {
		gatherDeltas(level.deltas, level.height * level.width, tops[l], deltas, at);
		at += tops[l].anchors.length;
	});
	return proposalsFromTop(
		tops,
		deltas,
		levels.map((level) => level.anchors),
		imageHeight,
		imageWidth,
		params
	);
}

/**
 * The proposals from each level's top anchors (topAnchors) and their deltas (four per top anchor, the
 * levels one after the other), with each level's anchors.
 */
export function proposalsFromTop(
	tops: readonly TopAnchors[],
	topDeltas: Float32Array,
	anchors: readonly Float32Array[],
	imageHeight: number,
	imageWidth: number,
	params: RpnParams = RPN_PARAMS
): Proposals {
	const total = tops.reduce((sum, top) => sum + top.anchors.length, 0);
	const boxes = new Float32Array(4 * total),
		scores = new Float32Array(total),
		levelIds = new Int32Array(total);
	let n = 0;
	tops.forEach((top, id) => {
		top.anchors.forEach((i, j) => {
			applyDeltas(anchors[id], i, topDeltas, n, UNIT_WEIGHTS, boxes, n);
			scores[n] = top.logits[j];
			levelIds[n] = id;
			n++;
		});
	});

	// inference drops boxes or scores that are not finite, then clips and drops empty boxes
	let m = 0;
	for (let i = 0; i < n; i++) {
		if (
			!(
				Number.isFinite(scores[i]) &&
				Number.isFinite(boxes[4 * i]) &&
				Number.isFinite(boxes[4 * i + 1]) &&
				Number.isFinite(boxes[4 * i + 2]) &&
				Number.isFinite(boxes[4 * i + 3])
			)
		)
			continue;
		if (m !== i) {
			boxes.copyWithin(4 * m, 4 * i, 4 * i + 4);
			scores[m] = scores[i];
			levelIds[m] = levelIds[i];
		}
		m++;
	}
	clipBoxes(boxes, m, imageHeight, imageWidth);
	n = 0;
	for (let i = 0; i < m; i++) {
		if (!nonempty(boxes, i, params.minSize)) continue;
		if (n !== i) {
			boxes.copyWithin(4 * n, 4 * i, 4 * i + 4);
			scores[n] = scores[i];
			levelIds[n] = levelIds[i];
		}
		n++;
	}

	const keep = new Int32Array(n);
	const kept = Math.min(
		batchedNms(boxes, scores, levelIds, n, params.nmsThreshold, keep),
		params.postNmsTopk
	);
	const out = { count: kept, boxes: new Float32Array(4 * kept), logits: new Float32Array(kept) };
	for (let k = 0; k < kept; k++) {
		out.boxes.set(boxes.subarray(4 * keep[k], 4 * keep[k] + 4), 4 * k);
		out.logits[k] = scores[keep[k]];
	}
	return out;
}
