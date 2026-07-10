<script lang="ts">
	type Props = {
		id?: string;
		value: string;
		disabled?: boolean;
	};

	let { id, value = $bindable(), disabled = false }: Props = $props();
</script>

<input
	{id}
	type="color"
	bind:value
	class="h-5 w-5 cursor-pointer border-none p-0 shadow-none transition-all duration-100 ease-in-out outline-none hover:not-disabled:rotate-10 hover:not-disabled:shadow-[3px_3px_1px_0_var(--accent-color)] focus-visible:not-disabled:rotate-10 focus-visible:not-disabled:shadow-[3px_3px_1px_0_var(--accent-color)] disabled:cursor-default disabled:opacity-60"
	style="background-color: {value};"
	{disabled}
/>
