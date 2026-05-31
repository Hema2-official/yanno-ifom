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

export function getCenterOfPolygon(polygon: Polygon): Point {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const point of polygon) {
		if (point.x < minX) minX = point.x;
		if (point.x > maxX) maxX = point.x;
		if (point.y < minY) minY = point.y;
		if (point.y > maxY) maxY = point.y;
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x: 0, y: 0 };

	return {
		x: (minX + maxX) / 2,
		y: (minY + maxY) / 2
	};
}

export function getCenterOfPolygons(polygons: Polygon[]): Point {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const polygon of polygons) {
		for (const point of polygon) {
			if (point.x < minX) minX = point.x;
			if (point.x > maxX) maxX = point.x;
			if (point.y < minY) minY = point.y;
			if (point.y > maxY) maxY = point.y;
		}
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x: 0, y: 0 };

	return {
		x: (minX + maxX) / 2,
		y: (minY + maxY) / 2
	};
}
