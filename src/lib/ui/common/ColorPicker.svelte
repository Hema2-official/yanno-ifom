<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(),
		disabled = false,
		title = '',
		children
	}: {
		value: string;
		disabled?: boolean;
		title?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="flex flex-col items-start my-2 mx-1 overflow-visible">
	<label
		class="relative flex items-center justify-between whitespace-nowrap select-none cursor-pointer"
		class:disabled
	>
		<input
			type="color"
			bind:value
			class="w-5 h-5 my-1 mr-2 ml-1 p-0 outline-none border-none shadow-none cursor-pointer transition-all duration-100 ease-in-out hover:not-disabled:rotate-[10deg] hover:not-disabled:shadow-[3px_3px_1px_0_var(--accent-color)] focus-visible:not-disabled:rotate-[10deg] focus-visible:not-disabled:shadow-[3px_3px_1px_0_var(--accent-color)] disabled:opacity-60 disabled:cursor-default"
			style="background-color: {value};"
			{disabled}
			{title}
		/>
		<span
			class="text-base font-medium leading-5 peer-disabled:opacity-60 peer-disabled:cursor-default"
		>
			{@render children?.()}
		</span>
	</label>
</div>

<style lang="scss">
	input:disabled + span {
		opacity: 0.6;
		cursor: default;
	}

	label.disabled {
		cursor: default;
	}
</style>
