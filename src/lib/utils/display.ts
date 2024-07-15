import { lastPointerViewBoxCoords } from '$lib/stores/editor';
import { svgViewBox } from '$lib/stores/svg';
import type { CellBodyType } from '$lib/types/annotation.type';
import { get } from 'svelte/store';

export function cellBodyToPath(body: CellBodyType) {
	let path = `M${body.x[0]},${body.y[0]} `;
	for (let i = 1; i < body.x.length; i++) path += `L${body.x[i]},${body.y[i]} `;
	path += 'z';
	return path;
}

export function getPointerCoords(e: MouseEvent) {
	return { x: e.clientX, y: e.clientY };
}

export function getPointerSvgCoords(e: MouseEvent, svgElement: SVGSVGElement) {
	const svgRect = svgElement.getBoundingClientRect();
	return { x: e.clientX - svgRect.left, y: e.clientY - svgRect.top };
}

export function getPointerViewBoxCoords(e: MouseEvent, svgElement: SVGSVGElement) {
	const mouse = getPointerSvgCoords(e, svgElement);

	const { width, height } = svgElement.getBoundingClientRect();
	const shorterSide = Math.min(width, height);
	const offsetX = (width - shorterSide) / 2;
	const offsetY = (height - shorterSide) / 2;

	const vb = get(svgViewBox);

	const coords = {
		x: ((mouse.x - offsetX) * (vb.width - vb.minX)) / shorterSide + vb.minX,
		y: ((mouse.y - offsetY) * (vb.height - vb.minY)) / shorterSide + vb.minY
	};
	lastPointerViewBoxCoords.set(coords);
	return coords;
}
