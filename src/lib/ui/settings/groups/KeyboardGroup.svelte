<script module lang="ts">
	import { KeyboardIcon } from '@lucide/svelte';
	import { actionIds, actions, type ActionId } from '$lib/keybindings/actions';
	import { comboLabel } from '$lib/keybindings/keys';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { matches, type SettingsGroup } from '../group';

	// Everything a row shows, its keys included
	const searchText = (id: ActionId) => [
		actions[id].label,
		actions[id].description,
		actions[id].group,
		...keybindings.bindings[id].map(comboLabel)
	];

	const search = (query: string) => actionIds.filter((id) => matches(query, ...searchText(id)));

	export const group: SettingsGroup = {
		id: 'keyboard',
		label: 'Keyboard shortcuts',
		icon: KeyboardIcon,
		search
	};
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { GroupProps } from '../group';
	import KeybindingRow from '../KeybindingRow.svelte';
	import SettingsSection from '../SettingsSection.svelte';

	let { query }: GroupProps = $props();

	// The rows under their action-table headings
	const sections = $derived([...Map.groupBy(search(query), (id) => actions[id].group)]);
</script>

{#if !query}
	<div class="flex items-center justify-between gap-4">
		<p class="text-muted-foreground text-sm">
			Click a key to change it. Actions may share a key: the one listed first runs.
		</p>
		<Button
			variant="outline"
			size="sm"
			disabled={!keybindings.hasCustomizations}
			onclick={() => keybindings.resetAll()}
		>
			Reset all
		</Button>
	</div>
{/if}

{#each sections as [heading, ids] (heading)}
	<SettingsSection {heading}>
		{#each ids as id (id)}
			<KeybindingRow {id} />
		{/each}
	</SettingsSection>
{/each}
