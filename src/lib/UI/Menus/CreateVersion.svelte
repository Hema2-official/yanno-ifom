<script lang="ts">
	import Spinner from '../Common/Spinner.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createProjectVersion } from '$lib/api/projects';
	import { onMount } from 'svelte';
	import {
		type InheritanceParams,
		type Project,
		type ProjectVersion,
		defaultSegmentationParams,
		defaultTrackingParams,
		getAutoName,
		getNextStep
	} from '$lib/types/api.type';
	import TextBox from '../Common/TextBox.svelte';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	let {
		onCreate,
		onCancel,
		project
	}: { onCreate: () => void; onCancel: () => void; project: Project } = $props();

	let containerElement: HTMLDivElement;

	let loading = $state(false);
	let error_message: string | undefined = $state(undefined);

	let selectedIdx: number | undefined = $state(undefined);
	let possibleVersions = $derived(
		project.versions.filter((version) => version.step !== 'inheritance')
	);
	let sourceVersion = $derived(
		selectedIdx !== undefined ? possibleVersions[selectedIdx] : undefined
	);
	let step = $derived(getNextStep(sourceVersion?.step));

	let autoName = $derived(getAutoName(step!, sourceVersion?.name));
	let nameChanged = $state(false);
	let name: string = $state('');
	$effect(() => {
		if (!nameChanged) name = autoName;
	});

	let parameters = $derived(
		{
			segmentation: defaultSegmentationParams,
			tracking: defaultTrackingParams,
			inheritance: {} as InheritanceParams
		}[step!]
	);

	let allowSubmit = $derived(!!name);

	const onChange = () => {
		nameChanged = name !== autoName;
	};

	const handleCancel = () => {
		onCancel();
	};

	const handleCreate = () => {
		if (!name) return;

		loading = true;
		error_message = undefined;

		console.debug('Creating version:', project.id, name, sourceVersion?.id);
		createProjectVersion(project.id, name, parameters, sourceVersion?.id)
			.then((response: ProjectVersion) => {
				console.debug('Created version:', response);
				onCreate();
				onCancel();
			})
			.catch((error: Error) => {
				error_message = error.message;
			})
			.finally(() => {
				loading = false;
			});
	};

	onMount(() => {
		// Get focus
		containerElement.querySelector('input')?.focus();
	});
</script>

<div class="create-version-container" bind:this={containerElement}>
	<form class="create-version" class:loading>
		<h3 class="title">New Version</h3>

		<div class="run-on-wrapper">
			Run {getNextStep(sourceVersion?.step)} on
			<Select
				type="single"
				value={selectedIdx !== undefined ? String(selectedIdx) : ''}
				onValueChange={(v) => (selectedIdx = v ? parseInt(v) : undefined)}
			>
				<SelectTrigger>
					{#snippet children({ value }: { value: string })}
						<span
							>{value !== ''
								? project.versions[parseInt(value)]?.name
								: 'Original data'}</span
						>
					{/snippet}
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="-1" label="Original data" />
					{#each project.versions as version, i}
						<SelectItem value={String(i)} label={version.name} />
					{/each}
				</SelectContent>
			</Select>
		</div>
		<TextBox bind:value={name} disabled={loading} {onChange}>Name</TextBox>

		{#if error_message}<p class="error-message">{error_message}</p>{/if}
		{#if loading}
			<Spinner />
		{:else}
			<div class="buttons">
				<Button variant="secondary" type="button" onclick={handleCancel}>Cancel</Button>
				<Button type="submit" onclick={handleCreate} disabled={!allowSubmit}>Create</Button>
			</div>
		{/if}
	</form>
</div>

<style lang="scss">
	.create-version-container {
		position: fixed;
		top: 0;
		left: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
		width: 100%;
		backdrop-filter: blur(2px);
		user-select: none;
	}

	.create-version {
		display: flex;
		flex-direction: column;
		align-items: start;
		width: 400px;
		background-color: var(--background-color);
		padding: 16px 24px;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

		.title {
			margin: 0;
			font-size: 24px;
			font-weight: 500;
			color: var(--color);
		}

		.run-on-wrapper {
			display: flex;
			align-items: center;
			gap: 4px;
		}

		.buttons {
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: end;
			gap: 8px;
		}

		.error-message {
			margin: 0;
			font-size: 12px;
			color: red;
			padding: 0 4px 4px 4px;
			width: 100%;
		}
	}
</style>
