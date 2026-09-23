<script lang="ts">
	import { watch } from 'runed';
	import { svgState } from '$lib/states/svg.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import {
		videoDisplayState,
		type ChannelDisplaySettings
	} from '$lib/states/VideoDisplayState.svelte';
	import { frameCache } from '$lib/states/FrameCache.svelte';
	import { getPointerViewBoxCoords, toMeasurable, type Measurable } from '$lib/utils/display';
	import {
		colormapToRgbFunctions,
		getAdjustFunctions,
		getNormalizeFunctions,
		type RGBFuntions
	} from '$lib/utils/imaging';
	import { rleToPolygons } from '$lib/utils/rle';
	import type { TrackType } from '$lib/types/annotation.type';
	import { toolRegistry } from '$lib/ui/editor-tools/registry';
	import Cell from './Cell.svelte';
	import DisplayContextMenu, { type DisplayTarget } from './DisplayContextMenu.svelte';
	import EditorToolbar from './EditorToolbar.svelte';

	// The current tool is mounted in every frame tile, always
	const Tool = $derived(toolRegistry[editorState.tool].component);

	let contextMenu = $state.raw<{ anchor: Measurable; target: DisplayTarget } | null>(null);

	// Switching tools or changing the data (by shortcut, toolbar or keyboard) closes the menu
	watch([() => editorState.tool, () => annotationState.data], () => {
		contextMenu = null;
	});

	let imageWrapperElement: HTMLDivElement | null = $state(null);
	let svgElement: SVGSVGElement;

	// Zoom and pan of the frame grid
	let scalePercent = $state(100);
	let translateX = $state(0);
	let translateY = $state(0);
	let imageTop = $state(0);

	$effect(() => {
		svgState.svgScalePercent = scalePercent;
	});

	const vb = $derived(svgState.svgViewBox);
	const gridCols = $derived(Math.ceil(Math.sqrt(videoDisplayState.concurrentFrames)));
	const gridRows = $derived(Math.ceil(videoDisplayState.concurrentFrames / gridCols));

	const colormapFilter = $derived(
		colormapToRgbFunctions(svgState.videoColormap, svgState.videoColormapShades)
	);
	const normalizeFilters = $derived.by(() => {
		const metadata = projectState.videoMetadata;
		if (!metadata) return [];
		return metadata.channels.map((_, i) => getNormalizeFunctions(metadata, i));
	});

	/** A channel's image goes through the normalization, its adjustments, then the colormap. */
	const channelFilter = (channel: ChannelDisplaySettings, channelIndex: number) => {
		let filter = '';
		if (svgState.normalizeSwitch && normalizeFilters[channelIndex])
			filter += `url(#normalize-f-${channelIndex}) `;
		if (channel.isAdjusted) filter += `url(#adjust-f-${channelIndex}) `;
		if (svgState.colormapSwitch) filter += 'url(#colormap-f) ';
		return filter.trim();
	};

	const cellLabel = (cell: TrackType): string | null => {
		if (!svgState.labelSwitch) return null;
		return String(cell[svgState.labelKey] ?? '');
	};

	const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

	/** Pans by the given screen pixels, keeping the frame grid within the display. */
	const movePixels = (x: number, y: number) => {
		if (!imageWrapperElement) return;
		const { clientWidth, clientHeight } = imageWrapperElement;
		const scale = scalePercent / 100;

		// The svg's box is the display scaled, with the grid letterboxed inside it
		const aspect = (vb.width * gridCols) / (vb.height * gridRows);
		const gridWidth = Math.min(clientWidth, clientHeight * aspect) * scale;
		const gridHeight = gridWidth / aspect;

		translateX = clamp(x + translateX, Math.max(0, (gridWidth - clientWidth) / 2));
		translateY = clamp(y + translateY, Math.max(0, (gridHeight - clientHeight) / 2));
		imageTop = -(clientHeight * (scale - 1)) / 2;
	};

	// A grid change can leave the translation out of range
	watch([() => gridCols, () => gridRows], () => movePixels(0, 0));

	const imageWheel = (e: WheelEvent) => {
		e.preventDefault();
		if (!e.ctrlKey) return; // plain wheel is left to the tools

		const oldScale = scalePercent;
		const newScale = Math.max(
			zoomState.minScale,
			Math.min(
				zoomState.maxScale,
				oldScale * (1 - zoomState.scrollMultiplier * e.deltaY * 0.001)
			)
		);
		if (newScale === oldScale) return;
		contextMenu = null;
		scalePercent = newScale;

		// Keep the point under the pointer in place
		const { width, height, top, left } = svgElement.getBoundingClientRect();
		const scaleDiff = newScale / oldScale - 1;
		movePixels(
			(width / 2 - e.clientX + left) * scaleDiff,
			(height / 2 - e.clientY + top) * scaleDiff
		);
	};

	// `travel` is how far the pointer moved during the gesture: a press that
	// stays within the slop was a click, anything more was a pan
	const CLICK_SLOP = 4;
	let isPanning = $state(false);
	const pan = {
		pointerId: -1,
		prevX: 0,
		prevY: 0,
		travel: 0,
		locked: false,
		first: true
	};

	/** The selection change a primary press implies, applied only if it turns out to be a click. */
	let pendingSelection: (() => void) | null = null;

	/** Keeps the pointer record in sync: which frame tile is under the pointer, and where. */
	const updatePointer = (e: PointerEvent) => {
		const tile =
			e.target instanceof Element
				? e.target.closest<SVGSVGElement>('svg[data-frame-index]')
				: null;
		inputState.pointer = tile
			? { frameIndex: Number(tile.dataset.frameIndex), ...getPointerViewBoxCoords(e, tile) }
			: null;
	};

	const startPan = (e: PointerEvent) => {
		if (!imageWrapperElement) return;

		isPanning = true;
		pan.pointerId = e.pointerId;
		pan.travel = 0;
		imageWrapperElement.setPointerCapture(e.pointerId);

		if (optionsState.pointerLockEnabled && e.button === 0) {
			imageWrapperElement.requestPointerLock();
			pan.locked = true;
			pan.first = true;
		} else {
			pan.locked = false;
			pan.prevX = e.clientX;
			pan.prevY = e.clientY;
		}
	};

	const endPan = (e: PointerEvent) => {
		if (!isPanning || e.pointerId !== pan.pointerId) return;
		isPanning = false;
		pendingSelection = null;
		if (imageWrapperElement?.hasPointerCapture(e.pointerId)) {
			imageWrapperElement.releasePointerCapture(e.pointerId);
		}
		if (pan.locked) {
			document.exitPointerLock();
			pan.locked = false;
		}
	};

	// Tools claim the primary-button gestures they want and stop their
	// propagation, so what arrives here selects and pans
	const displayPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 && e.button !== 1) return;
		// Cancel the default so the middle button doesn't start autoscroll
		if (e.button === 1) e.preventDefault();

		// A click with the primary button selects the cell under it (Ctrl
		// toggles) or clears the selection on the background; a drag pans and
		// leaves the selection alone, so the change waits for the release.
		pendingSelection = null;
		if (e.button === 0) {
			const target = targetAt(e);
			const additive = e.ctrlKey || e.metaKey;
			if (target?.kind === 'cell') {
				const { cell } = target;
				pendingSelection = () =>
					additive ? editorState.toggle(cell) : editorState.select(cell);
			} else if (!additive) {
				pendingSelection = () => editorState.clearSelection();
			}
		}

		startPan(e);
	};

	const displayPointerMove = (e: PointerEvent) => {
		updatePointer(e);

		if (!isPanning || e.pointerId !== pan.pointerId) return;

		let deltaX: number;
		let deltaY: number;
		if (pan.locked) {
			// The first move is either noise or just 0
			if (pan.first) {
				if (!document.pointerLockElement) return;
				pan.first = false;
				return;
			}
			deltaX = e.movementX;
			deltaY = e.movementY;
		} else {
			deltaX = e.clientX - pan.prevX;
			deltaY = e.clientY - pan.prevY;
			pan.prevX = e.clientX;
			pan.prevY = e.clientY;
		}

		pan.travel += Math.abs(deltaX) + Math.abs(deltaY);
		// There is nothing to pan while the whole grid fits
		if (scalePercent > zoomState.minScale) movePixels(deltaX, deltaY);
	};

	const displayPointerUp = (e: PointerEvent) => {
		updatePointer(e);
		if (isPanning && e.pointerId === pan.pointerId && pan.travel <= CLICK_SLOP) {
			pendingSelection?.();
		}
		endPan(e);
	};

	/** The cell or the frame tile under a client position, looking through the tools' own elements. */
	const targetAt = ({
		clientX,
		clientY
	}: {
		clientX: number;
		clientY: number;
	}): DisplayTarget | null => {
		const elements = document.elementsFromPoint(clientX, clientY);
		const closest = (selector: string) =>
			elements
				.map((element) => element.closest(selector))
				.find((element) => element !== null) ?? null;

		const cell = annotationState.getCell(
			closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? ''
		);
		if (cell) return { kind: 'cell', cell };

		const tile = closest('svg[data-frame-index]');
		return tile
			? { kind: 'background', frameIndex: Number(tile.getAttribute('data-frame-index')) }
			: null;
	};

	const handleContextMenu = (e: MouseEvent) => {
		e.preventDefault(); // never the browser's menu over the display
		const target = targetAt(e);
		if (!target) return;

		// The items act on the whole selection when the clicked cell is part of it
		if (target.kind === 'cell' && !editorState.isSelected(target.cell)) {
			editorState.select(target.cell);
		}
		contextMenu = { anchor: toMeasurable(e), target };
	};

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
	oncontextmenu={handleContextMenu}
	onpointerleave={() => (inputState.pointer = null)}
	onpointerup={displayPointerUp}
	onpointercancel={endPan}
	onpointermove={displayPointerMove}
	onpointerdown={displayPointerDown}
	onwheel={imageWheel}
