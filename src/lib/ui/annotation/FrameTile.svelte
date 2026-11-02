<script lang="ts">
	import type { Snippet } from 'svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import type { Matrix } from '$lib/utils/layout';

	type Props = {
		/** Maps the frame's box into the stage. */
		matrix: Matrix;
		/** Where the svg waits while a stand-in turns in its place. */
		restingMatrix: Matrix;
		opacity?: number;
		/** Whether the display draws a stand-in in its place, hiding the svg. */
		replaced: boolean;
		/** Marks the tile for hit testing. */
		frameIndex?: number;
		class?: string;
		children: Snippet;
	};

	let {
		matrix,
		restingMatrix,
		opacity,
		replaced,
		frameIndex,
		class: className,
		children
	}: Props = $props();

	const vb = $derived(svgState.svgViewBox);
	const placed = $derived(replaced ? restingMatrix : matrix);
</script>

<!-- One layer of a frame: an svg of its own, which a CSS transform places -->
<svg
	class={['pointer-events-none absolute top-0 left-0 origin-top-left', className]}
	width={vb.width}
	height={vb.height}
	viewBox="{vb.minX} {vb.minY} {vb.width} {vb.height}"
	data-frame-index={frameIndex}
	style:transform="matrix({placed.join(', ')})"
	style:opacity
	style:visibility={replaced ? 'hidden' : undefined}
>
	{@render children()}
</svg>
