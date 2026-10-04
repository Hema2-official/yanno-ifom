<script lang="ts">
	type Props = {
		title: string;
		values: number[];
		/** @default the values' indices */
		labels?: string[];
		onPick?: (index: number) => void;
	};

	let { title, values, labels, onPick }: Props = $props();

	const HEIGHT = 140;
	const PAD = { top: 10, right: 4, bottom: 22, left: 36 };
	const MAX_BAR_WIDTH = 24;
	const GAP = 2;

	let containerWidth = $state(0);
	const width = $derived(Math.max(containerWidth, 120));
	const plotWidth = $derived(width - PAD.left - PAD.right);
	const baseline = HEIGHT - PAD.bottom;
	const plotHeight = baseline - PAD.top;

	const labelOf = (i: number) => labels?.[i] ?? String(i);

	/** The axis top: the smallest 1, 2 or 5 times a power of ten that holds every value. */
	const axisMax = $derived.by(() => {
		const max = values.reduce((a, b) => Math.max(a, b), 1);
		const power = 10 ** Math.floor(Math.log10(max));
		return [1, 2, 5, 10].map((step) => step * power).find((top) => top >= max) ?? max;
	});
	// No half a cell: a middle tick only where it is a whole number
	const ticks = $derived(axisMax % 2 === 0 ? [0, axisMax / 2, axisMax] : [0, axisMax]);
	const yOf = (value: number) => baseline - (plotHeight * value) / axisMax;

	const slot = $derived(plotWidth / Math.max(1, values.length));
	const barWidth = $derived(Math.max(1, Math.min(MAX_BAR_WIDTH, slot - GAP)));
	const centerOf = (i: number) => PAD.left + (i + 0.5) * slot;

	// Only every n-th bar gets an axis label, so they never collide
	const labelWidth = $derived(
		values.reduce((longest, _, i) => Math.max(longest, labelOf(i).length), 1) * 7 + 8
	);
	const labelEvery = $derived(Math.max(1, Math.ceil(labelWidth / slot)));

	// The bar under the pointer
	let active: number | null = $state(null);

	/** Keeps the tooltip inside the chart: centered on the bar, or flush with an edge. */
	function tooltipShift(i: number) {
		const x = centerOf(i);
		if (x < width * 0.15) return '-10%';
		if (x > width * 0.85) return '-90%';
		return '-50%';
	}

	function handlePointerMove(e: PointerEvent) {
		const x = e.clientX - (e.currentTarget as SVGElement).getBoundingClientRect().left;
		const i = Math.floor((x - PAD.left) / slot);
		active = i >= 0 && i < values.length ? i : null;
	}
</script>

<figure class="flex flex-col gap-1">
	<figcaption class="text-sm font-medium">{title}</figcaption>
	<div class="relative" bind:clientWidth={containerWidth}>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
		<svg
			{width}
			height={HEIGHT}
			role="img"
			aria-label={title}
			class={['block', onPick && 'cursor-pointer']}
			onclick={() => active !== null && onPick?.(active)}
			onpointermove={handlePointerMove}
			onpointerleave={() => (active = null)}
		>
			{#each ticks as tick (tick)}
				<line
					x1={PAD.left}
					y1={yOf(tick)}
					x2={width - PAD.right}
					y2={yOf(tick)}
					class="stroke-border"
					shape-rendering="crispEdges"
				/>
				<text
					x={PAD.left - 6}
					y={yOf(tick)}
					text-anchor="end"
					dominant-baseline="middle"
					class="fill-muted-foreground text-[10px] tabular-nums"
				>
					{tick.toLocaleString()}
				</text>
			{/each}

			{#each values as value, i (i)}
				<rect
					x={centerOf(i) - barWidth / 2}
					y={yOf(value)}
					width={barWidth}
					height={baseline - yOf(value)}
					class="fill-chart-1 transition-opacity"
					opacity={active === null || active === i ? 1 : 0.55}
				/>
				{#if i % labelEvery === 0}
					<text
						x={centerOf(i)}
						y={HEIGHT - 6}
						text-anchor="middle"
						class="fill-muted-foreground text-[10px] tabular-nums"
					>
						{labelOf(i)}
					</text>
				{/if}
			{/each}
		</svg>

		{#if active !== null}
			<div
				class="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-md ring-1"
				style:left="{centerOf(active)}px"
				style:top="{yOf(values[active]) - 6}px"
				style:transform="translate({tooltipShift(active)}, -100%)"
			>
				<span class="font-semibold tabular-nums">{values[active].toLocaleString()}</span>
				<span class="text-muted-foreground">· {labelOf(active)}</span>
			</div>
		{/if}
	</div>
</figure>
