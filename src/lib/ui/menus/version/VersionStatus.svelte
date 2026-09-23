<script lang="ts">
	import { getAbortSignal } from 'svelte';
	import { streamTask } from '$lib/api/realtime';
	import { getTaskStatus } from '$lib/api/projects';
	import type { ProjectVersion, ServerTask } from '$lib/types/api.type';

	type Props = {
		version: ProjectVersion;
		onReady?: () => void;
	};
	let { version, onReady }: Props = $props();

	let message = $state('');
	let errorMessage: string | null = $state(null);

	function updateStatus(task: ServerTask) {
		if (task.finished) errorMessage = task.error ?? null;
		else if (task.cancelled) message = 'Cancelling...';
		else message = task.status_message;
	}

	async function updateStream(signal: AbortSignal) {
		try {
			for await (const task of streamTask(version, signal)) {
				updateStatus(task);
				if (task.finished) {
					onReady?.();
					break;
				}
			}
		} catch (error) {
			// Aborted when the effect re-runs or the component unmounts
			if (!signal.aborted) throw error;
		}
	}

	$effect(() => {
		getTaskStatus(version)
			.then(updateStatus)
			.catch((err) => console.debug('Failed to fetch task: ', err));

		if (!version.ready) updateStream(getAbortSignal());
		else message = 'Ready';
	});
</script>

{message}
{#if errorMessage !== null}
	<span class="text-destructive">(Last run failed: {errorMessage})</span>
{/if}
