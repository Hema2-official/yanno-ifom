<script module lang="ts">
	/** Where a chart's tooltip points, in its pixels, and what it says. */
	export type ChartTooltip = { x: number; y: number; value: string; detail: string };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** The figure's width, for the chart to draw to. */
		width: number;
		tooltip: ChartTooltip | null;
		children: Snippet;
	};

	let { title, width = $bindable(0), tooltip, children }: Props = $props();

	/** Keeps the tooltip inside the chart: centered on its point, or flush with an edge. */
	function shift(x: number) {
		if (x < width * 0.15) return '-10%';
		if (x > width * 0.85) return '-90%';
		return '-50%';
	}
</script>

<figure class="flex flex-col gap-1">
	<figcaption class="text-sm font-medium">{title}</figcaption>
	<div class="relative" bind:clientWidth={width}>
		{@render children()}
		{#if tooltip}
			<div
				class="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-md ring-1"
				style:left="{tooltip.x}px"
				style:top="{tooltip.y}px"
				style:transform="translate({shift(tooltip.x)}, -100%)"
			>
				<span class="font-semibold tabular-nums">{tooltip.value}</span>
				<span class="text-muted-foreground">· {tooltip.detail}</span>
			</div>
		{/if}
	</div>
</figure>
