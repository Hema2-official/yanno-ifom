<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { extractError } from '$lib/api/errors';
	import { trackingModels } from '$lib/compute/models';
	import type { ProgressCallback } from '$lib/states/ProjectState.svelte';
	import {
		type AnyStepParams,
		type StepParams,
		type VersionStep,
		defaultStepParams,
		getNextStep,
		versionStepOrder
	} from '$lib/types/api.type';
	import { beforeNavigate } from '$app/navigation';
	import { watch } from 'runed';
	import { LoaderCircleIcon } from '@lucide/svelte';
	import { onDestroy, type ComponentProps, type Snippet } from 'svelte';

	type Props = {
		isOpen: boolean;
		description: string;
		/** The step run last, to propose the next one. */
		lastStep?: VersionStep | null;
		/** How many cells the project has, which segmentation replaces. */
		cells?: number;
		/** Aborted when the dialog closes. */
		run: (
			step: VersionStep,
			parameters: AnyStepParams,
			signal: AbortSignal,
			onProgress: ProgressCallback
		) => Promise<unknown>;
		/** Fields above the step's. */
		children?: Snippet;
	};

	let {
		isOpen = $bindable(false),
		description,
		lastStep,
		cells = 0,
		run,
		children
	}: Props = $props();

	const uid = $props.id();

	/** A step parameter: a checkbox, a list of options, or a text or number input. */
	type Field<P> = {
		key: keyof P & string;
		label: string;
		hint?: string;
		checkbox?: boolean;
		options?: { value: string; label: string }[];
		optional?: boolean;
		inputProps?: ComponentProps<typeof Input>;
	};

	// Inheritance has a single method, so it goes out as the default
	const fields: { [S in VersionStep]: Field<StepParams[S]>[] } = {
		segmentation: [
			{
				key: 'score_threshold',
				label: 'Score threshold',
				hint: 'Detections below this confidence are dropped',
				inputProps: { type: 'number', min: 0, max: 1, step: 0.01 }
			}
		],
		tracking: [
			{
				key: 'model_name',
				label: 'Model',
				hint: 'Deeper ones take longer; each is downloaded on its first use',
				options: trackingModels.map(({ file, label }) => ({ value: file, label }))
			},
			{
				key: 'segmentation_confidence',
				label: 'Segmentation confidence',
				hint: "Confidence for the tracker's own masks in nearby frames",
				inputProps: { type: 'number', min: 0, max: 1, step: 0.01 }
			},
			{
				key: 'min_required_similarity',
				label: 'Min. required similarity',
				hint: "Least overlap (IoU) of two cells' local tracks to link them",
				inputProps: { type: 'number', min: 0, max: 1, step: 0.01 }
			},
			{
				key: 'max_time_kernel_shift',
				label: 'Max. time kernel shift',
				hint: 'Frames linking looks ahead; twice the kernel if empty',
				inputProps: { type: 'number', min: 1, step: 1 },
				optional: true
			},
			{
				key: 'remove_faulty_objects',
				label: 'Remove faulty objects',
				hint: 'Drops cells that are too small, touch the edge or mostly lie under a bigger cell',
				checkbox: true
			},
			{
				key: 'min_object_pixel_number',
				label: 'Min. object size (px)',
				inputProps: { type: 'number', min: 0, step: 1 }
			},
			{
				key: 'max_overlap_ratio',
				label: 'Max. overlap ratio',
				inputProps: { type: 'number', min: 0, max: 1, step: 0.01 }
			}
		],
		inheritance: [
			{
				key: 'max_centroid_distance',
				label: 'Max. centroid distance (px)',
				hint: "A track's mother is the nearest other track within this distance in its first frame",
				inputProps: { type: 'number', min: 0, step: 1 }
			}
		]
	};

	let step: VersionStep = $state('segmentation');
	// Svelte binds an empty number input as null
	let params: Record<string, string | number | boolean | null | undefined> = $state({});
	let errorMessage: string | null = $state(null);
	// What the task is doing, null when idle
	let progress: string | null = $state(null);
	let progressValue: number | null = $state(null);
	let busy = $derived(progress !== null);
	let controller: AbortController | null = null;

	/** Each step starts from its defaults. */
	function selectStep(next: VersionStep) {
		step = next;
		params = { ...defaultStepParams[next] };
	}

	// Opening proposes the step after the last one; closing stops a running task
	watch([() => isOpen], ([open]) => {
		if (!open) {
			controller?.abort();
			return;
		}
		selectStep(getNextStep(lastStep) ?? 'inheritance');
		errorMessage = null;
	});
	onDestroy(() => controller?.abort());

	// A running task holds the page: the Back button does nothing, and closing it asks first
	beforeNavigate((navigation) => {
		if (busy) navigation.cancel();
	});

	function handleRun(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		errorMessage = null;
		progress = 'Starting...';

		// Empty optional parameters are left out, so the step applies its own defaults
		const parameters = Object.fromEntries(
			Object.entries($state.snapshot(params))
				.filter(([, value]) => value != null)
				.map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
		) as AnyStepParams;

		const current = new AbortController();
		controller = current;
		run(step, parameters, current.signal, (message, fraction) => {
			if (controller !== current) return;
			progress = message;
			progressValue = fraction ?? null;
		})
			// A cancelled run may settle after the next one has started
			.then(() => {
				if (controller === current) isOpen = false;
			})
			.catch((error: unknown) => {
				if (controller === current && !current.signal.aborted)
					errorMessage = extractError(error);
			})
			.finally(() => {
				if (controller !== current) return;
				controller = null;
				progress = null;
				progressValue = null;
			});
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<!-- A running task stops on Cancel only, not on a stray click -->
	<Dialog.Content
		class="sm:max-w-lg"
		showCloseButton={!busy}
		onInteractOutside={(e) => busy && e.preventDefault()}
		onEscapeKeydown={(e) => busy && e.preventDefault()}
	>
		<form class="grid gap-4" onsubmit={handleRun}>
			<Dialog.Header>
				<Dialog.Title>Run task</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>

			<fieldset
				class="grid min-w-0 grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3"
				disabled={busy}
			>
				{@render children?.()}

				<Label for="{uid}-step">Step</Label>
				<Select.Root
					type="single"
					value={step}
					onValueChange={(next) => selectStep(next as VersionStep)}
				>
					<Select.Trigger id="{uid}-step" class="w-full capitalize">
						{step}
					</Select.Trigger>
					<Select.Content>
						{#each versionStepOrder as option (option)}
							<Select.Item value={option} label={option} class="capitalize" />
						{/each}
					</Select.Content>
				</Select.Root>
				{#if step === 'segmentation' && cells > 0}
					<p class="text-destructive col-start-2 -mt-1.5 text-xs">
						Replaces the project's {cells} cells; the editor's Undo brings them back
					</p>
				{/if}

				{#each fields[step] as field (field.key)}
					{@const id = `${uid}-${field.key}`}
					<Label for={id}>{field.label}</Label>
					{#if field.checkbox}
						<Checkbox
							{id}
							checked={params[field.key] === true}
							onCheckedChange={(checked) => (params[field.key] = checked)}
						/>
					{:else if field.options}
						<Select.Root
							type="single"
							value={String(params[field.key])}
							onValueChange={(value) => (params[field.key] = value)}
						>
							<Select.Trigger {id} class="w-full">
								{field.options.find(({ value }) => value === params[field.key])
									?.label}
							</Select.Trigger>
							<Select.Content>
								{#each field.options as option (option.value)}
									<Select.Item {...option} />
								{/each}
							</Select.Content>
						</Select.Root>
					{:else}
						<Input
							{id}
							{...field.inputProps}
							required={!field.optional}
							bind:value={params[field.key]}
						/>
					{/if}
					{#if field.hint}
						<p class="text-muted-foreground col-start-2 -mt-1.5 text-xs">
							{field.hint}
						</p>
					{/if}
				{/each}
			</fieldset>

			{#if errorMessage}
				<p class="text-destructive text-xs">{errorMessage}</p>
			{/if}

			<Dialog.Footer class="items-center">
				{#if progress !== null}
					<div class="mr-auto flex min-w-0 flex-1 flex-col items-start">
						<span class="text-muted-foreground text-left text-sm">{progress}</span>
						{#if progressValue !== null}
							<Progress value={progressValue * 100} class="mt-1.5 max-w-36" />
						{/if}
					</div>
				{/if}
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
				<Button type="submit" disabled={busy}>
					{#if busy}
						<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					Run
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
