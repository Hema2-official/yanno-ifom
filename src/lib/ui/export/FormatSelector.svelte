<script lang="ts">
	import { canEncode, imageFormats } from '$lib/utils/export';
	import SliderRow from '../settings/SliderRow.svelte';
	import ChoiceRow from './ChoiceRow.svelte';

	type Props = { hasTiff?: undefined | false; value: keyof typeof imageFormats; quality: number };
	type TiffProps = { hasTiff: true; value: keyof typeof imageFormats | 'tiff'; quality: number };

	let { hasTiff, value = $bindable(), quality = $bindable(0.92) }: Props | TiffProps = $props();

	const formats = $derived([
		...(['png', 'jpeg', 'webp'] as const)
			.filter(canEncode)
			.map((value) => ({ value, label: imageFormats[value].label })),
		...(hasTiff ? [{ value: 'tiff' as const, label: 'TIFF stack' }] : [])
	]);
</script>

<div class="flex w-full flex-col">
	<ChoiceRow label="Format" options={formats} bind:value />

	{#if value !== 'tiff' && imageFormats[value].lossy}
		<SliderRow
			label="Quality"
			bind:value={quality}
			min={0.5}
			max={1}
			step={0.01}
			format={(value: number) => `${Math.round(value * 100)}%`}
		/>
	{/if}
</div>
