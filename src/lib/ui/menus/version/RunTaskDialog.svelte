<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { enqueueTask } from '$lib/api/projects';
	import {
		type AnyStepParams,
		type InheritanceParams,
		type ProjectVersion,
		type ServerTask,
		type VersionStep,
		defaultSegmentationParams,
		defaultTrackingParams,
		getNextStep,
		versionStepOrder
	} from '$lib/types/api.type';
	import { watch } from 'runed';
	import { toState } from '$lib/utils/runes.svelte';
	import { LoaderCircleIcon } from '@lucide/svelte';

	type Props = {
		isOpen: boolean;
		version: ProjectVersion | null;
		onRefresh: () => void;
	};

	let { isOpen = $bindable(false), version, onRefresh }: Props = $props();

	let busy = $state(false);
	let error_message: string | undefined = $state(undefined);

	let selectedStep = $derived(getNextStep(version?.step) ?? 'inheritance');

	function getDefaultParameters(step: VersionStep): AnyStepParams {
		return {
			segmentation: defaultSegmentationParams,
			tracking: defaultTrackingParams,
			inheritance: {} as InheritanceParams
		}[step];
	}

	let parameters = $derived(toState(getDefaultParameters(selectedStep)));

	// Set default parameters after opening
	watch([() => isOpen], () => {
		if (isOpen) parameters = toState(getDefaultParameters(selectedStep));
	});

	let allowSubmit = $derived(version?.ready ?? false);

	const handleRun = (e: SubmitEvent) => {
		e.preventDefault();
		if (!version || !selectedStep || !parameters) return;
		busy = true;
		error_message = undefined;

		console.debug('Running task:', version.id, selectedStep, parameters);
		enqueueTask(version, { step: selectedStep, parameters: $state.snapshot(parameters) })
			.then((response: ServerTask) => {
				console.debug('Created task:', response);
				isOpen = false;
				onRefresh();
			})
			.catch((error: Error) => {
				error_message = error.message;
			})
			.finally(() => {
				busy = false;
			});
	};
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={handleRun}>
			<Dialog.Header>
				<Dialog.Title>Run server task</Dialog.Title>
			</Dialog.Header>

			<Dialog.Description class="text-foreground flex items-center gap-2 text-base">
				Run
				<Select.Root type="single" bind:value={selectedStep}>
					<Select.Trigger>{selectedStep}</Select.Trigger>
					<Select.Content>
						{#each versionStepOrder as step (step)}
							<Select.Item value={step} label={step} />
						{/each}
					</Select.Content>
				</Select.Root>
				on {version?.name}
			</Dialog.Description>

			<!-- TODO: implement parameter editing -->
			{#if selectedStep === 'segmentation'}{:else if selectedStep === 'tracking'}{:else if selectedStep === 'inheritance'}{/if}

			{#if error_message}
				<p class="m-0 w-full px-1 pb-1 text-xs text-red-500">{error_message}</p>
			{/if}
			<Dialog.Footer>
				<div class="flex w-full items-center justify-end gap-2">
					<Dialog.Close class={buttonVariants({ variant: 'secondary' })} disabled={busy}>
						Cancel
					</Dialog.Close>
					<Button type="submit" disabled={!allowSubmit || busy}>
						{#if busy}
							<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
						{/if}
						Run
					</Button>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
