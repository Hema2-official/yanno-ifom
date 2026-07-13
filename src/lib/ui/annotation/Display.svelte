<script lang="ts">
	import { svgState } from '$lib/states/svg.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import type { TrackType } from '$lib/types/annotation.type';
	import { Mouse, isDown, isUp } from '$lib/utils/mouse';
	import {
		getPointerCoords,
		getPointerViewBoxCoords,
		toMeasurable,
		type Measurable
	} from '$lib/utils/display';
	import Cell from './Cell.svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import EditorControls from './EditorControls.svelte';
	import NewEditor from './NewEditor.svelte';
	import { rleToPolygons } from '$lib/utils/rle';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import { frameCache } from '$lib/states/FrameCache.svelte';
	import {
		colormapToRgbFunctions,
		getNormalizeFunctions,
		type RGBFuntions
	} from '$lib/utils/imaging';

	let colormapFilter = $derived(
		colormapToRgbFunctions(svgState.videoColormap, svgState.videoColormapShades)
	);

	let contextMenuOpen = $state(false);
	let contextMenuAnchor: Measurable | null = $state(null);
	let contextMenuCell: TrackType | null = $state.raw(null);

	let imageWrapperElement: HTMLDivElement | null = $state(null);
	let svgElement: SVGSVGElement;

	let styles = $state({
		'scale-percent': 100,
		'translate-x': 0,
		'translate-y': 0,
		'image-top': 0,
		cursor: 'grab'
	});

	$effect(() => {
		svgState.svgScalePercent = styles['scale-percent'];
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
		if (!imageWrapperElement) return;
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
		if (!e.ctrlKey) return;

		// check if zooming makes sense
		if (styles['scale-percent'] === zoomState.minScale && e.deltaY > 0) return;
		if (styles['scale-percent'] === zoomState.maxScale && e.deltaY < 0) return;

		// hide context menu
		contextMenuOpen = false;

		// find mouse pos
		const mouse = getPointerCoords(e);

		// adjust zoom (the bigger the scale, the faster the zoom)
		const oldScalePercent = styles['scale-percent'];
		styles['scale-percent'] = Math.max(
			zoomState.minScale,
			Math.min(
				zoomState.maxScale,
				zoomState.scrollMultiplier * e.deltaY * -0.001 * styles['scale-percent'] +
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
			if (!imageWrapperElement || !isDown(Mouse.Primary, e.buttons)) return;
			if (optionsState.pointerLockEnabled) {
				imageWrapperElement.requestPointerLock();
				imageMouse.first = true;
			} else imageMouse.setPos(getPointerCoords(e));
			imageMouse.down = true;
			styles['cursor'] = 'grabbing';
		},
		mouseUp: (e: MouseEvent) => {
			// if an editor tool owns the gesture, pass the event to it
			if (inputState.displayMouseUp !== null) return inputState.displayMouseUp(e);

			if (!isUp(Mouse.Primary, e.buttons)) return;
			if (optionsState.pointerLockEnabled) document.exitPointerLock();
			imageMouse.down = false;
			styles['cursor'] = 'grab';
		},
		mouseMove: (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			// Update viewbox coord values
			getPointerViewBoxCoords(e, svgElement);

			// if an editor tool owns the gesture, pass the event to it
			if (inputState.displayMouseMove !== null) return inputState.displayMouseMove(e);

			if (!imageMouse.down) return;
			if (styles['scale-percent'] === zoomState.minScale) return;
			if (optionsState.pointerLockEnabled) return imageMouse.mouseMoveLocked(e);

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
		inputState.displayMouseLeave?.(e);
		inputState.pointerOverDisplay = false;
	};

	const displayMouseEnter = () => {
		inputState.pointerOverDisplay = true;
	};

	const cellContextMenu = (e: MouseEvent, cell: TrackType) => {
		e.preventDefault();

		contextMenuCell = cell;
		contextMenuAnchor = toMeasurable(e);
		contextMenuOpen = true;
	};

	const startEditingCell = () => {
		if (!contextMenuCell) return;

		annotationState.currentFrameIndex = contextMenuCell.Frame;
		videoDisplayState.concurrentFrames = 1; // TODO: 3D editor
		editorState.startEditing(contextMenuCell);
	};

	const normalizeFilters = $derived.by(() => {
		const metadata = projectState.videoMetadata;
		if (!metadata) return [];
		return metadata.channels.map((_, i) => getNormalizeFunctions(metadata, i));
	});

	const gridCols = $derived(Math.ceil(Math.sqrt(videoDisplayState.concurrentFrames)));
	const gridRows = $derived(Math.ceil(videoDisplayState.concurrentFrames / gridCols));

	// Editing is only possible in single-frame mode
	const isEditorOpen = $derived(
		editorState.session !== null && videoDisplayState.concurrentFrames === 1
	);

	// Prefetch frames around the displayed window: all channels of the shown
	// frames (so channel toggles are instant), visible channels only for the
	// surrounding radius, forward-biased
	$effect(() => {
		const start = annotationState.currentFrameIndex;
		const count = videoDisplayState.concurrentFrames;
		const frameCount = projectState.frameCount;
		if (frameCount === 0) return;

		const channelVisibility = videoDisplayState.channels.map((c) => c.visible);
		const urls: string[] = [];
		const addFrame = (frameIndex: number, visibleChannelsOnly: boolean) => {
			if (frameIndex < 0 || frameIndex >= frameCount) return;
			channelVisibility.forEach((visible, channelIndex) => {
				if (visibleChannelsOnly && !visible) return;
				const url = projectState.getChannelFrameUrl(frameIndex, channelIndex);
				if (url) urls.push(url);
			});
		};

		for (let i = 0; i < count; i++) addFrame(start + i, false);
		for (let distance = 1; distance <= frameCache.prefetchRadius; distance++) {
			addFrame(start + count - 1 + distance, true);
			addFrame(start - distance, true);
		}

		frameCache.prefetch(urls);
	});

	$effect(() => {
		console.log(annotationState.data);
	});
</script>

{#snippet SVGFilter(id: string, functions: RGBFuntions)}
	<filter {id} color-interpolation-filters="sRGB">
		<feComponentTransfer>
			<feFuncR {...functions.r} />
			<feFuncG {...functions.g} />
			<feFuncB {...functions.b} />
		</feComponentTransfer>
	</filter>
{/snippet}

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
>
	<div class="image-wrapper" role="presentation" bind:this={imageWrapperElement}>
		<svg
			viewBox="{svgState.svgViewBox.minX} {svgState.svgViewBox.minY} {svgState.svgViewBox
				.width * gridCols} {svgState.svgViewBox.height * gridRows}"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			class="zoomable annotation-svg"
			bind:this={svgElement}
			opacity={svgState.isSvgShown ? svgState.svgAlpha / 255 : 0}
		>
			{@render SVGFilter('colormap-f', colormapFilter)}
			{#each normalizeFilters as functions, channelIndex (channelIndex)}
				{@render SVGFilter(`normalize-f-${channelIndex}`, functions)}
			{/each}

			{#each { length: videoDisplayState.concurrentFrames }, gridIndex (gridIndex)}
				{@const frameIndex = annotationState.currentFrameIndex + gridIndex}
				{@const vb = svgState.svgViewBox}
				<svg
					x={(gridIndex % gridCols) * vb.width}
					y={Math.floor(gridIndex / gridCols) * vb.height}
					width={vb.width}
					height={vb.height}
					viewBox="{vb.minX} {vb.minY} {vb.width} {vb.height}"
				>
					{#each videoDisplayState.channels as channel, channelIndex (channelIndex)}
						{@const url = channel.visible
							? projectState.getChannelFrameUrl(frameIndex, channelIndex)
							: null}
						{@const href = url ? frameCache.getUrl(url) : null}
						{#if href}
							<image
								{href}
								width={vb.width}
								height={vb.height}
								opacity={channel.opacity / 100}
								filter="{svgState.normalizeSwitch && normalizeFilters[channelIndex]
									? `url(#normalize-f-${channelIndex})`
									: ''} {svgState.colormapSwitch ? 'url(#colormap-f)' : ''}"
							/>
						{/if}
					{/each}

					{#if isEditorOpen && editorState.session}
						<NewEditor session={editorState.session} />
					{:else}
						<g role="region">
							{#each annotationState.getFrame(frameIndex) ?? [] as object (object.ObjectID)}
								<Cell
									cellPolygons={rleToPolygons(object.SegmentationRLE)}
									cellId={object.ObjectID}
									onContextMenu={(e) => cellContextMenu(e, object)}
								/>
							{/each}
						</g>
					{/if}
				</svg>
			{/each}
		</svg>
	</div>

	<ContextMenu.Root bind:open={contextMenuOpen}>
		<ContextMenu.Content class="w-52" customAnchor={contextMenuAnchor} preventScroll={false}>
			<ContextMenu.Label class="text-center font-bold">
				Cell #{contextMenuCell?.ObjectID}
			</ContextMenu.Label>
			<ContextMenu.Separator />
			<ContextMenu.Item inset onSelect={startEditingCell}>Edit</ContextMenu.Item>
			<ContextMenu.Item inset disabled>Delete</ContextMenu.Item>
			<ContextMenu.Item inset disabled>Rename</ContextMenu.Item>
		</ContextMenu.Content>
	</ContextMenu.Root>

	{#if isEditorOpen}
		<EditorControls />
	{/if}
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

	:global(.image-wrapper) {
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
		min-width: var(--scale-percent);
		transform: translate(var(--translate-x), var(--translate-y));
		transform-origin: center;
		object-fit: contain;
	}

	.annotation-svg {
		user-select: none;
	}
</style>
