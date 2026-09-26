<script module lang="ts">
	import { PaintbrushIcon } from '@lucide/svelte';
	import { matches, type SettingsGroup } from '../group';

	// Each row's label with its search keywords
	const rows = {
		theme: 'Theme dark light system mode',
		sidebar: 'Sidebar on the right layout'
	};
	type Row = keyof typeof rows;

	const search = (query: string) =>
		(Object.keys(rows) as Row[]).filter((row) => matches(query, rows[row]));

	export const group: SettingsGroup = {
		id: 'appearance',
		label: 'Appearance',
		icon: PaintbrushIcon,
		search
	};
</script>

<script lang="ts">
	import { setMode, userPrefersMode } from 'mode-watcher';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { optionsState } from '$lib/states/options.svelte';
	import type { GroupProps } from '../group';
	import SettingsRow from '../SettingsRow.svelte';
	import SettingsSection from '../SettingsSection.svelte';

	let { query }: GroupProps = $props();

	const uid = $props.id();
	const shown = $derived(search(query));

	type Theme = typeof userPrefersMode.current;
	const themes: Theme[] = ['system', 'light', 'dark'];
</script>

<SettingsSection>
	{#if shown.includes('theme')}
		<SettingsRow label="Theme" for="{uid}-theme">
			<Select.Root
				type="single"
				value={userPrefersMode.current}
				onValueChange={(value) => setMode(value as Theme)}
			>
				<Select.Trigger id="{uid}-theme" class="w-32 capitalize" size="sm">
					{userPrefersMode.current}
				</Select.Trigger>
				<Select.Content>
					{#each themes as value (value)}<Select.Item class="capitalize" {value} />{/each}
				</Select.Content>
			</Select.Root>
		</SettingsRow>
	{/if}

	{#if shown.includes('sidebar')}
		<SettingsRow label="Sidebar on the right" for="{uid}-sidebar">
			<Switch id="{uid}-sidebar" bind:checked={optionsState.sidebarRight} />
		</SettingsRow>
	{/if}
</SettingsSection>
