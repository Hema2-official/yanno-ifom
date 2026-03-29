<script lang="ts">
	import { isSvgShown, svgAlpha, svgScalePercent, svgViewBox } from '$lib/stores/svg';
	import { minScale, maxScale, scrollMultiplier } from '$lib/stores/zoom';
	import { blob_pngs } from '$lib/stores/images';
	import {
		annotation,
		currentChangeIndex,
		currentFrameId,
		displayFrames
	} from '$lib/stores/data';
	import { hoverElementsShown, isEditing } from '$lib/stores/editor';
	import { pointerLockEnabled } from '$lib/stores/options';
	import type { NewCellType } from '$lib/types/annotation.type';
	import { Mouse, isDown, isUp } from '$lib/utils/mouse';
	import { getPointerCoords, getPointerViewBoxCoords } from '$lib/utils/display';
	import { getFramesAtChangeIndex } from '$lib/utils/data';

	import Cell from './Cell.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import EditorControls from './EditorControls.svelte';
	import {
		modifierKeys,
		_updateModifierKeys,
		displayMouseMoveHandler,
		displayMouseUpHandler,
		displayMouseLeaveHandler
	} from '$lib/stores/input';
	import { P } from '$lib/utils/pattern';
	import NewEditor from './NewEditor.svelte';

	$effect(() => {
		$displayFrames = getFramesAtChangeIndex($annotation, $currentChangeIndex);
	});
	$currentChangeIndex = $annotation.changes.length - 1;

	let contextMenuComponent: ContextMenu = $state(undefined as any);
	let editorComponent: NewEditor = $state(undefined as any);
	let displayContainerElement: HTMLDivElement;
	let imageWrapperElement: HTMLDivElement = $state(undefined as any);
	let svgElement: SVGSVGElement;

	let editorCell: NewCellType = $state(undefined as any);

	let styles = $state({
		'scale-percent': 100,
		'translate-x': 0,
		'translate-y': 0,
		'image-top': 0,
		cursor: 'grab'
	});
	$effect(() => {
		$svgScalePercent = styles['scale-percent'];
	});

	const stylesUnits: { [key: string]: number | string } = {
		'scale-percent': '%',
		'translate-x': 'px',
		'translate-y': 'px',
		'image-top': 'px',
		cursor: ''
	};

	let cssVarStyles = $derived(
		Object.entries(styles)
			.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
			.join(';')
	);

	const movePixels = (x: number, y: number) => {
		const scale = styles['scale-percent'] / 100;
		const scaledWidth = imageWrapperElement.clientWidth * scale;
		const scaledHeight = imageWrapperElement.clientHeight * scale;
		const offsetX = (Math.min(scaledHeight, scaledWidth) - imageWrapperElement.clientWidth) / 2;
		const offsetY =
			(Math.min(scaledHeight, scaledWidth) - imageWrapperElement.clientHeight) / 2;
		styles['translate-x'] =
			scaledHeight >= imageWrapperElement.clientWidth
				? Math.max(-offsetX, Math.min(offsetX, x + styles['translate-x']))
				: 0;
		styles['translate-y'] =
			scaledWidth >= imageWrapperElement.clientHeight
				? Math.max(-offsetY, Math.min(offsetY, y + styles['translate-y']))
				: 0;
		styles['image-top'] = -(scaledHeight - imageWrapperElement.clientHeight) / 2;
	};

	const imageWheel = (e: WheelEvent) => {
		e.preventDefault();

		// require ctrl key
		_updateModifierKeys(e);
		if (!$modifierKeys.ctrl) return;

		// check if zooming makes sense
		if (styles['scale-percent'] === $minScale && e.deltaY > 0) return;
		if (styles['scale-percent'] === $maxScale && e.deltaY < 0) return;

		// hide context menu quickly
		contextMenuComponent?.hide(false);

		// find mouse pos
		const mouse = getPointerCoords(e);

		// adjust zoom (the bigger the scale, the faster the zoom)
		const oldScalePercent = styles['scale-percent'];
		styles['scale-percent'] = Math.max(
			$minScale,
			Math.min(
				$maxScale,
				$scrollMultiplier * e.deltaY * -0.001 * styles['scale-percent'] +
					styles['scale-percent']
			)
		);

		// adjust translate
		const { width, height, top, left } = svgElement.getBoundingClientRect();
		const scaleDiff = styles['scale-percent'] / 100 / (oldScalePercent / 100) - 1;
		const distanceX = (width / 2 - mouse.x + left) * scaleDiff;
		const distanceY = (height / 2 - mouse.y + top) * scaleDiff;
		movePixels(distanceX, distanceY);
	};

	const imageMouse = {
		prevX: 0,
		prevY: 0,
		down: false,
		first: true,
		setPos: (pos: { x: number; y: number }) => {
			imageMouse.prevX = pos.x;
			imageMouse.prevY = pos.y;
		},
		mouseDown: (e: MouseEvent) => {
			if (!isDown(Mouse.Primary, e.buttons)) return;
			if ($pointerLockEnabled) {
				imageWrapperElement.requestPointerLock();
				imageMouse.first = true;
			} else imageMouse.setPos(getPointerCoords(e));
			imageMouse.down = true;
			styles['cursor'] = 'grabbing';
		},
		mouseUp: (e: MouseEvent) => {
			if ($displayMouseUpHandler !== null) return $displayMouseUpHandler(e);
			// if (editorComponent?.mouse.down) return editorComponent.mouse.mouseUp(e);

			if (!isUp(Mouse.Primary, e.buttons)) return;
			if ($pointerLockEnabled) document.exitPointerLock();
			imageMouse.down = false;
			styles['cursor'] = 'grab';
		},
		mouseMove: (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			// Update viewbox coord values
			getPointerViewBoxCoords(e, svgElement);

			// if editor has the cursor, pass the event to it
			if ($displayMouseMoveHandler !== null) return $displayMouseMoveHandler(e);
			// if (editorComponent?.mouse.down) return editorComponent.mouse.mouseMove(e);

			if (!imageMouse.down) return;
			if (styles['scale-percent'] === $minScale) return;
			if ($pointerLockEnabled) return imageMouse.mouseMoveLocked(e);

			// find mouse pos
			const mouse = getPointerCoords(e);

			// adjust translate
			movePixels(mouse.x - imageMouse.prevX, mouse.y - imageMouse.prevY);

			// update prev
			imageMouse.prevX = mouse.x;
			imageMouse.prevY = mouse.y;
		},
		mouseMoveLocked: (e: MouseEvent) => {
			// check if this is the first move (cuz then it's either noise or just 0)
			if (imageMouse.first) {
				// check lock
				if (!document.pointerLockElement) return;
				// reset
				imageMouse.first = false;
				return;
			}
			// adjust translate
			movePixels(e.movementX, e.movementY);
		}
	};

	const displayMouseLeave = (e: MouseEvent) => {
		e.preventDefault();
		imageMouse.down = false;
		styles['cursor'] = 'grab';
		if ($displayMouseLeaveHandler !== null) $displayMouseLeaveHandler(e);
		// if (editorComponent) {
		// 	editorComponent.mouse.down = false;
		// }
		$hoverElementsShown = false;
	};

	const displayMouseEnter = () => {
		// if (editorComponent)
		$hoverElementsShown = true;
	};

	const cellContextMenu = (e: MouseEvent) => {
		e.preventDefault();

		const target = e.target as HTMLElement;

		const [cellId] = P('cell#-body#').match(target.id);

		contextMenuComponent?.$set({ cellId });
		const targetCell = $displayFrames
			.find((f) => f.id == $currentFrameId)
			?.cells.find((c) => c.id == cellId);

		if (!targetCell) {
			console.warn('Cell not found');
			return;
		}

		editorCell = targetCell;
		const pos = getPointerCoords(e);
		const displayBounds = displayContainerElement.getBoundingClientRect();
		pos.x -= displayBounds.left;
		pos.y -= displayBounds.top;
		contextMenuComponent.show(pos);
	};

	// let svg = frameToSvg(1);

	// const edit = () => {
	// 	contextMenuComponent.hide(false);
	// 	$isEditing = true;
	// };
