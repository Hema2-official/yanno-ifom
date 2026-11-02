<!-- A numeric setting, its value shown beside the slider -->
<script lang="ts">
	import { Slider } from '$lib/components/ui/slider';
	import SettingsRow from './SettingsRow.svelte';

	type Props = {
		label: string;
		description?: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		disabled?: boolean;
		/** The value as shown, e.g. with its unit. */
		format?: (value: number) => string;
	};

	let {
		label,
		description,
		value = $bindable(),
		min,
		max,
		step = 1,
		disabled = false,
		format = String
	}: Props = $props();
</script>

<SettingsRow {label} {description}>
	<span class="text-muted-foreground w-14 text-right text-sm tabular-nums">{format(value)}</span>
	<Slider type="single" bind:value {min} {max} {step} {disabled} class="w-40" />
</SettingsRow>
