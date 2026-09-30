<script lang="ts">
	import { getAbortSignal, onDestroy, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
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
	import { drawOutlines, MAX_SNAPSHOT_SIZE } from '$lib/utils/snapshots';
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
	import { startPan, startTurn } from './gestures';

	// The current tool is mounted in every frame tile, when editing is on
	const Tool = $derived(projectState.readOnly ? null : toolRegistry[editorState.tool].component);

	let contextMenu = $state.raw<DisplayMenu | null>(null);

	// Switching tools or changing the data closes the menu
	watch([() => editorState.tool, () => annotationState.data], () => {
		contextMenu = null;
	});

	let viewportElement: HTMLDivElement;
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
	const restingTransforms = $derived.by(() => {
		if (!videoDisplayState.isTurning) return placement.transforms;
		const resting = layoutAt(videoDisplayState.restingAngles);
		return placeTiles(resting, stageWidth, stageHeight).transforms;
	});

	const annotationOpacity = $derived(
		svgState.isAnnotationShown && !keybindings.isHeld('display.hideAnnotation')
			? svgState.annotationOpacity.current
			: 0
	);

	// Bake the shown frames while the stack stands still, ready for a turn
	$effect(() => {
		if (!isStack) {
			frameSnapshots.clear();
			return;
		}
		if (videoDisplayState.isTurning) return;
		const first = annotationState.currentFrameIndex;
		const count = videoDisplayState.concurrentFrames;
		const frames = Array.from({ length: count }, (_, offset) => first + offset);
		frameSnapshots.prepare(frames, getAbortSignal());
	});
	onDestroy(() => frameSnapshots.clear());

	const drawCopy =
		(source: HTMLCanvasElement): Attachment<HTMLCanvasElement> =>
		(canvas) => {
			canvas.width = source.width;
			canvas.height = source.height;
			canvas.getContext('2d')?.drawImage(source, 0, 0);
		};

	const drawAnnotation =
		(frameIndex: number): Attachment<HTMLCanvasElement> =>
		(canvas) => {
			const style = getComputedStyle(canvas);
			const hideLabels = keybindings.isHeld('display.hideLabels');
			// As sharp as the frame is shown when the turn starts
			const scale = untrack(() =>
				Math.min(
					placement.scale * devicePixelRatio,
					MAX_SNAPSHOT_SIZE / Math.max(vb.width, vb.height)
				)
			);
			const size = { width: vb.width, height: vb.height, scale };
			drawOutlines(canvas, size, annotationState.getFrame(frameIndex) ?? [], {
				...svgState.cellLook,
				selectedStroke: style.getPropertyValue('--accent-color').trim(),
				isSelected: (cell) => editorState.isSelected(cell),
				label: (cell) => (hideLabels ? null : svgState.cellLabel(cell)),
				fontFamily: style.fontFamily
			});
		};

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
				videoDisplayState.endTurn();

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
	onpointerleave={() => (inputState.pointer = null)}
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
				{@const frameIndex = annotationState.currentFrameIndex + tile.offset}
				<!-- A frame not baked yet keeps its svg image through the turn -->
				{@const snapshot = armed ? frameSnapshots.get(frameIndex) : null}
				<FrameTile
					transform={placement.transforms[tile.offset]}
					restingTransform={restingTransforms[tile.offset]}
					opacity={tile.fade}
					standIn={snapshot && drawCopy(snapshot)}
					turning={videoDisplayState.isTurning}
				>
					<FrameImages {frameIndex} />
				</FrameTile>
			{/each}

			<!-- Only what a tile draws takes the pointer, as inside a single svg; hidden, it draws nothing -->
			{#each layout.tiles as tile (tile.offset)}
				{@const frameIndex = annotationState.currentFrameIndex + tile.offset}
				<FrameTile
					class={annotationOpacity > 0 ? '*:pointer-events-auto' : undefined}
					{frameIndex}
					transform={placement.transforms[tile.offset]}
					restingTransform={restingTransforms[tile.offset]}
					opacity={annotationOpacity}
					standIn={armed ? drawAnnotation(frameIndex) : null}
					turning={videoDisplayState.isTurning}
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
	</div>

	<!-- The editing controls: viewers only look -->
	{#if !projectState.readOnly}
		<DisplayContextMenu menu={contextMenu} onClose={() => (contextMenu = null)} />

		<EditorToolbar />
	{/if}
</div>
