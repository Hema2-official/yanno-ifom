import type { BoundingBoxType } from '$lib/types/annotation.type';
import type { Point, Polygon } from '$lib/types/geometry.type';

function distance(x1: number, y1: number, x2: number, y2: number): number {
	return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * Compute the centroid and bounding box over all points of all polygons.
 *
 * @param polygons Array of polygons ({x, y} vertex lists).
 * @returns The centroid `[y, x]` and bounding box `[minX, minY, maxX, maxY]`.
 */
export function getPolygonsInfo(polygons: Polygon[]): {
	centroid: [number, number];
	bbox: BoundingBoxType;
} {
	const { minX, minY, maxX, maxY } = getPolygonsBounds(polygons);

	let sumX = 0;
	let sumY = 0;
	let count = 0;

	for (const polygon of polygons) {
		for (const point of polygon) {
			sumX += point.x;
			sumY += point.y;
			count++;
		}
	}

	if (count === 0) {
		return { centroid: [0, 0], bbox: [0, 0, 0, 0] };
	}

	return {
		centroid: [Math.round(sumY / count), Math.round(sumX / count)],
		bbox: [Math.round(minX), Math.round(minY), Math.round(maxX), Math.round(maxY)]
	};
}

export function resampleCellBody(body: Polygon, segmentLength: number): Polygon {
	const pointsLength = body.length;

	const resampled: Polygon = [body[0]];

	let currentDistance = 0;
	for (let i = 1; i < pointsLength; i++) {
		const x1 = body[i - 1].x;
		const y1 = body[i - 1].y;
		const x2 = body[i].x;
		const y2 = body[i].y;
		const segmentDist = distance(x1, y1, x2, y2);

		while (currentDistance + segmentDist >= segmentLength) {
			const t = (segmentLength - currentDistance) / segmentDist;
			resampled.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
			currentDistance -= segmentLength;
		}
		currentDistance += segmentDist;
	}

	// Resample between last and first point
	const x1 = body[pointsLength - 1].x;
	const y1 = body[pointsLength - 1].y;
	const x2 = body[0].x;
	const y2 = body[0].y;
	const segmentDist = distance(x1, y1, x2, y2);

	while (currentDistance + segmentDist >= segmentLength) {
		const t = (segmentLength - currentDistance) / segmentDist;
		resampled.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
		currentDistance -= segmentLength;
	}

	return resampled;
}

export function resampleCellBodies(bodies: Polygon[], segmentLength: number): Polygon[] {
	return bodies.map((body) => resampleCellBody(body, segmentLength));
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	midX: number;
	midY: number;
}

export function getPolygonsBounds(polygons: Polygon[]): Bounds {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (let i = 0; i < polygons.length; i++) {
		const polygon = polygons[i];
		for (let j = 0; j < polygon.length; j++) {
			const p = polygon[j];
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.x > maxX) maxX = p.x;
			if (p.y > maxY) maxY = p.y;
		}
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		midX: minX === Infinity ? 0 : (minX + maxX) / 2,
		midY: minY === Infinity ? 0 : (minY + maxY) / 2
	};
}

export function getCenterOfPolygons(polygons: Polygon[]): Point {
	const bounds = getPolygonsBounds(polygons);
	return { x: bounds.midX, y: bounds.midY };
}

export function getCenterOfPolygon(polygon: Polygon): Point {
	return getCenterOfPolygons([polygon]);
}

const centerCache = new WeakMap<Polygon[], Point>();
export function getCenterOfPolygonsCached(polygons: Polygon[]): Point {
	let center = centerCache.get(polygons);
	if (center === undefined) {
		center = getCenterOfPolygons(polygons);
		centerCache.set(polygons, center);
	}
	return center;
}
