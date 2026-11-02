<script module lang="ts">
	/** A line's value at each of the chart's x, null where it has none. */
	export type ChartLine = { id: string; values: (number | null)[] };
</script>

<script lang="ts">
	import ChartFigure from './ChartFigure.svelte';

	type Props = {
		title: string;
		/** Where each index of the values sits on the x axis, ascending. */
		x: number[];
		xLabel: string;
		lines: ChartLine[];
		/** Shaded behind the lines, by index. */
		band?: ({ low: number; high: number } | null)[];
		/** The tooltip of a line at an index: the value, then what it is. */
		readout: (line: ChartLine, index: number) => { value: string; detail: string };
		onPick?: (line: ChartLine, index: number) => void;
	};

	let { title, x, xLabel, lines, band, readout, onPick }: Props = $props();

	const HEIGHT = 220;
	const PAD = { top: 10, right: 12, bottom: 36 };

	let containerWidth = $state(0);
	const width = $derived(Math.max(containerWidth, 160));
	const baseline = HEIGHT - PAD.bottom;

	const compact = new Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 2
	});

	/** Round ticks, about `count` of them, from at most `min` to at least `max`. */
	function niceTicks(min: number, max: number, count: number): number[] {
		if (!Number.isFinite(min) || !Number.isFinite(max)) [min, max] = [0, 1];
		if (max <= min) [min, max] = [min - (Math.abs(min) || 1), max + (Math.abs(max) || 1)];
		const rough = (max - min) / count;
		const power = 10 ** Math.floor(Math.log10(rough));
		const step =
			[1, 2, 5, 10].map((factor) => factor * power).find((step) => step >= rough) ??
			10 * power;
		const first = Math.floor(min / step);
		const last = Math.ceil(max / step);
		// Rounded, so a step of 0.1 doesn't wander off by floating point
		return Array.from({ length: last - first + 1 }, (_, i) =>
			Number(((first + i) * step).toPrecision(12))
		);
	}

	const yTicks = $derived.by(() => {
		let [min, max] = [Infinity, -Infinity];
		for (const { values } of lines) {
			for (const value of values) {
				if (value === null) continue;
				[min, max] = [Math.min(min, value), Math.max(max, value)];
			}
		}
		for (const range of band ?? []) {
			if (range) [min, max] = [Math.min(min, range.low), Math.max(max, range.high)];
		}
		return niceTicks(min, max, 4);
	});
	// The widest y label sets the left margin
	const left = $derived(
		yTicks.reduce((widest, tick) => Math.max(widest, compact.format(tick).length), 1) * 6 + 12
	);
	const plotWidth = $derived(width - left - PAD.right);
	const xTicks = $derived(
		niceTicks(x[0] ?? 0, x.at(-1) ?? 0, Math.max(2, Math.floor(plotWidth / 80)))
	);

	const xOf = (value: number) =>
		left + ((value - xTicks[0]) / (xTicks[xTicks.length - 1] - xTicks[0])) * plotWidth;
	const yOf = (value: number) =>
		baseline -
		((value - yTicks[0]) / (yTicks[yTicks.length - 1] - yTicks[0])) * (baseline - PAD.top);

	/** A line's runs of values as one path, and the indexes of its lone values, drawn as dots. */
	function draw(line: ChartLine) {
		let d = '';
		const dots: number[] = [];
		line.values.forEach((value, i) => {
			if (value === null) return;
			const joined = i > 0 && line.values[i - 1] !== null;
			const continued = i + 1 < line.values.length && line.values[i + 1] !== null;
			if (!joined && !continued) dots.push(i);
			else d += `${joined ? 'L' : 'M'}${xOf(x[i]).toFixed(1)},${yOf(value).toFixed(1)}`;
		});
		return { line, d, dots };
	}
	const drawn = $derived(lines.map(draw));

	// Each run of the band, along its top and back along its bottom
	const bandPaths = $derived.by(() => {
		const runs: number[][] = [];
		band?.forEach((range, i) => {
			if (!range) return;
			if (i > 0 && band[i - 1]) runs[runs.length - 1].push(i);
			else runs.push([i]);
		});
		const corner = (i: number, value: number) =>
			`${xOf(x[i]).toFixed(1)},${yOf(value).toFixed(1)}`;
		return runs.map((run) => {
			const top = run.map((i) => corner(i, band![i]!.high));
			const bottom = run.toReversed().map((i) => corner(i, band![i]!.low));
			return `M${[...top, ...bottom].join('L')}Z`;
		});
	});

	// By id, since new lines replace the hovered one when the data changes
	let hovered: { id: string; index: number } | null = $state.raw(null);
	const active = $derived.by(() => {
		if (!hovered) return null;
		const { id, index } = hovered;
		const drawing = drawn.find(({ line }) => line.id === id);
		const value = drawing?.line.values[index] ?? null;
		return drawing && value !== null ? { ...drawing, index, value } : null;
	});

	// Many lines are faint, the more so while one is hovered, so it stands out
	const crowded = $derived(lines.length > 1);
	const lineOpacity = $derived(crowded ? (active ? 0.15 : 0.45) : 1);

	function handlePointerMove(e: PointerEvent) {
		const box = (e.currentTarget as SVGElement).getBoundingClientRect();
		const [px, py] = [e.clientX - box.left, e.clientY - box.top];
		// The nearest x first, then the nearest line there
		let index = 0;
		for (let i = 1; i < x.length; i++) {
			if (Math.abs(xOf(x[i]) - px) < Math.abs(xOf(x[index]) - px)) index = i;
		}
		let nearest: { line: ChartLine; distance: number } | null = null;
		for (const line of lines) {
			const value = line.values[index];
			if (value === null || value === undefined) continue;
			const distance = Math.abs(yOf(value) - py);
			if (!nearest || distance < nearest.distance) nearest = { line, distance };
		}
		hovered = nearest && px >= left ? { id: nearest.line.id, index } : null;
	}

	const tooltip = $derived(
		active && {
			x: xOf(x[active.index]),
			y: yOf(active.value) - 8,
			...readout(active.line, active.index)
		}
	);
