<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(),
		disabled = false,
		title = '',
		type = 'text' as 'text' | 'email' | 'password',
		onChange = () => {},
		children
	}: {
		value: string;
		disabled?: boolean;
		title?: string;
		type?: 'text' | 'email' | 'password';
		onChange?: (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => void;
		children?: Snippet;
	} = $props();
</script>

<div class="textbox-wrapper relative flex w-full flex-col items-start px-1 pt-[22px] pb-2" {title}>
	{#if type === 'email'}
		<input
			type="email"
			placeholder=" "
			bind:value
			class="tb-input border-b-border focus:border-b-focus m-0 w-full border-b-2 border-none bg-transparent p-px text-base font-normal transition-[border-color] duration-100 ease-in-out outline-none"
			{disabled}
			onchange={onChange}
		/>
	{:else if type === 'password'}
		<input
			type="password"
			placeholder=" "
			bind:value
			class="tb-input border-b-border focus:border-b-focus m-0 w-full border-b-2 border-none bg-transparent p-px text-base font-normal transition-[border-color] duration-100 ease-in-out outline-none"
			{disabled}
			onchange={onChange}
		/>
	{:else}
		<input
			type="text"
			placeholder=" "
			bind:value
			class="tb-input border-b-border focus:border-b-focus m-0 w-full border-b-2 border-none bg-transparent p-px text-base font-normal transition-[border-color] duration-100 ease-in-out outline-none"
			{disabled}
			onchange={onChange}
		/>
	{/if}
	<label
		class="tb-label text-border absolute left-[5px] flex origin-top-left cursor-default transition-all duration-100 ease-in-out select-none"
	>
		<span class="text-base leading-5 font-medium">{@render children?.()}</span>
	</label>
</div>

<style lang="scss">
	.tb-input {
		&:focus + .tb-label {
			color: var(--focus-color);
		}

		&:focus + .tb-label,
		&:not(:placeholder-shown) + .tb-label {
			transform: translateY(-16px) scale(0.8);
		}

		&::placeholder {
			color: transparent;
		}

		&:disabled {
			opacity: 0.6;
			cursor: default;

			& + .tb-label {
				opacity: 0.6;
				cursor: default;
			}
		}

		&:-webkit-autofill {
			-webkit-background-clip: text;
		}
	}
</style>
