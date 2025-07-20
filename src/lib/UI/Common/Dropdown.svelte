<script lang="ts">
	import { clickOutside } from '$lib/utils/scripts/clickOutside';

	export let options: string[];
	export let selected: number | undefined;
	export let onSelect: (index: number | undefined) => void = () => {};
	export let disabled = false;
	export let title: string = '';
	export let emptyText: string = 'Select';
	export let emptySelectable: boolean = false;

	let isExpanded = false;

	function handleSelect(index: number | undefined) {
		selected = index;
		onSelect(index);
		isExpanded = false;
	}
</script>

<div class="dropdown-wrapper" use:clickOutside on:click_outside={() => (isExpanded = false)}>
	<button class="expand-button" {disabled} {title} on:click={() => (isExpanded = !isExpanded)}>
		{selected !== undefined ? options[selected] : emptyText}
	</button>
	{#if isExpanded}
		<div class="dropdown-items">
			{#if emptySelectable}
				<button on:click={() => handleSelect(undefined)} class="item empty">
					{emptyText}
				</button>
			{/if}
			{#each options as option, index}
				<button
					on:click={() => handleSelect(index)}
					class="item"
					class:selected={selected === index}
				>
					{option}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.dropdown-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		margin: 12px 4px;
	}

	.expand-button {
		display: inline-block;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 4px 8px;
		border: none;
		border: 1px solid var(--gray-accent);
		border-radius: 5px;
		background: transparent;
		transition:
			border-color 0.1s,
			background-color 0.1s,
			opacity 0.1s,
			box-shadow 0.1s;

		appearance: none;
		font-size: 16px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;

		&:disabled {
			opacity: 0.6;
			cursor: default;
		}

		&:not(:disabled):hover,
		&:not(:disabled):focus-visible {
			outline: none;
			border-color: var(--focus-color);
			opacity: 0.8;
			box-shadow: 0 1px 0 1px var(--focus-color);
		}

		&:not(:disabled):active:hover,
		&:not(:disabled):active:focus-visible {
			outline: none;
			background-color: var(--focus-color);
		}
	}

	.dropdown-items {
		position: absolute;
		top: 100%;
		left: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		background-color: var(--background-color);
		border: 1px solid var(--gray-accent);
		border-radius: 5px;
		padding: 4px;
		z-index: 1;

		.item {
			padding: 4px 8px;
			border: none;
			border-radius: 5px;
			background: transparent;
			text-align: left;

			&.empty {
				filter: brightness(0.8);
			}

			&:hover {
				background-color: var(--focus-color);
			}
		}
	}
</style>
