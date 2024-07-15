<script lang="ts">
	import Spinner from '../Common/Spinner.svelte';
	import CreateProject from './CreateProject.svelte';
	import getProjects from '$lib/api/projects/getProjects';
	import { type Project, ProjectStatus } from '$lib/types/api.type';
	import { onMount } from 'svelte';

	export let onOpen: (project: Project) => void;

	let loading = true;
	let createProjectShown = false;

	let projects: Project[] = [];

	const refresh = () => {
		loading = true;
		getProjects()
			.then((response) => {
				console.log(response);
				projects = response;

				// Sort projects by status:
				const order = [
					ProjectStatus.uploading,
					ProjectStatus.processing,
					ProjectStatus.failed,
					ProjectStatus.ready,
					ProjectStatus.pending,
					ProjectStatus.editing
				];
				projects.sort((a, b) => {
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

	onMount(() => setTimeout(refresh, 500));
</script>

<div class="project-list" class:loading>
	{#if loading}
		<Spinner />
	{:else}
		{#each projects as project}
			<button class="project-card" on:click={() => onOpen(project)}>
				<h3 class="name">{project.name}</h3>
				<div class="status">
					<p class="status-text {project.status}">Status: {project.status}</p>
					{#if project.status === 'processing'}
						<Spinner size={14} thickness={3} transitionSpeed={0.3} />
					{/if}
				</div>
			</button>
		{/each}
		<button class="new-project" on:click={() => (createProjectShown = true)}>
			+ New Project
		</button>
	{/if}
	{#if createProjectShown}
		<CreateProject onCreate={refresh} onCancel={() => (createProjectShown = false)} />
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
		cursor: pointer;

		.name {
			color: var(--color);
			margin: 0;
			margin-bottom: 6px;
			font-size: 20px;
			opacity: 0.85;
			transition: opacity 0.3s;
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

			.name {
				opacity: 1;
			}

			.status {
				opacity: 0.9;
			}
		}
	}

	.new-project {
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

		&:hover {
			opacity: 1;
		}
	}
</style>
