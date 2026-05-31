import { lastPointerViewBoxCoords } from '$lib/stores/editor';
import { svgState } from '$lib/states/svg.svelte';
import type { Point, Polygon } from '$lib/types/geometry.type';

export function cellBodyToPath(body: Polygon) {
	let path = `M${body[0].x},${body[0].y} `;
	for (let i = 1; i < body.length; i++) path += `L${body[i].x},${body[i].y} `;
	path += 'z';
	return path;
}

export function getPointerCoords(e: MouseEvent): Point {
	return { x: e.clientX, y: e.clientY };
}

export function getPointerSvgCoords(e: MouseEvent, svgElement: SVGSVGElement): Point {
	const svgRect = svgElement.getBoundingClientRect();
	return { x: e.clientX - svgRect.left, y: e.clientY - svgRect.top };
}

export function getPointerViewBoxCoords(e: MouseEvent, svgElement: SVGSVGElement): Point {
	const mouse = getPointerSvgCoords(e, svgElement);

	const { width, height } = svgElement.getBoundingClientRect();
	const shorterSide = Math.min(width, height);
	const offsetX = (width - shorterSide) / 2;
	const offsetY = (height - shorterSide) / 2;

	const vb = svgState.svgViewBox;

	const coords = {
		x: ((mouse.x - offsetX) * (vb.width - vb.minX)) / shorterSide + vb.minX,
		y: ((mouse.y - offsetY) * (vb.height - vb.minY)) / shorterSide + vb.minY
	};
	lastPointerViewBoxCoords.set(coords);
	return coords;
}

export type Measurable = {
	getBoundingClientRect: () => DOMRect;
};

export function toMeasurable(e: MouseEvent): Measurable {
	return {
		getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0)
	};
}
