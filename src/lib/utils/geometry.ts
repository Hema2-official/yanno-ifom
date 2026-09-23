import type { Point, Polygon } from '$lib/types/geometry.type';

function distance(x1: number, y1: number, x2: number, y2: number): number {
	return Math.hypot(x2 - x1, y2 - y1);
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

const boundsCache = new WeakMap<Polygon[], Bounds>();
/** `getPolygonsBounds` memoized on the array's identity: only for polygons that are never mutated. */
export function getPolygonsBoundsCached(polygons: Polygon[]): Bounds {
	let bounds = boundsCache.get(polygons);
	if (bounds === undefined) {
		bounds = getPolygonsBounds(polygons);
		boundsCache.set(polygons, bounds);
	}
	return bounds;
}

export function getCenterOfPolygonsCached(polygons: Polygon[]): Point {
	const { midX, midY } = getPolygonsBoundsCached(polygons);
	return { x: midX, y: midY };
}
