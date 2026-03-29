<script lang="ts">
	import { clickOutside } from '$lib/utils/scripts/clickOutside';

	type Props = {
		options: readonly string[];
		selected: number | undefined;
		onSelect?: (index: number | undefined) => void;
		disabled?: boolean;
		title?: string;
		emptyText?: string;
		emptySelectable?: boolean;
	};

	let {
		options,
		selected = $bindable(),
		onSelect = () => {},
		disabled = false,
		title = '',
		emptyText = 'Select',
		emptySelectable = false
	}: Props = $props();

	let isExpanded = $state(false);

	function handleSelect(index: number | undefined) {
		selected = index;
		onSelect(index);
		isExpanded = false;
	}
</script>

<div
	class="relative flex flex-col my-3 mx-1"
	use:clickOutside={{ callback: () => (isExpanded = false) }}
>
	<button
		class="inline-block max-w-full overflow-hidden text-ellipsis px-2 py-1 border border-border rounded-md bg-transparent text-base font-semibold text-left cursor-pointer transition-all duration-100 hover:not-disabled:border-focus hover:not-disabled:opacity-80 hover:not-disabled:shadow-[0_1px_0_1px_var(--color-focus)] active:not-disabled:bg-focus focus-visible:not-disabled:border-focus focus-visible:not-disabled:outline-none disabled:opacity-60 disabled:cursor-default"
		{disabled}
		{title}
		onclick={() => (isExpanded = !isExpanded)}
	>
		{selected !== undefined ? options[selected] : emptyText}
	</button>
	{#if isExpanded}
		<div
			class="absolute top-full left-0 flex flex-col gap-1 bg-background border border-border rounded-md p-1 z-10"
		>
			{#if emptySelectable}
				<button
					onclick={() => handleSelect(undefined)}
					class="px-2 py-1 border-none rounded-md bg-transparent text-left brightness-80 hover:bg-focus"
				>
					{emptyText}
				</button>
			{/if}
			{#each options as option, index}
				<button
					onclick={() => handleSelect(index)}
					class="px-2 py-1 border-none rounded-md bg-transparent text-left hover:bg-focus"
					class:selected={selected === index}
				>
					{option}
				</button>
			{/each}
		</div>
	{/if}
</div>
