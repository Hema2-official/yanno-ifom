<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import { lineage, median, type Ancestry } from '$lib/utils/reports';
	import CsvButton from './CsvButton.svelte';
	import type { ReportProps } from './types';

	let { tracks, name, show }: ReportProps = $props();

	const rows = $derived(lineage(tracks));

	const columns: { label: string; value: (row: Ancestry) => number | null }[] = [
		{ label: 'Ancestor', value: (row) => row.ancestor },
		{ label: 'Descendant', value: (row) => row.descendant.trackId },
		{ label: 'Starts in frame', value: (row) => row.descendant.first },
		{ label: 'Frames since the previous', value: (row) => row.interval },
		{ label: 'Generation', value: (row) => row.generation }
	];

	const summary = $derived([
		['Ancestors', new Set(rows.map((row) => row.ancestor)).size],
		['Descendants', rows.length],
		['Deepest generation', rows.reduce((deepest, row) => Math.max(deepest, row.generation), 0)],
		['Median frames between descendants', median(rows.flatMap((row) => row.interval ?? []))]
	] as const);

	/** The descendant's first cell, with its ancestor's cell in that frame if there is one. */
	function showStart({ ancestor, descendant }: Ancestry) {
		const [first] = descendant.cells;
		const beside = tracks
			.find((track) => track.trackId === ancestor)
			?.cells.find((cell) => cell.Frame === first.Frame);
		show(beside ? [first, beside] : [first]);
	}
</script>

{#if rows.length === 0}
	<p class="text-muted-foreground text-sm">
		No track has an ancestor yet. The ancestry tool sets one by dragging an arrow from the
		ancestor onto its descendant.
	</p>
{:else}
	<div class="flex items-start justify-between gap-4">
		<dl class="grid flex-1 grid-cols-4 gap-x-4">
			{#each summary as [label, value] (label)}
				<div>
					<dt class="text-muted-foreground text-xs">{label}</dt>
					<dd class="text-xl font-semibold">{value?.toLocaleString() ?? '—'}</dd>
				</div>
			{/each}
		</dl>
		<CsvButton
			name="{name}_lineage"
			header={columns.map((column) => column.label)}
			rows={() => rows.map((row) => columns.map((column) => column.value(row)))}
		/>
	</div>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				{#each columns as column (column.label)}
					<Table.Head class="text-right">{column.label}</Table.Head>
				{/each}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (row.descendant.trackId)}
				<Table.Row class="cursor-pointer" onclick={() => showStart(row)}>
					{#each columns as column (column.label)}
						<Table.Cell class="text-right tabular-nums">
							{column.value(row)?.toLocaleString() ?? '—'}
						</Table.Cell>
					{/each}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
