<script lang="ts">
	import { getAbortSignal, onDestroy } from 'svelte';
	import { watch } from 'runed';
	import { svgState } from '$lib/states/svg.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { videoDisplayState, type StackAngles } from '$lib/states/VideoDisplayState.svelte';
	import { frameCache } from '$lib/states/FrameCache.svelte';
	import { frameSnapshots } from '$lib/states/FrameSnapshots.svelte';
	import { frameTileAt, toMeasurable, type ClientPoint } from '$lib/utils/display';
	import { gridLayout, placeTiles, stackLayout } from '$lib/utils/layout';
	import { clamp } from '$lib/utils/math';
	import { toolRegistry } from '$lib/ui/editor-tools/registry';
	import DisplayContextMenu, {
		type DisplayMenu,
		type DisplayTarget
	} from './DisplayContextMenu.svelte';
	import DisplayDefs from './DisplayDefs.svelte';
	import EditorToolbar from './EditorToolbar.svelte';
	import FrameAnnotation from './FrameAnnotation.svelte';
	import FrameImages from './FrameImages.svelte';
	import FrameTile from './FrameTile.svelte';
	import HoverHighlight from './HoverHighlight.svelte';
	import StandInCanvas from './StandInCanvas.svelte';
	import { startPan, startTurn } from './gestures';

	// The current tool is mounted in every frame tile, when editing is on
	const Tool = $derived(projectState.readOnly ? null : toolRegistry[editorState.tool].component);

	let contextMenu = $state.raw<DisplayMenu | null>(null);

	// Switching tools or changing the data closes the menu
	watch([() => editorState.tool, () => annotationState.data], () => {
		contextMenu = null;
	});

	let viewportElement: HTMLDivElement;
	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	let stageElement: HTMLDivElement;
	let stageWidth = $state(0);
	let stageHeight = $state(0);

	// The pan, in screen pixels
	let translateX = $state(0);
	let translateY = $state(0);

	const vb = $derived(svgState.svgViewBox);
	const isStack = $derived(videoDisplayState.displayMode.current === 'stack');

	let rightDown = $state(false);
	/** Flag to show pre-baked images while turning. */
	const armed = $derived(isStack && rightDown);

	const layoutAt = (angles: StackAngles) => {
		const count = videoDisplayState.concurrentFrames;
		if (!isStack) return gridLayout(count, vb.width, vb.height);
		return stackLayout(count, vb.width, vb.height, {
			...angles,
			spacing: videoDisplayState.stackSpacing.current,
			fade: videoDisplayState.stackFade.current
		});
	};
	const layout = $derived(layoutAt(videoDisplayState.stackAngles));
	const aspect = $derived(layout.viewBox.width / layout.viewBox.height);
	const placement = $derived(placeTiles(layout, stageWidth, stageHeight));

	// The hidden svg tiles wait where the turn began, so Firefox redraws them only on release
	const restingMatrices = $derived.by(() => {
		if (!videoDisplayState.isTurning) return placement.matrices;
		const resting = layoutAt(videoDisplayState.restingAngles);
		return placeTiles(resting, stageWidth, stageHeight).matrices;
	});

	const annotationOpacity = $derived(
		svgState.isAnnotationShown && !keybindings.isHeld('display.hideAnnotation')
			? svgState.annotationOpacity.current
			: 0
	);

	/** The shown frames, by their offset in the window. */
	const shownFrames = $derived(
		Array.from(
			{ length: videoDisplayState.concurrentFrames },
			(_, offset) => annotationState.currentFrameIndex + offset
		)
	);

	// Bake the shown frames while the stack stands still, ready for a turn
	$effect(() => {
		if (!isStack) {
			frameSnapshots.clear();
			return;
		}
		if (videoDisplayState.isTurning) return;
		frameSnapshots.prepare(shownFrames, getAbortSignal());
	});
	onDestroy(() => frameSnapshots.clear());

	/** The shown frames' baked images from the right press on, null where one isn't ready. */
	const imageSnapshots = $derived(
		armed ? shownFrames.map((frameIndex) => frameSnapshots.get(frameIndex)) : []
	);

	// The stand-in canvas covers the viewport, with the stage centred in it, then panned
	const standInView = $derived({
		width: viewportWidth,
		height: viewportHeight,
		ratio: devicePixelRatio,
		x: (viewportWidth - stageWidth) / 2 + translateX,
		y: (viewportHeight - stageHeight) / 2 + translateY
	});

	/** Pans by screen pixels, as far as the frames reach past the display. */
	const panBy = (deltaX: number, deltaY: number) => {
		const { clientWidth, clientHeight } = viewportElement;
		const scale = zoomState.scalePercent / 100;

		// The stage is the display zoomed, with the layout letterboxed inside it
		const layoutWidth = Math.min(clientWidth, clientHeight * aspect) * scale;
		const layoutHeight = layoutWidth / aspect;
		const reachX = Math.max(0, (layoutWidth - clientWidth) / 2);
		const reachY = Math.max(0, (layoutHeight - clientHeight) / 2);

		translateX = clamp(translateX + deltaX, -reachX, reachX);
		translateY = clamp(translateY + deltaY, -reachY, reachY);
	};

	// A layout change can leave the pan out of range
	watch([() => aspect], () => panBy(0, 0));

	const MAX_ZOOM_DELTA = 10;

	const displayWheel = (e: WheelEvent) => {
		e.preventDefault();
		if (!e.ctrlKey) return; // plain wheel is left to the tools

		const delta = clamp(e.deltaY, -MAX_ZOOM_DELTA, MAX_ZOOM_DELTA);
		const rate = zoomState.scrollMultiplier.current * 0.01;

		const oldScale = zoomState.scalePercent;
		const newScale = clamp(
			oldScale * Math.exp(-delta * rate),
			zoomState.minScale,
			zoomState.maxScale
		);
		if (newScale === oldScale) return;
		contextMenu = null;
		zoomState.scalePercent = newScale;

		// Keep the point under the pointer in place
		const { width, height, top, left } = stageElement.getBoundingClientRect();
		const scaleDiff = newScale / oldScale - 1;
		panBy(
			(width / 2 - e.clientX + left) * scaleDiff,
			(height / 2 - e.clientY + top) * scaleDiff
		);
	};

	let isPanning = $state(false);

	const TURN_DEGREES_PER_PIXEL = 0.3;

	/** The menu of a right press still held, opened on release unless it became a drag. */
	let pendingMenu: MouseEvent | null = null;
	// A turn's end swallows a context menu opened on rmb release
	let menuSwallowed = false;

	const updatePointer = (e: PointerEvent) => {
		if (!videoDisplayState.isTurning) inputState.pointer = frameTileAt(stageElement, e);
	};

	/** The cell under the pointer, by the tile that drew it. */
	let hovered = $state.raw<{ id: string; frameIndex: number } | null>(null);

	const hoverAt = (e: PointerEvent) => {
		const target = e.target as Element;
		const id = target.closest('[data-cell-id]')?.getAttribute('data-cell-id');
		const tile = target.closest<SVGSVGElement>('svg[data-frame-index]');
		hovered = id && tile ? { id, frameIndex: Number(tile.dataset.frameIndex) } : null;
	};

	// Drawn outside the tiles: a change inside one makes Firefox repaint the stack (see CLAUDE.md)
	const highlight = $derived.by(() => {
		if (!hovered || videoDisplayState.isTurning) return null;
		const cell = annotationState.getCell(hovered.id);
		const offset = hovered.frameIndex - annotationState.currentFrameIndex;
		if (!cell || offset < 0 || offset >= placement.matrices.length) return null;
		return { cell, matrix: placement.matrices[offset] };
	});

	/** What a click there does to the selection, if anything. */
	const clickAt = (e: PointerEvent): (() => void) | null => {
		const target = targetAt(e);
		const range = keybindings.isActive('selection.range', e);
		const additive = range || keybindings.isActive('selection.add', e);
		if (target?.kind !== 'cell') return additive ? null : () => editorState.clearSelection();

		const { cell } = target;
		if (range) return () => editorState.selectRange(cell);
		if (additive) return () => editorState.toggle(cell);
		return () => editorState.select(cell);
	};

	// This decides whether to turn or click
	const turnFrom = (press: PointerEvent) => {
		rightDown = startTurn(viewportElement, press, {
			canTurn: () => isStack, // Only stacks can be turned
			onTurn: (deltaX, deltaY) => {
				contextMenu = null;
				videoDisplayState.turnStack(
					-deltaX * TURN_DEGREES_PER_PIXEL,
					deltaY * TURN_DEGREES_PER_PIXEL
				);
			},
			onEnd: (turned, e) => {
				rightDown = false;
				// A click that began turning leaves the stack as it was
				if (turned) videoDisplayState.endTurn();
				else videoDisplayState.cancelTurn();

				const menu = pendingMenu;
				pendingMenu = null;
				if (turned) menuSwallowed = true;
				else if (menu && e.type === 'pointerup') openContextMenu(menu);
			}
		});
	};

	// Decide between messing with the selection and panning the viewport
	const panFrom = (press: PointerEvent) => {
		const click = press.button === 0 ? clickAt(press) : null;
		isPanning = startPan(viewportElement, press, {
			locked: optionsState.pointerLockEnabled.current && press.button === 0,
			onPan: (deltaX, deltaY) => {
				// There is nothing to pan while the whole layout fits
				if (zoomState.scalePercent > zoomState.minScale) panBy(deltaX, deltaY);
			},
			onEnd: (wasClick) => {
				isPanning = false;
				if (wasClick) click?.();
			}
		});
	};

	// Tools claim the primary-button gestures they want and stop their
	// propagation, so what arrives here selects, pans and turns
	const displayPointerDown = (e: PointerEvent) => {
		if (isPanning || rightDown) return;
		menuSwallowed = false;
		// The middle button would start autoscroll
		if (e.button === 1) e.preventDefault();

		if (e.button === 2) turnFrom(e);
		else if (e.button <= 1) panFrom(e);
	};

	/** The cell or the frame tile under a client position, looking through the tools' own elements. */
	const targetAt = (point: ClientPoint): DisplayTarget | null => {
		for (const element of document.elementsFromPoint(point.clientX, point.clientY)) {
			const id = element.closest('[data-cell-id]')?.getAttribute('data-cell-id');
			const cell = id ? annotationState.getCell(id) : undefined;
			if (cell) return { kind: 'cell', cell };
		}

		const tile = frameTileAt(stageElement, point);
		return tile ? { kind: 'background', frameIndex: tile.frameIndex } : null;
	};

	const handleContextMenu = (e: MouseEvent) => {
		e.preventDefault(); // never the browser's menu over the display
		// Some systems ask on the press, which may still become a drag
		if (rightDown) {
			pendingMenu = e;
			return;
		}
		if (menuSwallowed) {
			menuSwallowed = false;
			return;
		}
		openContextMenu(e);
	};

	const openContextMenu = (e: MouseEvent) => {
		const target = targetAt(e);
		if (!target) return;

		// The items act on the whole selection when the clicked cell is part of it
		if (target.kind === 'cell' && !editorState.isSelected(target.cell)) {
			editorState.select(target.cell);
		}
		contextMenu = { anchor: toMeasurable(e), target };
	};

	// The frames around the shown ones load ahead
	watch(
		[() => annotationState.currentFrameIndex, () => videoDisplayState.concurrentFrames],
		([start, count]) => frameCache.prefetchWindow(start, count)
	);
