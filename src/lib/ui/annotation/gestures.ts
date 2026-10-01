import { startDrag } from '$lib/utils/drag';

// Both return false when the pointer can't be captured

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
