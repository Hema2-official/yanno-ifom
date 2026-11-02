import { annotationState } from '$lib/states/AnnotationState.svelte';
import { editorState } from '$lib/states/EditorState.svelte';
import { keybindings } from '$lib/states/KeybindingState.svelte';
import type { TrackType } from '$lib/types/annotation.type';
import type { ClientPoint } from '$lib/utils/display';
import { startDrag } from '$lib/utils/drag';

// The starters return false when the pointer can't be captured

/** Max allowed travel on click */
const CLICK_SLOP = 3;
/** Threshold to trigger a turn when dragging */
const TURN_SLOP = 6;
/** A right press this short is a click even past the slop: a hand still moving onto a cell drifts */
const QUICK_CLICK = { ms: 300, px: 12 };

type PanHandlers = {
	/** Locks the pointer, so it can travel on past the screen's edge. */
	locked: boolean;
	onPan: (deltaX: number, deltaY: number) => void;
	onEnd: (wasClick: boolean) => void;
};

export function startPan(
	root: HTMLElement,
	press: PointerEvent,
	{ locked, onPan, onEnd }: PanHandlers
): boolean {
	let previous = { x: press.clientX, y: press.clientY };
	let travel = 0;
	// The first move under the lock is either noise or just 0
	let lockSettled = !locked;

	const started = startDrag(root, press, {
		onMove(e) {
			if (!lockSettled) {
				lockSettled = document.pointerLockElement !== null;
				return;
			}
			const deltaX = locked ? e.movementX : e.clientX - previous.x;
			const deltaY = locked ? e.movementY : e.clientY - previous.y;
			previous = { x: e.clientX, y: e.clientY };

			travel += Math.abs(deltaX) + Math.abs(deltaY);
			onPan(deltaX, deltaY);
		},
		onEnd(e) {
			if (locked) document.exitPointerLock();
			onEnd(e.type === 'pointerup' && travel <= CLICK_SLOP);
		}
	});
	if (started && locked) root.requestPointerLock();
	return started;
}

type TurnHandlers = {
	canTurn: () => boolean;
	onTurn: (deltaX: number, deltaY: number) => void;
	/** `event` is a `pointerup` unless the pointer was lost. */
	onEnd: (turned: boolean, event: PointerEvent) => void;
};

export function startTurn(
	root: HTMLElement,
	press: PointerEvent,
	{ canTurn, onTurn, onEnd }: TurnHandlers
): boolean {
	const start = { x: press.clientX, y: press.clientY };
	let previous = start;
	let turned = false;

	return startDrag(root, press, {
		onMove(e) {
			if (!turned) {
				const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
				if (!canTurn() || distance <= TURN_SLOP) return;
				turned = true;
			}
			onTurn(e.clientX - previous.x, e.clientY - previous.y);
			previous = { x: e.clientX, y: e.clientY };
		},
		onEnd(e) {
			const quick =
				e.timeStamp - press.timeStamp <= QUICK_CLICK.ms &&
				Math.hypot(e.clientX - start.x, e.clientY - start.y) <= QUICK_CLICK.px;
			onEnd(turned && !quick, e);
		}
	});
}

export type CellHit = { cell: TrackType; tile: SVGSVGElement };

/** The cells drawn under a client position, topmost first, through the tools' elements. */
export function cellsAt({ clientX, clientY }: ClientPoint): CellHit[] {
	const hits: CellHit[] = [];
	for (const element of document.elementsFromPoint(clientX, clientY)) {
		const id = element.closest('[data-cell-id]')?.getAttribute('data-cell-id');
		const cell = id ? annotationState.getCell(id) : undefined;
		const tile = element.closest('svg');
		if (cell && tile && !hits.some((hit) => hit.cell === cell)) hits.push({ cell, tile });
	}
	return hits;
}

export function selectionClick(press: PointerEvent) {
	const range = keybindings.isActive('selection.range', press);
	const additive = range || keybindings.isActive('selection.add', press);
	const cell = cellsAt(press)[0]?.cell;
	if (!cell) {
		if (!additive) editorState.clearSelection();
	} else if (range) editorState.selectRange(cell);
	else if (additive) editorState.toggle(cell);
	else editorState.select(cell);
}

type GestureHandlers = {
	onStart?: (press: PointerEvent) => void;
	onMove: (event: PointerEvent) => void;
	onEnd: (event: PointerEvent) => void;
	/** Handles a press released within the slop */
	onClick?: ((press: PointerEvent) => void) | null;
};

/** A tool's drag, a click until the pointer moves past the slop. */
export function startGesture(
	root: Element & GlobalEventHandlers,
	press: PointerEvent,
	{ onStart, onMove, onEnd, onClick = selectionClick }: GestureHandlers
): boolean {
	let started = false;
	return startDrag(root, press, {
		onMove(e) {
			if (!started) {
				const travel = Math.hypot(e.clientX - press.clientX, e.clientY - press.clientY);
				if (travel <= CLICK_SLOP) return;
				started = true;
				onStart?.(press);
			}
			onMove(e);
		},
		onEnd(e) {
			if (started) onEnd(e);
			else if (e.type === 'pointerup') onClick?.(press);
		}
	});
}
