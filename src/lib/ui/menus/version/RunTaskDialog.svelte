<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { enqueueTask } from '$lib/api/projects';
	import { extractError } from '$lib/api/errors';
	import {
		type AnyStepParams,
		type ProjectVersion,
		type StepParams,
		type VersionStep,
		defaultStepParams,
		getNextStep,
		versionStepOrder
	} from '$lib/types/api.type';
	import { knownSegmentationModels, knownTrackingModels } from '$lib/utils/models';
	import { watch } from 'runed';
	import { LoaderCircleIcon } from '@lucide/svelte';
	import type { ComponentProps } from 'svelte';

	type Props = {
		isOpen: boolean;
		version: ProjectVersion | null;
		onRefresh: () => void;
	};

	let { isOpen = $bindable(false), version, onRefresh }: Props = $props();

	const uid = $props.id();

	/** A step parameter: a checkbox, or a text or number input. */
	type Field<P> = {
		key: keyof P & string;
		label: string;
		hint?: string;
		checkbox?: boolean;
		optional?: boolean;
		inputProps?: ComponentProps<typeof Input>;
	};

	// Inheritance has a single method, so it goes out as the default
	const fields: { [S in VersionStep]: Field<StepParams[S]>[] } = {
		segmentation: [
			{ key: 'model_name', label: 'Model', inputProps: { list: 'segmentation-models' } },
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
				hint: 'Must carry the time kernel size, like "_FBtr7_"',
				// The backend reads the kernel size from the name and crashes without it
				inputProps: { pattern: '.*_FBtr\\d+_.*', list: 'tracking-models' }
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
	let busy = $state(false);
	let errorMessage: string | null = $state(null);

	/** Each step starts from its defaults. */
	function selectStep(next: VersionStep) {
		step = next;
		params = { ...defaultStepParams[next] };
	}

	// Opening proposes the step after the version's own
	watch([() => isOpen], ([open]) => {
		if (!open) return;
		selectStep(getNextStep(version?.step) ?? 'inheritance');
		errorMessage = null;
	});

	function handleRun(e: SubmitEvent) {
		e.preventDefault();
		if (!version || busy) return;
		busy = true;
		errorMessage = null;

		// Empty optional parameters are left out, so the backend applies its own defaults
		const parameters = Object.fromEntries(
			Object.entries($state.snapshot(params))
				.filter(([, value]) => value != null)
				.map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
		) as AnyStepParams;

		enqueueTask(version, { step, parameters })
			.then(() => {
				isOpen = false;
				onRefresh();
			})
			.catch((error: unknown) => {
				errorMessage = extractError(error);
			})
			.finally(() => {
				busy = false;
			});
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" onsubmit={handleRun}>
			<Dialog.Header>
				<Dialog.Title>Run server task</Dialog.Title>
				<Dialog.Description>On version "{version?.name}"</Dialog.Description>
			</Dialog.Header>

			<div class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
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

				{#each fields[step] as field (field.key)}
					{@const id = `${uid}-${field.key}`}
					<Label for={id}>{field.label}</Label>
					{#if field.checkbox}
						<Checkbox
							{id}
							checked={params[field.key] === true}
							onCheckedChange={(checked) => (params[field.key] = checked)}
						/>
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
			</div>

			{#if errorMessage}
				<p class="text-destructive text-xs">{errorMessage}</p>
			{/if}

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })} disabled={busy}>
					Cancel
				</Dialog.Close>
				<Button type="submit" disabled={!version?.ready || busy}>
					{#if busy}
						<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					Run
				</Button>
			</Dialog.Footer>

			<!-- Model options for form input autocomplete -->
			<datalist id="segmentation-models">
				{#each knownSegmentationModels as name (name)}<option value={name}></option>{/each}
			</datalist>
			<datalist id="tracking-models">
				{#each knownTrackingModels as name (name)}<option value={name}></option>{/each}
			</datalist>
		</form>
	</Dialog.Content>
</Dialog.Root>
