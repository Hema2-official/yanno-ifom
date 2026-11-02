<script lang="ts">
	import { onMount } from 'svelte';
	import { PersistedState, useInterval } from 'runed';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { TriangleAlertIcon } from '@lucide/svelte';

	const acknowledged = new PersistedState('browserWarning.acknowledged', false);
	let isChromium = $state(true);
	let isDismissed = $state(false);

	const countdown = useInterval(1000, {
		immediate: false,
		callback: () => {
			if (!isWaiting) countdown.pause();
		}
	});
	const secondsLeft = $derived(10 - countdown.counter);
	const isWaiting = $derived(secondsLeft > 0);

	onMount(() => {
		isChromium = navigator.userAgent.includes('Chrome/');
		if (!isChromium) countdown.resume();
	});
</script>

{#snippet Chromium()}
	<a
		target="_blank"
		rel="noopener noreferrer"
		href="https://en.wikipedia.org/wiki/Chromium_(web_browser)"
	>
		Chromium-based
	</a>
{/snippet}

<AlertDialog.Root
	bind:open={
		() => !isChromium && !acknowledged.current && !isDismissed, (open) => (isDismissed = !open)
	}
>
	<AlertDialog.Content escapeKeydownBehavior={isWaiting ? 'ignore' : 'close'} class="max-w-lg!">
		<AlertDialog.Header>
			<AlertDialog.Title class="flex items-center gap-1.5">
				<TriangleAlertIcon class="size-3.5" />
				This browser is fully supported, but...
			</AlertDialog.Title>
			<AlertDialog.Description>
				Yanno still works best in {@render Chromium()} browsers, such as Chrome, Edge or Brave
				due to performance optimizations that are missing elsewhere.
			</AlertDialog.Description>
			<AlertDialog.Description>
				Otherwise, please keep using alternative browsers such as Mozilla Firefox for daily
				use, and always review and adjust your privacy settings. :)
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel
				variant="default"
				disabled={isWaiting}
				onclick={() => (acknowledged.current = true)}
			>
				I understand{isWaiting ? ` (${secondsLeft})` : ''}
			</AlertDialog.Cancel>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
