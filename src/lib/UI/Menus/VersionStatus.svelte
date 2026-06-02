<script lang="ts">
	import { streamTask } from '$lib/api/realtime';
	import type { ProjectVersion } from '$lib/types/api.type';

	type Props = {
		version: ProjectVersion;
		onReady?: () => void;
	};
	let { version, onReady }: Props = $props();

	let message = $state('');

	let abortController: AbortController | undefined;

	async function updateStream() {
		abortController?.abort();
		abortController = new AbortController();

		try {
			for await (const task of streamTask(version, abortController.signal)) {
				message = task.status_message;
				if (task.completed) {
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
		if (!version.ready) updateStream();
		else message = 'Ready';

		return () => abortController?.abort();
	});
</script>

{message}