</script>

<div
	class="display-container"
	role="presentation"
	oncontextmenu={(e) => e.preventDefault()}
	onmouseleave={displayMouseLeave}
	onmouseenter={displayMouseEnter}
	onmouseup={imageMouse.mouseUp}
	onmousemove={imageMouse.mouseMove}
	onmousedown={imageMouse.mouseDown}
	onwheel={imageWheel}
	style={cssVarStyles}
	bind:this={displayContainerElement}
>
	<div class="image-wrapper" role="presentation" bind:this={imageWrapperElement}>
		<img src={URL.createObjectURL($blob_pngs[$currentFrameId - 1])} alt="" class="zoomable" />

		<svg
			viewBox="{$svgViewBox.minX} {$svgViewBox.minY} {$svgViewBox.width} {$svgViewBox.height}"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			class="zoomable annotation-svg"
			oncontextmenu={(e) => e.preventDefault()}
			bind:this={svgElement}
			opacity={$isSvgShown ? $svgAlpha / 255 : 0}
		>
			<!-- <image
				xlink:href={URL.createObjectURL($blob_pngs[$currentFrameId - 1])}
				width="512"
				height="512"
			/> -->

			{#if !$isEditing}
				<g oncontextmenu={cellContextMenu} role="region">
					{#each $displayFrames.find((f) => f.id == $currentFrameId)?.cells ?? [] as cell}
						<Cell {cell} />
					{/each}
				</g>
			{:else}
				<NewEditor inputCell={editorCell} bind:this={editorComponent} />
			{/if}
		</svg>
	</div>

	{#if $isEditing}
		<EditorControls {editorComponent} />
	{/if}

	<ContextMenu bind:this={contextMenuComponent} onmousemove={null} />
</div>

<style lang="scss">
	.display-container {
		position: relative;
		display: flex;
		flex-direction: row;
		align-items: center;
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		background-color: var(--empty-background-color);
		overflow: hidden;
	}

	.image-wrapper {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		cursor: var(--cursor);
	}

	.zoomable {
		position: absolute;
		top: var(--image-top);
		height: var(--scale-percent);
		width: var(--scale-percent);
		transform: translate(var(--translate-x), var(--translate-y));
		transform-origin: center;
		object-fit: contain;
	}

	.annotation-svg {
		user-select: none;
	}
</style>
