<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		checked = $bindable(false),
		disabled = false,
		title = '',
		children
	}: {
		checked?: boolean;
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
			type="checkbox"
			bind:checked
			class="checkbox inline-block w-5 h-5 my-1 mr-2 ml-1 p-0 outline-none border-2 border-border rounded-md bg-transparent appearance-none cursor-pointer transition-all duration-100 hover:not-disabled:border-accent focus-visible:not-disabled:border-accent disabled:opacity-60 disabled:cursor-default"
			{disabled}
			{title}
		/>
		<span class="text-base font-medium leading-5">{@render children?.()}</span>
	</label>
</div>

<style lang="scss">
	.checkbox {
		position: relative;

		&::after {
			content: '';
			box-sizing: content-box;
			position: absolute;
			opacity: 0;
			transition: opacity 0.1s;
			left: 4px;
			top: 1px;
			width: 4px;
			height: 8px;
			border: solid var(--color);
			border-radius: 3px;
			border-width: 0 3px 3px 0;
			transform: rotate(45deg);
		}

		&:checked::after {
			opacity: 1;
		}

		&:not(:disabled) {
			&:hover:checked,
			&:focus-visible:checked {
				background-color: var(--accent-color);
			}
		}

		&:disabled + span {
			opacity: 0.6;
			cursor: default;
		}
	}

	label.disabled {
		cursor: default;
	}
</style>
