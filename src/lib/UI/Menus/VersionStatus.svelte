<script lang="ts">
	import { streamTask } from '$lib/api/realtime';
	import type { ProjectVersion } from '$lib/types/api.type';
	import { onDestroy } from 'svelte';
	import Spinner from '../Common/Spinner.svelte';

	let { version, onUpdate }: { version: ProjectVersion; onUpdate: () => void } = $props();

	let message = $state('Ready');

	let abortController: AbortController | undefined;

	async function updateStream() {
		abortController?.abort();
		abortController = new AbortController();

		try {
			for await (const task of streamTask(version, abortController.signal)) {
				message = task.status_message;
				if (task.completed) {
					abortController = undefined;
					onUpdate();
					break;
				}
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			throw error;
		}
	}

	$effect(() => {
		if (!version.ready) updateStream();
		else message = 'Ready';
	});

	onDestroy(() => abortController?.abort());
</script>

{#if !version.ready}
	<Spinner size={16} thickness={2} />
{/if}

{message}
