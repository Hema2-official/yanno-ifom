<script lang="ts">
	import { onMount } from 'svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	// import { redoChange, undoChange } from '$lib/stores/data';
	import type { Snippet } from 'svelte';
	import TopBar from '$lib/ui/navigation/TopBar.svelte';
	import * as Menubar from '$lib/components/ui/menubar';
	import { optionsState } from '$lib/states/options.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { CloudIcon, CloudOffIcon, CloudSyncIcon } from '@lucide/svelte';
	import { download, tracksToText } from '$lib/utils/data.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		// Global shortcuts
		// TODO: centralize this and provide configuration
		const handleKeyDown = (e: KeyboardEvent) => {
			// if (e.key === 'z' && e.ctrlKey) {
			// 	e.preventDefault();
			// 	e.stopPropagation();

			// 	// Undo
			// 	console.log('Undo');
			// 	undoChange();
			// }

			// if (e.key === 'y' && e.ctrlKey) {
			// 	e.preventDefault();
			// 	e.stopPropagation();

			// 	// Redo
			// 	console.log('Redo');
			// 	redoChange();
			// }

			// hold space to hide annotation
			if (e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();

				// Hide annotation
				svgState.isSvgShown = false;
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();

				// Show annotation
				svgState.isSvgShown = true;
			}
		};

		document.body.addEventListener('keydown', handleKeyDown);
		document.body.addEventListener('keyup', handleKeyUp);

		return () => {
			document.body.removeEventListener('keydown', handleKeyDown);
			document.body.removeEventListener('keyup', handleKeyUp);
		};
	});

	const createNewCell = () => {
		// TODO: implement
		// // Find an ID that doesn't exist amongst the current frames' cells
		// const existingCellIds = annotationState.currentFrame?.map((f) => f.ObjectID) ?? [];
		// let newCellId = 1;
		// while (existingCellIds.includes(newCellId)) newCellId++;
		// // Create a new cell (at center)
		// const newCell: NewCellType = {
		// 	id: newCellId,
		// 	bodies: [
		// 		{
		// 			x: [256, 258, 260, 258, 256, 254, 252, 254],
		// 			y: [252, 254, 256, 258, 260, 258, 256, 254]
		// 		}
		// 	]
		// };
		// // Push a change with the new cell
		// pushChange({
		// 	time: Date.now(),
		// 	message: `Add new cell ${newCellId}`,
		// 	frames: [{ id: annotationState.currentFrameIndex, cells: [newCell] }]
		// });
	};

	const exportAsJSON = () => {
		if (!annotationState.data) return;
		download(
			JSON.stringify(annotationState.data),
			projectState.name + '_' + (projectState.versionName ?? 'local project') + '.json',
			'application/json'
		);
	};

	const exportAsTXT = () => {
		if (!annotationState.data) return;
		download(
			tracksToText(annotationState.data.current),
			projectState.name + '_' + (projectState.versionName ?? 'local project') + '.txt',
			'text/plain'
		);
	};
</script>

<div class="flex h-screen w-full flex-col items-center justify-start">
	<TopBar>
		{#snippet extraCrumbs()}
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="flex items-center gap-1">
						<Breadcrumb.Link>{projectState.name}</Breadcrumb.Link>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start">
						{#if projectState.cloudProject}
							{#each projectState.cloudProject.versions as version (version.id)}
								<DropdownMenu.Item
									disabled={version.id == projectState.cloudVersion?.id}
									onSelect={() => {
										// TODO: warn user about unsaved changes, load new version
									}}
									>{version.name}
								</DropdownMenu.Item>
							{/each}
						{:else}
							<DropdownMenu.Item disabled>This is a local project</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Breadcrumb.Item>

			{#if projectState.cloudVersion}
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{projectState.versionName}</Breadcrumb.Page>
				</Breadcrumb.Item>
			{/if}

			<Breadcrumb.Item>
				{#if projectState.cloudProject && projectState.isSaving}
					<CloudSyncIcon size={18} />
					Saving...
				{:else if projectState.cloudProject}
					<CloudIcon size={18} />
				{:else}
					<CloudOffIcon size={18} />
					<span class="text-muted-foreground">Editing locally</span>
				{/if}
			</Breadcrumb.Item>
		{/snippet}

		{#snippet extraMenus()}
			<Menubar.Menu>
				<Menubar.Trigger>File</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item onSelect={() => window.open('/', '_blank')}>
						New Tab <Menubar.Shortcut>⌘T</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item>Open project...</Menubar.Item>
					<Menubar.Item>Open offline...</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item>Save</Menubar.Item>
					<Menubar.Item>Save as...</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item onSelect={exportAsJSON} disabled={!annotationState.data}>
						Export as JSON
					</Menubar.Item>
					<Menubar.Item onSelect={exportAsTXT} disabled={!annotationState.data}>
						Export as TXT
					</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
			<Menubar.Menu>
				<Menubar.Trigger>Edit</Menubar.Trigger>
				<Menubar.Content>
					<!-- <Menubar.Item onSelect={undoChange}>
						Undo <Menubar.Shortcut>⌘Z</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Item onSelect={redoChange}>
						Redo <Menubar.Shortcut>⇧⌘Z</Menubar.Shortcut>
					</Menubar.Item> -->
					<Menubar.Separator />
					<Menubar.Item onSelect={createNewCell}>New Cell...</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Sub>
						<Menubar.SubTrigger>Find</Menubar.SubTrigger>
						<Menubar.SubContent>
							<Menubar.Item>Search the web</Menubar.Item>
							<Menubar.Separator />
							<Menubar.Item>Find...</Menubar.Item>
							<Menubar.Item>Find Next</Menubar.Item>
							<Menubar.Item>Find Previous</Menubar.Item>
						</Menubar.SubContent>
					</Menubar.Sub>
					<Menubar.Separator />
					<Menubar.Item>Cut</Menubar.Item>
					<Menubar.Item>Copy</Menubar.Item>
					<Menubar.Item>Paste</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
			<Menubar.Menu>
				<Menubar.Trigger>View</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item inset>Zoom In</Menubar.Item>
					<Menubar.Item inset>Zoom Out</Menubar.Item>
					<Menubar.Item inset>Reset Zoom</Menubar.Item>
					<Menubar.Separator />
					<Menubar.CheckboxItem bind:checked={optionsState.sidebarRight}>
						Sidebar on the right
					</Menubar.CheckboxItem>
					<Menubar.Separator />
					<Menubar.CheckboxItem bind:checked={optionsState.autoResample}>
						Auto Resample
					</Menubar.CheckboxItem>
				</Menubar.Content>
			</Menubar.Menu>
		{/snippet}
	</TopBar>

	{@render children()}
</div>
