import type { TrackType } from '$lib/types/annotation.type';
import type { Point, Polygon } from '$lib/types/geometry.type';
import { getPolygonSize, rleToPolygons } from './rle';
import { newObjectId, trackAncestor, withOutline } from './tracks';

/** Number of radial directions an outline is sampled in. */
const RAYS = 90;

/** An outline as its centroid and its distance from there along evenly spread rays. */
type RadialShape = { center: Point; radii: number[] };

export type Gap = { frame: number; before: TrackType; after: TrackType; t: number };

export function gapsBetween(cells: TrackType[]): Gap[] {
	const sorted = cells.toSorted((a, b) => a.Frame - b.Frame);
	const gaps: Gap[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const before = sorted[i - 1];
		const after = sorted[i];
		const span = after.Frame - before.Frame;
		for (let frame = before.Frame + 1; frame < after.Frame; frame++) {
			gaps.push({ frame, before, after, t: (frame - before.Frame) / span });
		}
	}
	return gaps;
}

/**
 * Generate an interpolated cell to fill a gap between two existing cells.
 * @throws If either cell does not have a valid outline to interpolate from.
 */
export function interpolatedCell({ frame, before, after, t }: Gap, tracks: TrackType[]): TrackType {
	const a = radialShape(before);
	const b = radialShape(after);
	if (!a || !b) throw new Error('A cell has no outline to interpolate from');

	// Get a track ID from before or after
	const trackId = before.TrackID ?? after.TrackID ?? null;
	const pad = (n: number) => String(n).padStart(4, '0');
	// Standard backend naming for interpolated cells: "{frame 1-based}{trackId}ITP"
	const conventional = trackId === null ? null : `${pad(frame + 1)}${pad(trackId)}ITP`;
	const objectId =
		conventional !== null && !tracks.some((cell) => cell.ObjectID === conventional)
			? conventional
			: newObjectId(frame, tracks);

	const [height, width] = before.SegmentationRLE.size;
	const cell: TrackType = {
		Frame: frame,
		ObjectID: objectId,
		SegmentationRLE: { size: [height, width], counts: '' },
		TrackID: trackId,
		Interpolated: true,
		Class: before.Class === after.Class ? (before.Class ?? null) : null,
		AncestorID: trackId === null ? null : trackAncestor(tracks, trackId)
	};
	return withOutline(cell, [blendShapes(a, b, t)]);
}

/** Get a cell's largest outline as a radial shape. */
function radialShape(cell: TrackType): RadialShape | null {
	const polygons = rleToPolygons(cell.SegmentationRLE);
	if (polygons.length === 0) return null;
	const outline = polygons.reduce((largest, polygon) =>
		getPolygonSize(polygon) > getPolygonSize(largest) ? polygon : largest
	);

	const center = centroid(outline);
	const radii = Array.from({ length: RAYS }, (_, k) => {
		const angle = (2 * Math.PI * k) / RAYS;
		return reach(outline, center, Math.cos(angle), Math.sin(angle));
	});
	return { center, radii };
}

/** The outline `t` of the way from `a` to `b`. */
function blendShapes(a: RadialShape, b: RadialShape, t: number): Polygon {
	// Interpolate center position
	const x = a.center.x + (b.center.x - a.center.x) * t;
	const y = a.center.y + (b.center.y - a.center.y) * t;
	// Interpolate each ray distance and reconstruct polygon vertices
	return a.radii.map((radiusA, k) => {
		const radius = radiusA + (b.radii[k] - radiusA) * t;
		const angle = (2 * Math.PI * k) / RAYS;
		return { x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
	});
}

function centroid(polygon: Polygon): Point {
	let area = 0;
	let x = 0;
	let y = 0;
	for (let i = 0; i < polygon.length; i++) {
		const p = polygon[i];
		const q = polygon[(i + 1) % polygon.length];
		const cross = p.x * q.y - q.x * p.y;
		area += cross;
		x += (p.x + q.x) * cross;
		y += (p.y + q.y) * cross;
	}
	if (area !== 0) return { x: x / (3 * area), y: y / (3 * area) };

	let sumX = 0;
	let sumY = 0;
	for (const point of polygon) {
		sumX += point.x;
		sumY += point.y;
	}
	return { x: sumX / polygon.length, y: sumY / polygon.length };
}

/** How far the ray from `center` along (dx, dy) goes before it last crosses the outline. */
function reach(polygon: Polygon, center: Point, dx: number, dy: number): number {
	let farthest = 0;
	for (let i = 0; i < polygon.length; i++) {
		const p = polygon[i];
		const q = polygon[(i + 1) % polygon.length];
		const ex = q.x - p.x;
		const ey = q.y - p.y;
		// 2D cross product of ray direction and edge vector; 0 means parallel lines
		const denominator = dx * ey - dy * ex;
		if (denominator === 0) continue;

		const wx = p.x - center.x;
		const wy = p.y - center.y;
		const distance = (wx * ey - wy * ex) / denominator;
		const along = (wx * dy - wy * dx) / denominator;
		if (distance > farthest && along >= 0 && along <= 1) farthest = distance;
	}
	return farthest;
}
