<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(),
		min = 0,
		max,
		disabled = false,
		title = '',
		mDown = () => {},
		mUp = () => {},
		children
	}: {
		value: number;
		min?: number;
		max: number;
		disabled?: boolean;
		title?: string;
		mDown?: (event: Event) => void;
		mUp?: (event: Event) => void;
		children?: Snippet;
	} = $props();
</script>

<div
	class="flex flex-col items-start my-2 mx-1 overflow-visible"
	title={title ? title : value.toString()}
>
	<label
		class="relative flex flex-col items-center justify-between w-full gap-0.5 whitespace-nowrap select-none"
		class:disabled
	>
		<span class="text-base font-medium leading-5" class:opacity-60={disabled}>
			{@render children?.()}
		</span>
		<input
			type="range"
			{min}
			{max}
			bind:value
			onmousedown={mDown}
			onmouseup={mUp}
			class="appearance-none bg-border rounded-[10px] mx-1 my-0.5 w-[calc(100%-8px)] h-2.5 transition-colors duration-100 ease-in-out hover:not-disabled:bg-accent focus-visible:not-disabled:bg-accent disabled:opacity-60 disabled:cursor-default"
			{disabled}
		/>
	</label>
</div>

<style lang="scss">
	label.disabled {
		cursor: default;
	}
</style>
