<svelte:options namespace="svg" />

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { arrowPath } from '$lib/utils/display';
	import { rleToPolygons } from '$lib/utils/rle';
	import { ancestryArrows } from '$lib/utils/tracks';
	import Cell from './Cell.svelte';

	type Props = {
		frameIndex: number;
		children?: Snippet;
	};

	let { frameIndex, children }: Props = $props();

	const cells = $derived(annotationState.getFrame(frameIndex) ?? []);
	const arrows = $derived(svgState.cellLook.arrows);
</script>

<g role="region">
	{#each cells as cell (cell.ObjectID)}
		<Cell
			cellPolygons={rleToPolygons(cell.SegmentationRLE)}
			cellId={cell.ObjectID}
			label={svgState.cellLabel(cell)}
			selected={editorState.isSelected(cell)}
		/>
	{/each}
</g>

<!-- From each ancestor to its descendant, over the cells, whose wide labels would hide them -->
{#if arrows}
	{@const labelSize = svgState.cellLook.labelSize}
	<g pointer-events="none">
		{#each ancestryArrows(cells, labelSize, arrows.only) as { id, from, to } (id)}
			<path
				d={arrowPath(from, to, arrows.width)}
				fill={arrows.color}
				stroke={arrows.color}
				stroke-width={arrows.width}
			/>
		{/each}
	</g>
{/if}

{@render children?.()}
