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
	class="w-5 h-5 p-0 outline-none border-none shadow-none cursor-pointer transition-all duration-100 ease-in-out hover:not-disabled:rotate-10 hover:not-disabled:shadow-[3px_3px_1px_0_var(--accent-color)] focus-visible:not-disabled:rotate-10 focus-visible:not-disabled:shadow-[3px_3px_1px_0_var(--accent-color)] disabled:opacity-60 disabled:cursor-default"
	style="background-color: {value};"
	{disabled}
/>
