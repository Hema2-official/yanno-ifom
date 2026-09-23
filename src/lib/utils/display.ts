import type { Point, Polygon } from '$lib/types/geometry.type';

export function cellBodyToPath(body: Polygon) {
	let path = `M${body[0].x},${body[0].y} `;
	for (let i = 1; i < body.length; i++) path += `L${body[i].x},${body[i].y} `;
	path += 'z';
	return path;
}

const pathCache = new WeakMap<Polygon, string>();
export function cellBodyToPathCached(body: Polygon): string {
	let path = pathCache.get(body);
	if (path === undefined) {
		path = cellBodyToPath(body);
		pathCache.set(body, path);
	}
	return path;
}

export function getPointerViewBoxCoords(e: MouseEvent, svgElement: SVGSVGElement): Point {
	const ctm = svgElement.getScreenCTM();
	if (!ctm) return { x: 0, y: 0 };

	const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
	return { x: point.x, y: point.y };
}

export type Measurable = {
	getBoundingClientRect: () => DOMRect;
};

/** An anchor for floating UI at the event's position. */
export function toMeasurable(e: MouseEvent): Measurable {
	return {
		getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0)
	};
}
