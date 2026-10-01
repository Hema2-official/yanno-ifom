<!-- The color under an export, and its opacity where the format keeps one -->
<script lang="ts">
	import { Slider } from '$lib/components/ui/slider';
	import ColorPicker from '$lib/ui/common/ColorPicker.svelte';
	import SettingsRow from '$lib/ui/settings/SettingsRow.svelte';
	import type { Background } from '$lib/utils/snapshots';

	type Props = {
		background: Background;
		/** Whether the format keeps transparency. */
		alpha: boolean;
	};

	let { background = $bindable(), alpha }: Props = $props();

	const uid = $props.id();
</script>

<SettingsRow
	label="Background color"
	description={alpha ? undefined : 'Opaque in this format'}
	for="{uid}-color"
>
	{#if alpha}
		<span class="text-muted-foreground w-10 text-right text-sm tabular-nums">
			{Math.round(background.alpha * 100)}%
		</span>
		<Slider
			type="single"
			bind:value={background.alpha}
			min={0}
			max={1}
			step={0.01}
			class="w-28"
		/>
	{/if}
	<ColorPicker id="{uid}-color" bind:value={background.color} />
</SettingsRow>