</script>

<div
	class="bg-empty-background relative isolate flex size-full max-h-full max-w-full items-center overflow-hidden"
	role="presentation"
	oncontextmenu={handleContextMenu}
	onpointerleave={() => {
		inputState.pointer = null;
		hovered = null;
	}}
	onpointerover={hoverAt}
	onpointerup={updatePointer}
	onpointermove={updatePointer}
	onpointerdown={displayPointerDown}
	onwheel={displayWheel}
>
	<!-- The filters the frame images go through -->
	<svg class="absolute size-0" aria-hidden="true">
		<DisplayDefs />
	</svg>

	<div
		class="absolute flex size-full max-h-full max-w-full items-center justify-center"
		role="presentation"
		style:cursor={isPanning || armed ? 'grabbing' : 'grab'}
		bind:this={viewportElement}
		bind:clientWidth={viewportWidth}
		bind:clientHeight={viewportHeight}
	>
		<div
			class="absolute origin-center select-none"
			style:width="{zoomState.scalePercent}%"
			style:height="{zoomState.scalePercent}%"
			style:transform="translate({translateX}px, {translateY}px)"
			bind:this={stageElement}
			bind:clientWidth={stageWidth}
			bind:clientHeight={stageHeight}
		>
			<!-- All images under all outlines, so every outline shown can be clicked -->
			{#each layout.tiles as tile (tile.offset)}
				{@const frameIndex = shownFrames[tile.offset]}
				<!-- A frame not baked yet keeps its svg image through the turn, under the stand-ins -->
				<FrameTile
					matrix={placement.matrices[tile.offset]}
					restingMatrix={restingMatrices[tile.offset]}
					opacity={tile.fade}
					replaced={videoDisplayState.isTurning && !!imageSnapshots[tile.offset]}
				>
					<FrameImages {frameIndex} />
				</FrameTile>
			{/each}

			<!-- The hovered cell's fill, under the outlines as the tiles drew it -->
			{#if highlight}
				<HoverHighlight cell={highlight.cell} matrix={highlight.matrix} />
			{/if}

			<!-- Only what a tile draws takes the pointer, as inside a single svg; hidden, it draws nothing -->
			{#each layout.tiles as tile (tile.offset)}
				{@const frameIndex = shownFrames[tile.offset]}
				<FrameTile
					class={annotationOpacity > 0 ? '*:pointer-events-auto' : undefined}
					{frameIndex}
					matrix={placement.matrices[tile.offset]}
					restingMatrix={restingMatrices[tile.offset]}
					opacity={annotationOpacity}
					replaced={videoDisplayState.isTurning && armed}
				>
					<FrameAnnotation {frameIndex}>
						{#if Tool}
							<Tool
								{frameIndex}
								cells={editorState.selectedByFrame.get(frameIndex) ?? []}
							/>
						{/if}
					</FrameAnnotation>
				</FrameTile>
			{/each}
		</div>

		<!-- Drawn on the right press, shown once it turns the stack -->
		{#if armed}
			<StandInCanvas
				{layout}
				{placement}
				frames={shownFrames}
				images={imageSnapshots}
				{annotationOpacity}
				view={standInView}
			/>
		{/if}
	</div>

	<!-- The editing controls: viewers only look -->
	{#if !projectState.readOnly}
		<DisplayContextMenu menu={contextMenu} onClose={() => (contextMenu = null)} />

		<EditorToolbar />
	{/if}
</div>
