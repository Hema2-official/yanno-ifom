<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { svgState } from '$lib/states/svg.svelte';

	type Props = {
		transform: string;
		/** Where the svg waits while the canvas stands in for it. */
		restingTransform: string;
		opacity?: number;
		/** Draws the canvas shown through a turn, if the tile has one. */
		standIn: Attachment<HTMLCanvasElement> | null;
		turning: boolean;
		/** Marks the tile for hit testing. */
		frameIndex?: number;
		class?: string;
		children: Snippet;
	};

	let {
		transform,
		restingTransform,
		opacity,
		standIn,
		turning,
		frameIndex,
		class: className,
		children
	}: Props = $props();

	// Firefox shows new canvases with a pause, but raises faint ones at once
	const READY_OPACITY = 0.01;

	const vb = $derived(svgState.svgViewBox);
	const replaced = $derived(turning && standIn !== null);
</script>

<!-- One layer of a frame: an svg of its own, which a CSS transform places -->
<svg
	class={['pointer-events-none absolute top-0 left-0 origin-top-left', className]}
	width={vb.width}
	height={vb.height}
	viewBox="{vb.minX} {vb.minY} {vb.width} {vb.height}"
	data-frame-index={frameIndex}
	style:transform={replaced ? restingTransform : transform}
	style:opacity
	style:visibility={replaced ? 'hidden' : undefined}
>
	{@render children()}
</svg>
{#if standIn}
	<canvas
		class="pointer-events-none absolute top-0 left-0 origin-top-left will-change-transform"
		style:width="{vb.width}px"
		style:height="{vb.height}px"
		style:transform
		style:opacity={turning ? opacity : READY_OPACITY}
		{@attach standIn}
	></canvas>
{/if}
