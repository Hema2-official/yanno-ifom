<script lang="ts">
	import { alternativeRedo, alternativeUndo, currentFrameId, pushChange } from '$lib/stores/data';
	import { editorTool, isEditing } from '$lib/stores/editor';
	import { autoResample } from '$lib/stores/options';
	import type { CellBodyType, NewCellType } from '$lib/types/annotation.type';
	import { deepCopy, getFramesDifference } from '$lib/utils/data';
	import { resampleCellBodies } from '$lib/utils/geometry';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	let { inputCell }: { inputCell: NewCellType } = $props();

	// svelte-ignore state_referenced_locally
	const cell = deepCopy(inputCell);
	const bodies = writable($autoResample ? resampleCellBodies(cell.bodies) : cell.bodies);

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

	function pushChanges() {
		console.log('Pushing changes to data');
		cell.bodies = $bodies;
		const diff = getFramesDifference(
			[{ id: $currentFrameId, cells: [inputCell] }],
			[{ id: $currentFrameId, cells: [cell] }]
		);
		diff.message = `Edit cell ${inputCell.id}`;

		// if there are changes, push them to the annotation
		if (diff.frames.length !== 0) {
			pushChange(diff);
		}
	}

	export function quit(commit: boolean) {
		if (commit) pushChanges();
		$isEditing = false;
	}

	const localChanges: CellBodyType[][] = [deepCopy($bodies)]; // Initial state
	let localChangeIndex = 0;

	const pushLocalState = () => {
		// Delete all local changes after the current index
		localChanges.splice(localChangeIndex + 1);

		// Push the current state to the local changes
		localChanges.push(deepCopy($bodies));
		localChangeIndex = localChanges.length - 1;
	};

	const localUndo = () => {
		if (localChangeIndex === 0) return;
		localChangeIndex--;
		$bodies = deepCopy(localChanges[localChangeIndex]);
	};

	const localRedo = () => {
		if (localChangeIndex === localChanges.length - 1) return;
		localChangeIndex++;
		$bodies = deepCopy(localChanges[localChangeIndex]);
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
