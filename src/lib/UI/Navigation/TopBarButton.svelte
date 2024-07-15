<script lang="ts">
	import { clickOutside } from '$lib/utils/scripts/clickOutside';
	import type { SubmenuItemType } from '$lib/types/navigation.type';

	export let submenuItems: SubmenuItemType[];

	let submenuShown = false;
</script>

<button
	class="top-bar-button {submenuShown ? 'submenu-shown' : ''}"
	on:click={() => (submenuShown = !submenuShown)}
	use:clickOutside
	on:click_outside={() => (submenuShown = false)}
>
	<slot />
	{#if submenuShown}
		<div class="top-bar-submenu">
			{#each submenuItems as item}
				<button class="submenu-item" on:click={item.onClick}>
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</button>

<style lang="scss">
	.top-bar-button {
		position: relative;
		padding: 2px 8px;
		font-size: 14px;
		font-weight: 600;
		background-color: transparent;
		transition:
			background-color 0.1s ease-in-out,
			opacity 0.1s ease-in-out;
		border: none;
		// border: 1px solid var(--gray-accent);
		border-radius: 5px;
		color: var(--color);
		opacity: 0.8;
		z-index: 9999;

		&:hover,
		&.submenu-shown {
			background-color: var(--light-gray-accent);
			opacity: 1;
		}
	}

	.top-bar-submenu {
		position: absolute;
		left: 0;
		top: calc(100% + 1px);
		width: 160px;
		display: flex;
		flex-direction: column;
		background-color: var(--background-color);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		border-radius: 5px;
		padding: 5px;

		.submenu-item {
			width: 100%;
			padding: 4px 24px;
			border: none;
			border-radius: 5px;
			text-align: left;
			font-size: 14px;
			font-weight: 600;
			color: var(--color);
			background-color: transparent;
			opacity: 0.8;
			transition:
				background-color 0.1s ease-in-out,
				opacity 0.1s ease-in-out;

			&:hover {
				background-color: var(--accent-color);
				opacity: 1;
			}
		}
	}
</style>
