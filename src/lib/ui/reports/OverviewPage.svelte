<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { framesOfChanges } from '$lib/states/AnnotationState.svelte';
	import BarChart from '$lib/ui/common/BarChart.svelte';
	import { editsByKind, editsPerDay, editsSinceLastRun, isManualEdit } from '$lib/utils/history';
	import { ancestorOf, frameMetrics, frameStats, type FrameMetric } from '$lib/utils/reports';
	import CsvButton from './CsvButton.svelte';
	import type { ReportProps } from './types';

	let { data, tracks, frameCount, name, showFrame }: ReportProps = $props();

	const changes = $derived(data.changes);
	// Replaying the history is the costly part, done only while this page is shown
	const stats = $derived(
		frameStats(data.current, tracks, changes, framesOfChanges(data), frameCount)
	);
	const perDay = $derived(editsPerDay(changes));
	const byKind = $derived(editsByKind(changes));
	const mostOfAKind = $derived(byKind.reduce((most, { count }) => Math.max(most, count), 1));

	const metrics = Object.keys(frameMetrics) as FrameMetric[];
	let metric: FrameMetric = $state('cells');
	// Pressing the active item would deselect it
	const pickMetric = (next: string | undefined) => {
		if (next) metric = next as FrameMetric;
	};

	const tiles = $derived([
		['Frames', frameCount],
		['Cells', data.current.length],
		['Tracks', tracks.length],
		['Tracks with an ancestor', tracks.filter((track) => ancestorOf(track) !== null).length],
		['Manual edits', changes.filter(isManualEdit).length],
		// What the last segmentation or tracking still needed
		['Manual edits since the last run', editsSinceLastRun(changes)]
	] as const);
</script>

<dl class="grid grid-cols-3 gap-x-4 gap-y-3">
	{#each tiles as [label, value] (label)}
		<div>
			<dt class="text-muted-foreground text-xs">{label}</dt>
			<dd class="text-xl font-semibold">{value?.toLocaleString() ?? '—'}</dd>
		</div>
	{/each}
</dl>

<div class="flex flex-col gap-2">
	<div class="flex items-center justify-between gap-2">
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			aria-label="What to chart by frame"
			bind:value={() => metric, pickMetric}
		>
			{#each metrics as id (id)}
				<ToggleGroup.Item value={id}>{frameMetrics[id]}</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
		<CsvButton
			name="{name}_frames"
			header={['Frame', ...metrics.map((id) => frameMetrics[id])]}
			rows={() =>
				stats.cells.map((_, frame) => [frame, ...metrics.map((id) => stats[id][frame])])}
		/>
	</div>

	<BarChart
		title="{frameMetrics[metric]} by frame"
		values={stats[metric]}
		labels={stats[metric].map((_, frame) => `Frame ${frame}`)}
		onPick={showFrame}
	/>
</div>

<!-- One day would be a one-bar chart; the tiles have its count -->
{#if perDay.length > 1}
	<BarChart
		title="Manual edits by day"
		values={perDay.map(({ count }) => count)}
		labels={perDay.map(({ label }) => label)}
	/>
{/if}

{#if byKind.length > 0}
	<figure class="flex flex-col gap-2">
		<figcaption class="text-sm font-medium">Manual edits by kind</figcaption>
		<ul class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm">
			{#each byKind as { label, count } (label)}
				<li class="contents">
					<span>{label}</span>
					<span
						class="bg-chart-1 h-2 rounded-r-sm"
						style:width="{(count / mostOfAKind) * 100}%"
					></span>
					<span class="text-muted-foreground text-right tabular-nums">
						{count.toLocaleString()}
					</span>
				</li>
			{/each}
		</ul>
	</figure>
{/if}
