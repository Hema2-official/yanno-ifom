<script lang="ts">
	import { streamTask } from '$lib/api/realtime';
	import { getTaskStatus } from '$lib/api/projects';
	import type { ProjectVersion } from '$lib/types/api.type';

	type Props = {
		version: ProjectVersion;
		onReady?: () => void;
	};
	let { version, onReady }: Props = $props();

	let message = $state('');
	let errorMessage: string | null = $state(null);

	let abortController: AbortController | undefined;

	async function fetchInitialStatus() {
		try {
			const task = await getTaskStatus(version);
			if (!task.completed && !task.cancelled) message = task.status_message;
			errorMessage = task.error ?? null;
		} catch {
			// Task may not exist yet, ignore
		}
	}

	async function updateStream() {
		abortController?.abort();
		abortController = new AbortController();

		try {
			for await (const task of streamTask(version, abortController.signal)) {
				message = task.status_message;
				errorMessage = task.error ?? null;
				if (task.completed || task.cancelled) {
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
		fetchInitialStatus();

		if (!version.ready) updateStream();
		else message = 'Ready';

		return () => abortController?.abort();
	});
</script>

{message}
{#if errorMessage !== null}
	<span class="text-destructive">(Last run failed: {errorMessage})</span>
{/if}
