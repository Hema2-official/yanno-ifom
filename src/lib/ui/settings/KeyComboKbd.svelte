<script lang="ts">
	import * as Kbd from '$lib/components/ui/kbd';
	import { formatCombo, type KeyCombo } from '$lib/keybindings/keys';

	let { combo }: { combo: KeyCombo } = $props();

	const parts = $derived(formatCombo(combo));
</script>

<Kbd.Group>
	{#each parts as part, index (index)}
		{#if index > 0}<span class="text-muted-foreground text-xs">+</span>{/if}
		<Kbd.Root>{part}</Kbd.Root>
	{/each}
</Kbd.Group>
