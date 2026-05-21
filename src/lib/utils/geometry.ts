import { resampleSegmentLength } from '$lib/stores/options';
import type { CellBodyType } from '$lib/types/annotation.type';
import { get } from 'svelte/store';

// export const interpolateCellBody = (body: CellBodyType, points: number): CellBodyType => {
// 	// const spline = new Spline(body.x, body.y);
// 	const splineX = new Spline(body.x, body.x);
// 	const splineY = new Spline(body.x, body.y);

// 	const interpolatedX: number[] = [];
// 	const interpolatedY: number[] = [];

// 	for (let i = 0; i < points; i++) {
// 		const t = (i / (points - 1)) * (body.x.length - 1);
// 		interpolatedX.push(splineX.at(t));
// 		interpolatedY.push(splineY.at(t));
// 	}

// 	return { x: interpolatedX, y: interpolatedY };

// 	// const newX = Array.from({ length: points }, (_, i) => i);
// 	// const newY = newX.map((x) => spline.at(x));
// 	// return { x: newX, y: newY };
// };

function distance(x1: number, y1: number, x2: number, y2: number): number {
	return Math.hypot(x2 - x1, y2 - y1);
}

export function resampleCellBody(body: CellBodyType, segmentLength: number): CellBodyType {
	const pointsLength = body.x.length;
	// let totalLength = 0;

	// for (let i = 1; i < pointsLength; i++) {
	// 	totalLength += distance(body.x[i - 1], body.y[i - 1], body.x[i], body.y[i]);
	// }
	// totalLength += distance(
	// 	body.x[pointsLength - 1],
	// 	body.y[pointsLength - 1],
	// 	body.x[0],
	// 	body.y[0]
	// ); // Add distance between last and first point

	const resampledX: number[] = [body.x[0]];
	const resampledY: number[] = [body.y[0]];

	let currentDistance = 0;
	for (let i = 1; i < pointsLength; i++) {
		const x1 = body.x[i - 1];
		const y1 = body.y[i - 1];
		const x2 = body.x[i];
		const y2 = body.y[i];
		const segmentDist = distance(x1, y1, x2, y2);

		while (currentDistance + segmentDist >= segmentLength) {
			const t = (segmentLength - currentDistance) / segmentDist;
			resampledX.push(x1 + t * (x2 - x1));
			resampledY.push(y1 + t * (y2 - y1));
			currentDistance -= segmentLength;
		}
		currentDistance += segmentDist;
	}

	// Resample between last and first point
	const x1 = body.x[pointsLength - 1];
	const y1 = body.y[pointsLength - 1];
	const x2 = body.x[0];
	const y2 = body.y[0];
	const segmentDist = distance(x1, y1, x2, y2);

	while (currentDistance + segmentDist >= segmentLength) {
		const t = (segmentLength - currentDistance) / segmentDist;
		resampledX.push(x1 + t * (x2 - x1));
		resampledY.push(y1 + t * (y2 - y1));
		currentDistance -= segmentLength;
	}
	currentDistance += segmentDist;

	return { x: resampledX, y: resampledY };
}

export function resampleCellBodies(bodies: CellBodyType[]): CellBodyType[] {
	return bodies.map((body) => resampleCellBody(body, get(resampleSegmentLength)));
}
