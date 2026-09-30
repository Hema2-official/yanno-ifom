<svelte:options namespace="svg" />

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { rleToPolygons } from '$lib/utils/rle';
	import Cell from './Cell.svelte';

	type Props = {
		frameIndex: number;
		children?: Snippet;
	};

	let { frameIndex, children }: Props = $props();
</script>

<g role="region">
	{#each annotationState.getFrame(frameIndex) ?? [] as cell (cell.ObjectID)}
		<Cell
			cellPolygons={rleToPolygons(cell.SegmentationRLE)}
			cellId={cell.ObjectID}
			label={svgState.cellLabel(cell)}
			selected={editorState.isSelected(cell)}
		/>
	{/each}
</g>

{@render children?.()}
