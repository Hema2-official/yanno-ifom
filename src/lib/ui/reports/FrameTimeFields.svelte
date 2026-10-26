<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { timeUnits, videoDisplayState } from '$lib/states/VideoDisplayState.svelte';

	const uid = $props.id();

	const time = $derived(videoDisplayState.frameTime);

	// An emptied interval numbers the frames again; a zero typed on the way to 0.5 keeps the last one
	function changeInterval(value: unknown) {
		if (value === null) videoDisplayState.frameTime = null;
		else if (typeof value === 'number' && value > 0) {
			videoDisplayState.frameTime = {
				start: time?.start ?? 0,
				interval: value,
				unit: time?.unit ?? 'min'
			};
		}
	}
	// An emptied field means 0
	function changeStart(value: unknown) {
		if (time)
			videoDisplayState.frameTime = { ...time, start: typeof value === 'number' ? value : 0 };
	}
	function changeUnit(value: string) {
		const unit = timeUnits.find((unit) => unit === value);
		if (time && unit) videoDisplayState.frameTime = { ...time, unit };
	}
</script>

<div class="flex items-center gap-1">
	<Label for="{uid}-interval" class="mr-1 font-normal">Frames every</Label>
	<Input
		id="{uid}-interval"
		type="number"
		min="0"
		step="any"
		class="h-7 w-18"
		bind:value={() => time?.interval ?? null, changeInterval}
	/>
	<Select.Root type="single" disabled={!time} bind:value={() => time?.unit ?? 'min', changeUnit}>
		<Select.Trigger class="h-7 w-18" size="sm" aria-label="Time unit">
			{time?.unit ?? 'min'}
		</Select.Trigger>
		<Select.Content>
			{#each timeUnits as unit (unit)}
				<Select.Item value={unit} label={unit} />
			{/each}
		</Select.Content>
	</Select.Root>
	<Label for="{uid}-start" class="mx-1 font-normal">the first at</Label>
	<Input
		id="{uid}-start"
		type="number"
		step="any"
		class="h-7 w-18"
		disabled={!time}
		bind:value={() => time?.start ?? 0, changeStart}
	/>
</div>
