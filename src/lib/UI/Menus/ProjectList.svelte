<script lang="ts">
	import Spinner from '../Common/Spinner.svelte';
	import CreateProject from './CreateProject.svelte';
	import getProjects from '$lib/api/projects/getProjects';
	import TrashSVG from '$lib/UI/SVG/TrashSVG.svelte';
	import PencilSVG from '$lib/UI/SVG/PencilSVG.svelte';
	import PlusSVG from '$lib/UI/SVG/PlusSVG.svelte';
	import UploadSVG from '$lib/UI/SVG/UploadSVG.svelte';
	import EditProject from './EditProject.svelte';
	import {
		type Project,
		ProjectStatus,
		type ProjectVersion,
		versionStepOrder
	} from '$lib/types/api.type';
	import { deleteProject, uploadSourceData } from '$lib/api/projects';
	import { onMount } from 'svelte';
	import CreateVersion from './CreateVersion.svelte';

	export let onSelect: (version: ProjectVersion) => void;

	let loading = true;

	let createProjectShown = false;

	let editProjectShown = false;
	let editProject: Project;

	let createVersionShown = false;
	let createVersionProject: Project;

	let projects: Project[] = [];

	const refresh = () => {
		loading = true;
		getProjects()
			.then((response) => {
				console.log(response);

				// Sort projects by status:
				const order = [ProjectStatus.uploading, ProjectStatus.ready, ProjectStatus.pending];
				projects = response.sort((a, b) => {
					return order.indexOf(a.status) - order.indexOf(b.status);
				});
			})
			.catch((error) => {
				console.error(error);
			})
			.finally(() => {
				loading = false;
			});
	};

	const onDelete = (project: Project) => {
		deleteProject(project.id).then(refresh);
	};

	const onEdit = (project: Project) => {
		editProject = project;
		editProjectShown = true;
	};

	const onCreateVersion = (project: Project) => {
		createVersionProject = project;
		createVersionShown = true;
	};

	const onUpload = (project: Project) => {
		// show file selector and then call uploadSourceData
		const file = document.createElement('input');
		file.type = 'file';
		file.accept = '.tif';
		file.multiple = false;
		file.style.display = 'none';
		file.onchange = (event) => {
			if (!(event.target instanceof HTMLInputElement)) return;
			const file = event.target.files?.[0];
			if (!file) return;
			project.status = ProjectStatus.uploading;
			projects = projects; // trigger re-render
			uploadSourceData(project.id, file).then(refresh);
		};
		file.click();
	};

	onMount(() => setTimeout(refresh, 500));
</script>

