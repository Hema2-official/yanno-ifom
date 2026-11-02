import type { SvgViewBoxType } from '$lib/states/svg.svelte';

/** An affine map as SVG and CSS write it: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number];

/** Where one of the shown frames goes. */
export type TileLayout = {
	/** The frame's position in the shown window, 0 being its first frame. */
	offset: number;
	/** Maps the frame's box, [0, width] × [0, height], into the layout. */
	matrix: Matrix;
	/** Opacity of the frame's images. */
	fade: number;
};

/** The shown frames in draw order, and the box around them all. */
export type FrameLayout = { viewBox: SvgViewBoxType; tiles: TileLayout[] };

/** A layout fitted into a box: its scale there, and each tile's matrix by its offset. */
export type Placement = { scale: number; matrices: Matrix[] };

/** Letterboxes the layout into a `width` × `height` box, centred like an svg viewBox. */
export function placeTiles(
	{ viewBox, tiles }: FrameLayout,
	width: number,
	height: number
): Placement {
	const scale = Math.min(width / viewBox.width, height / viewBox.height);
	const x = (width - viewBox.width * scale) / 2 - viewBox.minX * scale;
	const y = (height - viewBox.height * scale) / 2 - viewBox.minY * scale;

	const placement: Placement = { scale, matrices: [] };
	for (const { offset, matrix } of tiles) {
		const [a, b, c, d, e, f] = matrix.map((value) => value * scale);
		placement.matrices[offset] = [a, b, c, d, x + e, y + f];
	}
	return placement;
}

/** The frames side by side, in rows filling a near-square grid. */
export function gridLayout(count: number, width: number, height: number): FrameLayout {
	const cols = Math.ceil(Math.sqrt(count));
	const rows = Math.ceil(count / cols);
	return {
		viewBox: { minX: 0, minY: 0, width: cols * width, height: rows * height },
		tiles: Array.from({ length: count }, (_, offset) => ({
			offset,
			matrix: [1, 0, 0, 1, (offset % cols) * width, Math.floor(offset / cols) * height],
			fade: 1
		}))
	};
}

export type StackOptions = {
	/** Degrees the sheets are turned about the vertical axis. */
	yaw: number;
	/** Degrees they are tipped toward the viewer, showing the stack from above. */
	pitch: number;
	/** Distance between the sheets, in frame widths. */
	spacing: number;
	/** Opacity lost per frame behind the front one. */
	fade: number;
};

/**
 * The frames as a stack of sheets, the first in front and the rest receding
 * to the right, fading the further back they are. A parallel projection keeps
 * each tile an affine map, so pointer coordinates in it stay exact.
 */
export function stackLayout(
	count: number,
	width: number,
	height: number,
	{ yaw, pitch, spacing, fade }: StackOptions
): FrameLayout {
	const θ = (yaw * Math.PI) / 180;
	const φ = (pitch * Math.PI) / 180;
	// The rotation of the sheet's plane, then each sheet's depth along the view
	const [a, b, d] = [Math.cos(θ), Math.sin(θ) * Math.sin(φ), Math.cos(φ)];
	const depth = spacing * width;
	const stepX = depth * Math.sin(θ);
	const stepY = -depth * Math.cos(θ) * Math.sin(φ);

	// The corners of the first sheet, stretched over the offsets of all of them
	const xs = [0, a * width];
	const ys = [0, b * width, d * height, b * width + d * height];
	const lastX = (count - 1) * stepX;
	const lastY = (count - 1) * stepY;
	const minX = Math.min(...xs) + Math.min(0, lastX);
	const maxX = Math.max(...xs) + Math.max(0, lastX);
	const minY = Math.min(...ys) + Math.min(0, lastY);
	const maxY = Math.max(...ys) + Math.max(0, lastY);

	// Back to front
	return {
		viewBox: { minX, minY, width: maxX - minX, height: maxY - minY },
		tiles: Array.from({ length: count }, (_, i) => {
			const offset = count - 1 - i;
			return {
				offset,
				matrix: [a, b, 0, d, offset * stepX, offset * stepY],
				fade: (1 - fade) ** offset
			};
		})
	};
}
