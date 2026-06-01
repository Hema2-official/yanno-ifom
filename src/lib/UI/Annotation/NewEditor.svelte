<script lang="ts">
	import { alternativeRedo, alternativeUndo } from '$lib/stores/data';
	import { editorTool, isEditing } from '$lib/stores/editor';
	import { optionsState } from '$lib/states/options.svelte';
	import type { TrackType } from '$lib/types/annotation.type';
	import { deepCopy } from '$lib/utils/data.svelte';
	import { resampleCellBodies } from '$lib/utils/geometry';
	import { rleToPolygons } from '$lib/utils/rle';
	import { onMount } from 'svelte';
	import type { Polygon } from '$lib/types/geometry.type';

	let { inputCell }: { inputCell: TrackType } = $props();

	// svelte-ignore state_referenced_locally
	const cell = deepCopy(inputCell);
	const polygons = rleToPolygons(cell.SegmentationRLE);
	let bodies = $state(
		optionsState.autoResample
			? resampleCellBodies(polygons, optionsState.resampleSegmentLength)
			: polygons
	);

	// export let imageMouse: {
	// 	prevX: number;
	// 	prevY: number;
	// 	down: boolean;
	// 	first: boolean;
	// 	setPos: (pos: { x: number; y: number }) => void;
	// 	mouseDown: (e: MouseEvent) => void;
	// 	mouseUp: (e: MouseEvent) => void;
	// 	mouseMove: (e: MouseEvent) => void;
	// 	mouseMoveLocked: (e: MouseEvent) => void;
	// };

	// export const mouse = {
	// 	down: false,
	// 	cellID: 0,
	// 	handleID: 0,
	// 	startingPos: { x: 0, y: 0 },
	// 	mouseDown: (e: MouseEvent) => {
	// 		e.preventDefault();
	// 		e.stopPropagation();
	// 		if (!isDown(Mouse.Primary, e.buttons)) return;
	// 		//...
	// 		mouse.down = true;
	// 	},
	// 	mouseUp: (e: MouseEvent) => {
	// 		e.preventDefault();
	// 		e.stopPropagation();
	// 		if (imageMouse.down) return imageMouse.mouseUp(e);
	// 		if (!isUp(Mouse.Primary, e.buttons)) return;
	// 		mouse.down = false;
	// 		//...
	// 	},
	// 	mouseMove: (e: MouseEvent) => {
	// 		e.preventDefault();
	// 		e.stopPropagation();

	// 		if (imageMouse.down) return imageMouse.mouseMove(e);
	// 		if (!mouse.down) return;

	// 		//...
	// 	}
	// };

	export function quit(commit: boolean) {
		// if (commit) annotationState.commitData(...);
		$isEditing = false;
	}

	// svelte-ignore state_referenced_locally
	const localChanges: Polygon[][] = [deepCopy(bodies)]; // Initial state
	let localChangeIndex = $state(0);

	const pushLocalState = () => {
		// Delete all local changes after the current index
		localChanges.splice(localChangeIndex + 1);

		// Push the current state to the local changes
		localChanges.push(deepCopy(bodies));
		localChangeIndex = localChanges.length - 1;
	};

	const localUndo = () => {
		if (localChangeIndex === 0) return;
		localChangeIndex--;
		bodies = deepCopy(localChanges[localChangeIndex]);
	};

	const localRedo = () => {
		if (localChangeIndex === localChanges.length - 1) return;
		localChangeIndex++;
		bodies = deepCopy(localChanges[localChangeIndex]);
	};

	onMount(() => {
		$alternativeUndo = localUndo;
		$alternativeRedo = localRedo;

		return () => {
			$alternativeUndo = null;
			$alternativeRedo = null;
		};
	});
</script>

<!-- Editor tool component -->
{#if $editorTool}
	{@const EditorTool = $editorTool}
	<EditorTool {bodies} {pushLocalState} />
{/if}
