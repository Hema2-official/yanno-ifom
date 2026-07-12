<script lang="ts">
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

	let abortController: AbortController | undefined;

	function updateStatus(task: ServerTask) {
		if (task.finished) errorMessage = task.error ?? null;
		else if (task.cancelled) message = 'Cancelling...';
		else message = task.status_message;
	}

	async function updateStream() {
		abortController?.abort();
		abortController = new AbortController();

		try {
			for await (const task of streamTask(version, abortController.signal)) {
				updateStatus(task);
				if (task.finished) {
					abortController = undefined;
					onReady?.();
					break;
				}
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			throw error;
		}
	}

	$effect(() => {
		getTaskStatus(version)
			.then(updateStatus)
			.catch((err) => console.debug('Failed to fetch task: ', err));

		if (!version.ready) updateStream();
		else message = 'Ready';

		return () => abortController?.abort();
	});
</script>

{message}
{#if errorMessage !== null}
	<span class="text-destructive">(Last run failed: {errorMessage})</span>
{/if}
