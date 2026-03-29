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

<div class="textbox-wrapper relative flex flex-col items-start pt-[22px] px-1 pb-2 w-full" {title}>
	{#if type === 'email'}
		<input
			type="email"
			placeholder=" "
			bind:value
			class="tb-input w-full p-px m-0 border-none outline-none bg-transparent text-base font-normal border-b-2 border-b-border transition-[border-color] duration-100 ease-in-out focus:border-b-focus"
			{disabled}
			onchange={onChange}
		/>
	{:else if type === 'password'}
		<input
			type="password"
			placeholder=" "
			bind:value
			class="tb-input w-full p-px m-0 border-none outline-none bg-transparent text-base font-normal border-b-2 border-b-border transition-[border-color] duration-100 ease-in-out focus:border-b-focus"
			{disabled}
			onchange={onChange}
		/>
	{:else}
		<input
			type="text"
			placeholder=" "
			bind:value
			class="tb-input w-full p-px m-0 border-none outline-none bg-transparent text-base font-normal border-b-2 border-b-border transition-[border-color] duration-100 ease-in-out focus:border-b-focus"
			{disabled}
			onchange={onChange}
		/>
	{/if}
	<label
		class="tb-label absolute left-[5px] flex text-border origin-top-left transition-all duration-100 ease-in-out cursor-default select-none"
	>
		<span class="text-base font-medium leading-5">{@render children?.()}</span>
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