</script>

<ChartFigure {title} bind:width={containerWidth} {tooltip}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
	<svg
		{width}
		height={HEIGHT}
		role="img"
		aria-label={title}
		class={['block', onPick && active && 'cursor-pointer']}
		onclick={() => active && onPick?.(active.line, active.index)}
		onpointermove={handlePointerMove}
		onpointerleave={() => (hovered = null)}
	>
		{#each yTicks as tick (tick)}
			<line
				x1={left}
				y1={yOf(tick)}
				x2={width - PAD.right}
				y2={yOf(tick)}
				class="stroke-border"
				shape-rendering="crispEdges"
			/>
			<text
				x={left - 6}
				y={yOf(tick)}
				text-anchor="end"
				dominant-baseline="middle"
				class="fill-muted-foreground text-[10px] tabular-nums"
			>
				{compact.format(tick)}
			</text>
		{/each}
		{#each xTicks as tick (tick)}
			<text
				x={xOf(tick)}
				y={baseline + 14}
				text-anchor="middle"
				class="fill-muted-foreground text-[10px] tabular-nums"
			>
				{compact.format(tick)}
			</text>
		{/each}
		<text
			x={left + plotWidth / 2}
			y={HEIGHT - 4}
			text-anchor="middle"
			class="fill-muted-foreground text-xs"
		>
			{xLabel}
		</text>

		{#each bandPaths as d, i (i)}
			<path {d} class="fill-chart-1" opacity="0.15" />
		{/each}
		<!-- Faint lines each, not the group, so they darken where they crowd -->
		<g
			class="stroke-chart-1 fill-chart-1"
			stroke-opacity={lineOpacity}
			fill-opacity={lineOpacity}
		>
			{#each drawn as { line, d, dots } (line.id)}
				<path
					{d}
					fill="none"
					stroke-width={crowded ? 1.5 : 2}
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				{#each dots as dot (dot)}
					<circle cx={xOf(x[dot])} cy={yOf(line.values[dot]!)} r="2" stroke="none" />
				{/each}
			{/each}
		</g>

		{#if active}
			{@const cx = xOf(x[active.index])}
			<line
				x1={cx}
				y1={PAD.top}
				x2={cx}
				y2={baseline}
				class="stroke-foreground/30"
				shape-rendering="crispEdges"
			/>
			{#if crowded}
				<path
					d={active.d}
					fill="none"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="stroke-chart-1"
				/>
			{/if}
			<circle
				{cx}
				cy={yOf(active.value)}
				r="4"
				stroke-width="2"
				class="fill-chart-1 stroke-background"
			/>
		{/if}
	</svg>
</ChartFigure>