>
	<div
		class="image-wrapper"
		role="presentation"
		style:cursor={isPanning ? 'grabbing' : 'grab'}
		bind:this={imageWrapperElement}
	>
		<svg
			viewBox="{vb.minX} {vb.minY} {vb.width * gridCols} {vb.height * gridRows}"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			class="zoomable annotation-svg"
			style:top="{imageTop}px"
			style:width="{scalePercent}%"
			style:height="{scalePercent}%"
			style:transform="translate({translateX}px, {translateY}px)"
			bind:this={svgElement}
			opacity={svgState.isSvgShown ? svgState.svgAlpha / 255 : 0}
		>
			{@render SVGFilter('colormap-f', colormapFilter)}
			{#each normalizeFilters as functions, channelIndex (channelIndex)}
				{@render SVGFilter(`normalize-f-${channelIndex}`, functions)}
			{/each}
			{#each videoDisplayState.channels as channel, channelIndex (channelIndex)}
				{#if channel.isAdjusted}
					{@render SVGFilter(
						`adjust-f-${channelIndex}`,
						getAdjustFunctions(channel.brightness, channel.contrast, channel.gamma)
					)}
				{/if}
			{/each}

			{#each { length: videoDisplayState.concurrentFrames }, gridIndex (gridIndex)}
				{@const frameIndex = annotationState.currentFrameIndex + gridIndex}
				<svg
					x={(gridIndex % gridCols) * vb.width}
					y={Math.floor(gridIndex / gridCols) * vb.height}
					width={vb.width}
					height={vb.height}
					viewBox="{vb.minX} {vb.minY} {vb.width} {vb.height}"
					data-frame-index={frameIndex}
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
								opacity={channel.opacity}
								filter={channelFilter(channel, channelIndex)}
							/>
						{/if}
					{/each}

					<g role="region">
						{#each annotationState.getFrame(frameIndex) ?? [] as object (object.ObjectID)}
							<Cell
								cellPolygons={rleToPolygons(object.SegmentationRLE)}
								cellId={object.ObjectID}
								label={cellLabel(object)}
								selected={editorState.isSelected(object)}
							/>
						{/each}
					</g>

					{#if Tool}
						<Tool
							{frameIndex}
							cells={editorState.selectedByFrame.get(frameIndex) ?? []}
						/>
					{/if}
				</svg>
			{/each}
		</svg>
	</div>

	<DisplayContextMenu
		open={contextMenu !== null}
		anchor={contextMenu?.anchor ?? null}
		target={contextMenu?.target ?? null}
		onClose={() => (contextMenu = null)}
	/>

	<EditorToolbar />
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
	}

	// The display scaled by the zoom; the frame grid is letterboxed inside it
	.zoomable {
		position: absolute;
		transform-origin: center;
	}

	.annotation-svg {
		user-select: none;
	}
</style>
