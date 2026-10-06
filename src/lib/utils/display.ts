import type { PointerRecord } from '$lib/states/InputState.svelte';
import type { Point, Polygon } from '$lib/types/geometry.type';

export function cellBodyToPath(body: Polygon) {
	const points = withoutRepeats(body);
	const n = points.length;
	let path = '';
	for (let i = 0; i < n; i++) {
		const a = points[(i + n - 1) % n];
		const b = points[i];
		const c = points[(i + 1) % n];
		const [abX, abY, bcX, bcY] = [b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y];
		// Going straight on, not turning back
		const straight = abX * bcY === abY * bcX && abX * bcX + abY * bcY > 0;
		if (n > 2 && straight) continue;
		path += `${path ? 'L' : 'M'}${b.x},${b.y} `;
	}
	return path + 'z';
}

function withoutRepeats(body: Polygon): Polygon {
	const points = body.filter((point, i) => {
		const previous = body[(i + body.length - 1) % body.length];
		return point.x !== previous.x || point.y !== previous.y;
	});
	return points.length > 0 ? points : body.slice(0, 1);
}

/** An open path through the points, such as a stroke being drawn. */
export function polylineToPath(points: Point[]): string {
	return points.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
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

/** An arrow to stroke and fill: the shaft, then the head at `to`, sized by the stroke's width. */
export function arrowPath(from: Point, to: Point, width: number): string {
	const length = Math.hypot(to.x - from.x, to.y - from.y);
	if (length === 0) return '';
	const head = Math.min(4 * width, length);
	const [alongX, alongY] = [((to.x - from.x) / length) * head, ((to.y - from.y) / length) * head];
	const [baseX, baseY] = [to.x - alongX, to.y - alongY];
	const [sideX, sideY] = [-alongY / 2, alongX / 2];
	return (
		`M${from.x},${from.y} L${baseX},${baseY} ` +
		`M${to.x},${to.y} L${baseX + sideX},${baseY + sideY} L${baseX - sideX},${baseY - sideY} z`
	);
}

/** A position on the screen, as pointer events and `elementsFromPoint` take it. */
export type ClientPoint = { clientX: number; clientY: number };

export function getPointerViewBoxCoords(e: ClientPoint, svgElement: SVGSVGElement): Point {
	const ctm = svgElement.getScreenCTM();
	if (!ctm) return { x: 0, y: 0 };

	const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
	return { x: point.x, y: point.y };
}

export function frameTileAt(root: Element, e: ClientPoint): PointerRecord | null {
	const tiles = root.querySelectorAll<SVGSVGElement>('svg[data-frame-index]');
	for (let i = tiles.length - 1; i >= 0; i--) {
		const tile = tiles[i];
		if (!tile.getScreenCTM()) continue;
		const { x, y } = getPointerViewBoxCoords(e, tile);
		const box = tile.viewBox.baseVal;
		if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
			return { frameIndex: Number(tile.dataset.frameIndex), x, y };
		}
	}
	return null;
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
