<script module lang="ts">
	import { InfoIcon } from '@lucide/svelte';
	import { searchRows, type SettingsGroup } from '../group';

	const rows = {
		chromium: 'Chromium browser runtime',
		version: 'Version number build commit hash'
	};
	const search = searchRows(rows);

	export const group: SettingsGroup = {
		id: 'about',
		label: 'About',
		icon: InfoIcon,
		search
	};
</script>

<script lang="ts">
	import { version } from '$app/env';
	import { chromiumVersion } from '$lib/utils/platform';
	import type { GroupProps } from '../group';
	import SettingsRow from '../SettingsRow.svelte';
	import SettingsSection from '../SettingsSection.svelte';

	let { query }: GroupProps = $props();

	const shown = $derived(search(query));
</script>

{#snippet value(text: string)}
	<span class="text-sm">{text}</span>
{/snippet}

{#if shown.includes('chromium')}
	<SettingsSection heading="Browser">
		<SettingsRow label="Based on Chromium?">
			{@render value(chromiumVersion ? `Yes (version ${chromiumVersion})` : 'No')}
		</SettingsRow>
	</SettingsSection>
{/if}

{#if shown.includes('version')}
	<SettingsSection heading="App">
		<SettingsRow label="Version">{@render value(version)}</SettingsRow>
	</SettingsSection>
{/if}
