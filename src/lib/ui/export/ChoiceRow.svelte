<script lang="ts" generics="T extends string">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import SettingsRow from '$lib/ui/settings/SettingsRow.svelte';

	type Props = {
		label: string;
		options: { value: T; label: string }[];
		value: T;
	};

	let { label, options, value = $bindable() }: Props = $props();

	// Pressing the active item would deselect it
	const choose = (next: string | undefined) => {
		if (next) value = next as T;
	};
</script>

<SettingsRow {label}>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		size="sm"
		aria-label={label}
		bind:value={() => value, choose}
	>
		{#each options as option (option.value)}
			<ToggleGroup.Item value={option.value}>{option.label}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
</SettingsRow>
