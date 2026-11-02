<script lang="ts">
	import { resolve } from '$app/paths';
	import { HardDriveIcon } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { hasWebGpu, holdingStep, type ComputeDevice } from '$lib/compute/run';
	import { optionsState } from '$lib/states/options.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import type { TrackType, VersionManaged } from '$lib/types/annotation.type';
	import type { VersionStep } from '$lib/types/api.type';
	import { decompressJson, type DBProject } from '$lib/utils/indexeddb';
	import { toastError } from '$lib/api/errors';
	import ProjectList from '$lib/ui/menus/projects/ProjectList.svelte';
	import ProjectItem from '$lib/ui/menus/projects/ProjectItem.svelte';
	import RunTaskDialog from '$lib/ui/menus/projects/RunTaskDialog.svelte';

	const uid = $props.id();

	type Running = {
		project: DBProject;
		refetch: () => void;
		cells: number;
		lastStep: VersionStep | null;
	};
	// The project the task dialog runs on, with its list's refetch
	let running: Running | null = $state(null);
	let showRunDialog = $state(false);

	async function openRun(project: DBProject, refetch: () => void) {
		try {
			const { current } = await decompressJson<VersionManaged<TrackType[]>>(
				project.annotation
			);
			// Cells imported or drawn in the editor came without a step run here
			const lastStep =
				project.step ??
				(current.some((cell) => cell.TrackID !== null)
					? 'tracking'
					: current.length > 0
						? 'segmentation'
						: null);
			running = { project, refetch, cells: current.length, lastStep };
			showRunDialog = true;
		} catch (error) {
			toastError("Couldn't read the project", error);
		}
	}

	const devices: Record<ComputeDevice, string> = {
		gpu: 'WebGPU',
		cpu: 'CPU (slow)'
	};
	let gpuAvailable = $state(true);
	void hasWebGpu().then((available) => (gpuAvailable = available));
	const device: ComputeDevice = $derived(
		gpuAvailable ? optionsState.computeDevice.current : 'cpu'
	);
</script>

<div class="mx-auto mt-24 flex w-3/5 flex-col items-center gap-10">
	<ProjectList title="Local Projects" listProjects={() => projectState.listLocalProjects()}>
		{#snippet item(project, refetch)}
			<ProjectItem
				href={resolve(`/editor?project=local_${project.id}`)}
				icon={HardDriveIcon}
				{project}
				onRun={() => openRun(project, refetch)}
				onRename={(name) =>
					projectState.renameLocalProject(project.id!, name).then(refetch)}
				deleteDescription={`"${project.name}" will be removed from this browser.`}
				onDelete={() => projectState.deleteLocalProject(project.id!).finally(refetch)}
			>
				{#if project.step}Last task: {project.step}{/if}
			</ProjectItem>
		{/snippet}
	</ProjectList>
</div>

{#if running}
	{@const { project, refetch, cells, lastStep } = running}
	<RunTaskDialog
		bind:isOpen={showRunDialog}
		description={`On local project "${project.name}"`}
		{lastStep}
		{cells}
		run={(step, parameters, signal, onProgress) =>
			holdingStep(() =>
				projectState.runLocalTask(project.id!, step, parameters, device, signal, onProgress)
			).then(() => {
				toast.success(`${step[0].toUpperCase()}${step.slice(1)} finished`);
				refetch();
			})}
	>
		<Label for="{uid}-device">Device</Label>
		<Select.Root
			type="single"
			value={device}
			onValueChange={(next) => (optionsState.computeDevice.current = next as ComputeDevice)}
		>
			<Select.Trigger id="{uid}-device" class="w-full">{devices[device]}</Select.Trigger>
			<Select.Content>
				{#each Object.entries(devices) as [value, label] (value)}
					<Select.Item {value} {label} disabled={value === 'gpu' && !gpuAvailable} />
				{/each}
			</Select.Content>
		</Select.Root>
		{#if !gpuAvailable}
			<p class="text-muted-foreground col-start-2 -mt-1.5 text-xs">
				This browser doesn't support WebGPU, so the steps run on the CPU
			</p>
		{/if}
	</RunTaskDialog>
{/if}
