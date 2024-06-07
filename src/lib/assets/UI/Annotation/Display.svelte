<script lang="ts">
	import {
		isSvgShown,
		svgStroke,
		svgFill,
		currentFrameId,
		svgAlpha,
		svgFillSwitch,
		svgStrokeSwitch,
		minScale,
		maxScale,
		isEditing,
		pointerLockEnabled,
		scrollMultiplier,
		displayFrames,
		data,
		currentChangeIndex,
		blob_pngs
	} from '$lib/stores';
	import { type CellType } from '$lib/types';
	import { Mouse, isDown, isUp } from '$lib/utils/mouse';
	import {
		cellToPath,
		getPointerCoords,
		getPointerViewBoxCoords,
		ignoreContextMenu
	} from '$lib/utils/display';
	import { getFramesAtChangeIndex } from '$lib/utils/data';

	import ContextMenu from './ContextMenu.svelte';
	import EditorControls from './EditorControls.svelte';
	import Editor from './Editor.svelte';

	$: $displayFrames = getFramesAtChangeIndex($data, $currentChangeIndex);
	$currentChangeIndex = $data.changes.length - 1;

	let contextMenuComponent: ContextMenu;
	let editorComponent: Editor;
	let imageWrapperElement: HTMLDivElement;
	let svgElement: SVGSVGElement;

	let editorCell: CellType;

	const styles = {
		'scale-percent': 100,
		'translate-x': 0,
		'translate-y': 0,
		'image-top': 0,
		cursor: 'grab'
	};
	const stylesUnits = {
		'scale-percent': '%',
		'translate-x': 'px',
		'translate-y': 'px',
		'image-top': 'px',
		cursor: ''
	};

	$: cssVarStyles = Object.entries(styles)
		.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
		.join(';');

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

		// check if zooming makes sense
		if (styles['scale-percent'] === $minScale && e.deltaY > 0) return;
		if (styles['scale-percent'] === $maxScale && e.deltaY < 0) return;

		// hide context menu quickly
		contextMenuComponent.hide(false);

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
			if (isUp(Mouse.Primary, e.buttons)) return;
			if ($pointerLockEnabled) {
				imageWrapperElement.requestPointerLock();
				imageMouse.first = true;
			} else imageMouse.setPos(getPointerCoords(e));
			imageMouse.down = true;
			styles['cursor'] = 'grabbing';
		},
		mouseUp: (e: MouseEvent) => {
			if (editorComponent?.mouse.down) return editorComponent.mouse.mouseUp(e);
			if (isDown(Mouse.Primary, e.buttons)) return;
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
			if (editorComponent?.mouse.down) return editorComponent.mouse.mouseMove(e);
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
			// check if it's the first one (this is needed because the first move is either noise or just 0)
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
		if (editorComponent) {
			editorComponent.mouse.down = false;
			editorComponent.$$set({ hoverElementsShown: false });
		}
	};

	const displayMouseOver = () => {
		if (editorComponent) editorComponent.$$set({ hoverElementsShown: true });
	};

	const cellContextMenu = (e: MouseEvent) => {
		e.preventDefault();
		const cellId = parseInt((e.target as HTMLElement).id.replace('cell', ''));
		contextMenuComponent.$set({ cellId: cellId });
		editorCell = $displayFrames
			.find((f) => f.id == $currentFrameId)
			.cells.find((c) => c.id == cellId);
		const pos = getPointerCoords(e);
		pos.x -= imageWrapperElement.parentElement.getBoundingClientRect().left;
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
	on:contextmenu={ignoreContextMenu}
	on:mouseleave={displayMouseLeave}
	on:mouseenter={displayMouseOver}
	on:mouseup={imageMouse.mouseUp}
	on:mousemove={imageMouse.mouseMove}
	style={cssVarStyles}
>
	<div
		class="image-wrapper"
		role="presentation"
		on:wheel={imageWheel}
		on:mousedown={imageMouse.mouseDown}
		on:mousemove={imageMouse.mouseMove}
		bind:this={imageWrapperElement}
	>
		<img src={URL.createObjectURL($blob_pngs[$currentFrameId - 1])} alt="" class="zoomable" />

		{#if $isSvgShown}
			<svg
				viewBox="0 0 512 512"
				xmlns="http://www.w3.org/2000/svg"
				role="img"
				class="zoomable"
				on:contextmenu={ignoreContextMenu}
				bind:this={svgElement}
			>
				{#if !$isEditing}
					<g on:contextmenu={cellContextMenu} role="region">
						{#each $displayFrames.find((f) => f.id == $currentFrameId).cells as cell}
							<path
								id="cell{cell.id}"
								d={cellToPath(cell)}
								fill={$svgFillSwitch ? $svgFill : 'transparent'}
								stroke={$svgStrokeSwitch ? $svgStroke : 'none'}
								stroke-width="2px"
								opacity={$svgAlpha / 255}
							/>
						{/each}
					</g>
				{:else}
					<Editor
						inputCell={editorCell}
						bind:svgScalePercent={styles['scale-percent']}
						bind:svgElement
						{imageMouse}
						bind:this={editorComponent}
					/>
				{/if}
			</svg>
		{/if}
	</div>

	{#if $isEditing}
		<EditorControls {editorComponent} />
	{/if}

	<ContextMenu bind:this={contextMenuComponent} on:mousemove={null} />
</div>

<style>
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
		top: var(--image-top);
		position: absolute;
		object-fit: contain;
		width: 100%;
		height: 100%;
		height: var(--scale-percent);
		width: var(--scale-percent);
		transform: translate(var(--translate-x), var(--translate-y));
		transform-origin: center;
	}

	path {
		cursor: default;
	}
	path:hover {
		fill: #ff0000;
	}
</style>