<div class="project-list" class:loading>
	{#if loading}
		<Spinner />
	{:else}
		{#each projects as project}
			<div class="project-card">
				<div class="header">
					<h3 class="name">{project.name}</h3>
					<div class="controls">
						<button
							class="control-button"
							on:click|stopPropagation={() => onDelete(project)}
						>
							<TrashSVG size={20} />
						</button>
						<button
							class="control-button"
							on:click|stopPropagation={() => onEdit(project)}
						>
							<PencilSVG size={20} />
						</button>
						{#if project.status === ProjectStatus.pending}
							<button
								class="control-button"
								on:click|stopPropagation={() => onUpload(project)}
							>
								<UploadSVG size={20} />
							</button>
						{:else if project.status === ProjectStatus.uploading}
							<Spinner size={20} thickness={4} />
						{/if}
					</div>
				</div>
				<div class="status">
					<p class="status-text {project.status}">Status: {project.status}</p>
				</div>
				<div class="status">
					<p class="status-text {project.color}">Color: {project.color}</p>
				</div>
				<div class="status">
					<p class="status-text {project.channel_period}">
						Channel period: {project.channel_period}
					</p>
				</div>
				<div class="status">
					<p class="status-text {project.start_period}">
						Start period: {project.start_period}
					</p>
				</div>
				<div class="version-columns">
					{#if project.status === ProjectStatus.ready}
						{#each versionStepOrder as step, index}
							<div class="step-column">
								<h3 class="step-header">{step}</h3>
								{#each project.versions.filter((version) => version.step === step) as version}
									<button class="version-card" on:click={() => onSelect(version)}>
										<p class="version-name">{version.name}</p>
										<p class="version-detail">
											{version.ready ? 'Ready' : 'Not ready'}
										</p>
									</button>
								{/each}
								{#if index === 0 && project.status === ProjectStatus.ready}
									<button
										class="new-version"
										on:click={() => onCreateVersion(project)}
									>
										<PlusSVG size="var(--plus-svg-size)" />
										New {step}
									</button>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
		<button class="new-project" on:click={() => (createProjectShown = true)}>
			<PlusSVG size="var(--plus-svg-size)" />
			New project
		</button>
	{/if}
	{#if createProjectShown}
		<CreateProject onCreate={refresh} onCancel={() => (createProjectShown = false)} />
	{/if}
	{#if editProjectShown}
		<EditProject
			project={editProject}
			onEdit={refresh}
			onCancel={() => (editProjectShown = false)}
		/>
	{/if}
	{#if createVersionShown}
		<CreateVersion
			project={createVersionProject}
			onCreate={refresh}
			onCancel={() => (createVersionShown = false)}
		/>
	{/if}
</div>

<style lang="scss">
	.project-list {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		width: 100%;
		gap: 16px;
		overflow-y: scroll;
		padding: 16px;

		&.loading {
			justify-content: center;
			pointer-events: none;
		}
	}

	.project-card {
		display: flex;
		flex-direction: column;
		align-items: start;
		width: 100%;
		padding: 16px;
		border-radius: 8px;
		border: none;
		outline: none;
		background: none;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: box-shadow 0.3s;
		user-select: none;

		.header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			margin-bottom: 6px;
			opacity: 0.85;
			transition: opacity 0.3s;

			.name {
				color: var(--color);
				font-size: 20px;
				margin: 0;
			}

			.controls {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 8px;

				.control-button {
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
					background: none;
					border: none;
					outline: none;
					padding: 0;
					cursor: pointer;
					opacity: 0.5;
					transition: opacity 0.3s;

					&:hover {
						opacity: 1;
					}
				}
			}
		}

		.status {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 8px;
			opacity: 0.6;
			transition: opacity 0.3s;

			.status-text {
				margin: 0;
				font-size: 16px;
				color: var(--color);
			}
		}

		&:hover,
		&:focus-visible {
			box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);

			.header {
				opacity: 1;
			}

			.status {
				opacity: 0.9;
			}
		}
	}

	.version-columns {
		display: flex;
		flex-direction: row;
		align-items: start;
		gap: 16px;
		width: 100%;

		.step-column {
			display: flex;
			flex-direction: column;
			align-items: start;
			gap: 8px;
			flex: 1;

			.step-header {
				font-size: 18px;
				font-weight: 600;
				color: var(--color);
				margin: 0;
				width: 100%;
				text-align: center;
				text-transform: capitalize;
			}
		}

		.version-card {
			display: flex;
			flex-direction: column;
			align-items: start;
			width: 100%;
			padding: 16px;
			border-radius: 8px;
			border: none;
			outline: none;
			background: none;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
			transition: box-shadow 0.3s;
			user-select: none;
			cursor: pointer;

			.version-name {
				font-size: 18px;
				font-weight: 600;
				color: var(--color);
				margin: 0;
			}

			.version-detail {
				font-size: 14px;
				margin: 0;
			}

			&:hover,
			&:focus-visible {
				box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
			}
		}
	}

	.new-project,
	.new-version {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: 100%;
		padding: 16px 16px;
		margin-bottom: 24px;
		border: none;
		border: 1px dashed var(--gray-accent);
		border-radius: 8px;
		outline: none;
		background: none;
		font-size: 18px;
		font-weight: 600;
		color: var(--color);
		opacity: 0.7;
		transition: opacity 0.3s;
		cursor: pointer;

		--plus-svg-size: 18px;

		&:hover {
			opacity: 1;
		}
	}
</style>
