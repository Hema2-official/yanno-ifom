<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Input } from '$lib/components/ui/input';
	import { ancestorOf, type TrackSummary } from '$lib/utils/reports';
	import CsvButton from './CsvButton.svelte';
	import SortHeader, { sortedColumn } from './SortHeader.svelte';
	import type { ReportProps } from './types';

	let { tracks, frameCount, name, show }: ReportProps = $props();

	const columns: { id: string; label: string; value: (track: TrackSummary) => number | null }[] =
		[
			{ id: 'track', label: 'Track', value: (track) => track.trackId },
			{ id: 'first', label: 'First frame', value: (track) => track.first },
			{ id: 'last', label: 'Last frame', value: (track) => track.last },
			{ id: 'cells', label: 'Cells', value: (track) => track.cells.length },
			{ id: 'gaps', label: 'Missing frames', value: (track) => track.gaps.length },
			{ id: 'ancestor', label: 'Ancestor', value: ancestorOf },
			{ id: 'descendants', label: 'Descendants', value: (track) => track.descendants.length },
			{ id: 'area', label: 'Mean area (px)', value: (track) => Math.round(track.meanArea) }
		];

	const filters: Record<string, { label: string; keeps: (track: TrackSummary) => boolean }> = {
		endsEarly: { label: 'Ends early', keeps: (track) => track.last < frameCount - 1 },
		gaps: { label: 'Has gaps', keeps: (track) => track.gaps.length > 0 },
		ancestor: { label: 'Has an ancestor', keeps: (track) => ancestorOf(track) !== null },
		descendants: { label: 'Has descendants', keeps: (track) => track.descendants.length > 0 }
	};
	let active: string[] = $state([]);

	// Track IDs, however they're separated; none means all
	let query = $state('');
	const wanted = $derived(new Set((query.match(/\d+/g) ?? []).map(Number)));

	let sort = $state({ id: 'track', descending: false });

	const rows = $derived.by(() => {
		const { value } = sortedColumn(columns, sort);
		const sign = sort.descending ? -1 : 1;
		return tracks
			.filter((track) => wanted.size === 0 || wanted.has(track.trackId))
			.filter((track) => active.every((id) => filters[id].keeps(track)))
			.sort((a, b) => sign * ((value(a) ?? -1) - (value(b) ?? -1)));
	});
</script>

<div class="flex flex-wrap items-center gap-2">
	<Input class="h-7 w-44" placeholder="Track IDs, e.g. 3 7 12" bind:value={query} />
	<ToggleGroup.Root type="multiple" variant="outline" size="sm" bind:value={active}>
		{#each Object.entries(filters) as [id, filter] (id)}
			<ToggleGroup.Item value={id}>{filter.label}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
	<div class="ml-auto">
		<CsvButton
			name="{name}_tracks"
			header={columns.map((column) => column.label)}
			rows={() => rows.map((track) => columns.map((column) => column.value(track)))}
		/>
	</div>
</div>

<Table.Root>
	<SortHeader {columns} bind:sort />
	<Table.Body>
		{#each rows as track (track.trackId)}
			<Table.Row class="cursor-pointer" onclick={() => show(track.cells)}>
				{#each columns as column (column.id)}
					<Table.Cell class="text-right tabular-nums">
						{column.value(track)?.toLocaleString() ?? '—'}
					</Table.Cell>
				{/each}
			</Table.Row>
		{:else}
			<Table.Row>
				<Table.Cell colspan={columns.length} class="text-muted-foreground text-center">
					{tracks.length === 0 ? 'No cell has a track ID yet.' : 'No track matches.'}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
