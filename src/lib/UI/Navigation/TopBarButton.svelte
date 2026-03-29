<script lang="ts">
	import type { Snippet } from 'svelte';
	import { clickOutside } from '$lib/utils/scripts/clickOutside';
	import type { SubmenuItemType } from '$lib/types/navigation.type';

	let { submenuItems, children }: { submenuItems: SubmenuItemType[]; children?: Snippet } =
		$props();

	let submenuShown = $state(false);
</script>

<div
	class="relative py-0.5 px-2 text-sm font-semibold bg-transparent transition-[background-color,opacity] duration-100 ease-in-out border-none rounded-[5px] text-[var(--color)] z-[9999] cursor-pointer hover:bg-[var(--light-gray-accent)] hover:opacity-100 {submenuShown
		? 'bg-[var(--light-gray-accent)] opacity-100'
		: 'opacity-80'}"
	role="button"
	tabindex="0"
	onclick={() => (submenuShown = !submenuShown)}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			submenuShown = !submenuShown;
		}
	}}
	use:clickOutside={{ callback: () => (submenuShown = false) }}
>
	{@render children?.()}
	{#if submenuShown}
		<div
			class="absolute left-0 top-[calc(100%+1px)] w-40 flex flex-col bg-[var(--background-color)] shadow-[0_2px_4px_rgba(0,0,0,0.3)] rounded-[5px] p-[5px]"
		>
			{#each submenuItems as item}
				<button
					class="w-full py-1 px-6 border-none rounded-[5px] text-left text-sm font-semibold text-[var(--color)] bg-transparent opacity-80 transition-[background-color,opacity] duration-100 ease-in-out hover:bg-[var(--accent-color)] hover:opacity-100"
					onclick={item.onClick}
				>
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
