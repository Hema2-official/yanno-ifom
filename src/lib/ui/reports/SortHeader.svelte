<script module lang="ts">
	export type Sort = { id: string; descending: boolean };

	/** The column the rows are sorted by, the first once that one is gone. */
	export function sortedColumn<T extends { id: string }>(columns: T[], sort: Sort): T {
		return columns.find((column) => column.id === sort.id) ?? columns[0];
	}
</script>

<script lang="ts">
	import { ArrowDownIcon, ArrowUpIcon } from '@lucide/svelte';
	import * as Table from '$lib/components/ui/table';

	type Props = {
		columns: { id: string; label: string }[];
		sort: Sort;
	};

	let { columns, sort = $bindable() }: Props = $props();

	const marked = $derived(sortedColumn(columns, sort));

	// The marked column again turns the order around
	const sortBy = (id: string) => {
		sort = { id, descending: marked.id === id && !sort.descending };
	};
</script>

<Table.Header>
	<Table.Row>
		{#each columns as column (column.id)}
			<Table.Head class="text-right">
				<button
					class="inline-flex items-center gap-1"
					aria-label="Sort by {column.label}"
					onclick={() => sortBy(column.id)}
				>
					{column.label}
					{#if marked.id === column.id}
						{#if sort.descending}
							<ArrowDownIcon class="size-3" />
						{:else}
							<ArrowUpIcon class="size-3" />
						{/if}
					{/if}
				</button>
			</Table.Head>
		{/each}
	</Table.Row>
</Table.Header>
