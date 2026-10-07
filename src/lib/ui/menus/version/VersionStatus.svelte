<script lang="ts">
	import { getAbortSignal } from 'svelte';
	import { streamTask } from '$lib/api/realtime';
	import { getTaskStatus } from '$lib/api/projects';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		defaultStepParams,
		type ProjectVersion,
		type ServerTask,
		type VersionStep
	} from '$lib/types/api.type';
	import { InfoIcon } from '@lucide/svelte';

	type Props = {
		version: ProjectVersion;
		onReady?: () => void;
	};
	let { version, onReady }: Props = $props();

	let message = $state('');
	let errorMessage: string | null = $state(null);
	let lastTask = $state.raw<ServerTask | null>(null);

	const describe = ([key, value]: [string, unknown]) => `${key.replaceAll('_', ' ')}: ${value}`;
	function isDefault([key, value]: [string, unknown], step: VersionStep) {
		const defaults: Record<string, unknown> = defaultStepParams[step];
		return value === defaults[key];
	}

	const parameters = $derived(lastTask ? Object.entries(lastTask.parameters) : []);
	const hasChanged = $derived.by(() => {
		if (!lastTask) return false;
		const step = lastTask.step;
		return parameters.some(([key, value]) => !isDefault([key, value], step));
	});

	function updateStatus(task: ServerTask) {
		lastTask = task;
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
{#if lastTask}
	{@const task = lastTask}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="mt-0.5 block w-fit text-xs leading-none opacity-70">
					{#if hasChanged}<InfoIcon class="mb-0.5 inline-block size-3" />{/if}
					{task.finished ? `Last ${task.step} run with` : 'Run with'}
					{hasChanged ? 'custom parameters' : 'the default parameters'}
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="flex-col items-start wrap-anywhere">
			{#each parameters as parameter (parameter[0])}
				<span class={isDefault(parameter, task.step) ? 'opacity-70' : ''}>
					{describe(parameter)}
				</span>
			{/each}
		</Tooltip.Content>
	</Tooltip.Root>
{/if}
