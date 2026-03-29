<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		click,
		disabled = false,
		title = '',
		type = 'button' as 'button' | 'submit' | 'reset',
		children
	}: {
		click?: (event: MouseEvent) => void;
		disabled?: boolean;
		title?: string;
		type?: 'button' | 'submit' | 'reset';
		children?: Snippet;
	} = $props();
</script>

<div class="flex flex-col my-3 mx-1">
	<button
		onclick={click}
		class="inline-block max-w-full overflow-hidden px-4 py-1 border border-border rounded-md bg-transparent text-base font-semibold cursor-pointer transition-all duration-100 hover:not-disabled:border-focus hover:not-disabled:opacity-80 hover:not-disabled:shadow-[0_1px_0_1px_var(--color-focus)] active:not-disabled:bg-focus focus-visible:not-disabled:border-focus focus-visible:not-disabled:outline-none disabled:opacity-60 disabled:cursor-default"
		{disabled}
		{title}
		{type}
	>
		{@render children?.()}
	</button>
</div>
