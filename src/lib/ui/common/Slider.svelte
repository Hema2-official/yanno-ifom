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
	class="mx-1 my-2 flex flex-col items-start overflow-visible"
	title={title ? title : value.toString()}
>
	<label
		class="relative flex w-full flex-col items-center justify-between gap-0.5 whitespace-nowrap select-none"
		class:disabled
	>
		<span class="text-base leading-5 font-medium" class:opacity-60={disabled}>
			{@render children?.()}
		</span>
		<input
			type="range"
			{min}
			{max}
			bind:value
			onmousedown={mDown}
			onmouseup={mUp}
			class="bg-border hover:not-disabled:bg-accent focus-visible:not-disabled:bg-accent mx-1 my-0.5 h-2.5 w-[calc(100%-8px)] appearance-none rounded-[10px] transition-colors duration-100 ease-in-out disabled:cursor-default disabled:opacity-60"
			{disabled}
		/>
	</label>
</div>

<style lang="scss">
	label.disabled {
		cursor: default;
	}
</style>
