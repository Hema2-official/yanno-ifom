import type { CellType } from '$lib/types';

export function cellToPath (cell: CellType) {
    let path = `M${cell.x[0]},${cell.y[0]} `;
    for (let i = 1; i < cell.x.length; i++) path += `L${cell.x[i]},${cell.y[i]} `;
    path += 'z';
    return path;
}

export function ignoreContextMenu(e: any) {
    e.preventDefault();
}

export function getPointerCoords(e: MouseEvent) {
    return { x: e.clientX as number, y: e.clientY as number };
}

export function getPointerSvgCoords(e: MouseEvent, svgElement: SVGSVGElement) {
    const svgRect = svgElement.getBoundingClientRect();
    return { x: e.clientX - svgRect.left,
            y: e.clientY - svgRect.top };
}

export function getPointerViewBoxCoords(e: MouseEvent, svgElement: SVGSVGElement) {
    const mouse = getPointerSvgCoords(e, svgElement);

    const {width, height} = svgElement.getBoundingClientRect();
    const shorterSide = Math.min(width, height);
    const offsetX = (width - shorterSide) / 2;
    const offsetY = (height - shorterSide) / 2;
    const svgViewBox = svgElement.getAttribute('viewBox').split(' ').map(v => parseInt(v));

    return {
        x: (mouse.x - offsetX) / shorterSide * (svgViewBox[2] - svgViewBox[0]) + svgViewBox[0],
        y: (mouse.y - offsetY) / shorterSide * (svgViewBox[3] - svgViewBox[1]) + svgViewBox[1],
    };
}
