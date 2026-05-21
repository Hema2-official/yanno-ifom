<script lang="ts">
	import { onMount } from 'svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import {
		annotation,
		currentFrameId,
		currentProject,
		currentProjectVersion,
		displayFrames,
		pushChange,
		redoChange,
		saveToServer,
		savingIndicator,
		undoChange
	} from '$lib/stores/data';
	import type { Snippet } from 'svelte';
	import TopBar from '$lib/UI/Navigation/TopBar.svelte';
	import * as Menubar from '$lib/components/ui/menubar';
	import { optionsState } from '$lib/states/options.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { CloudIcon, CloudSyncIcon } from 'lucide-svelte';
	import type { NewCellType } from '$lib/types/annotation.type';
	import { dataTypeToText, download } from '$lib/utils/data.svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		// Global shortcuts
		// TODO: centralize this and provide configuration
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 's' && e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();

				// Save
				console.log('Save');
				saveToServer();
			}

			if (e.key === 'z' && e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();

				// Undo
				console.log('Undo');
				undoChange();
			}

			if (e.key === 'y' && e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();

				// Redo
				console.log('Redo');
				redoChange();
			}

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
		// Find an ID that doesn't exist amongst the $displayFrames' cells
		const existingCellIds = $displayFrames.flatMap((f) => f.cells.map((c) => c.id));
		let newCellId = 1;
		while (existingCellIds.includes(newCellId)) newCellId++;

		// Create a new cell (at center)
		const newCell: NewCellType = {
			id: newCellId,
			bodies: [
				{
					x: [256, 258, 260, 258, 256, 254, 252, 254],
					y: [252, 254, 256, 258, 260, 258, 256, 254]
				}
			]
		};

		// Push a change with the new cell
		pushChange({
			time: Date.now(),
			message: `Add new cell ${newCellId}`,
			frames: [{ id: $currentFrameId, cells: [newCell] }]
		});
	};

	const exportAsJSON = () => {
		download(
			JSON.stringify($annotation),
			$currentProject.name + '_' + $currentProjectVersion.id + '.json',
			'application/json'
		);
	};

	const exportAsTXT = () => {
		download(
			dataTypeToText($annotation),
			$currentProject.name + '_' + $currentProjectVersion.id + '.txt',
			'text/plain'
		);
	};
</script>

<div class="flex flex-col items-center justify-start h-screen w-full">
	<TopBar>
		{#snippet extraCrumbs()}
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="flex items-center gap-1">
						<Breadcrumb.Link>{$currentProject?.name}</Breadcrumb.Link>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start">
						{#each $currentProject?.versions ?? [] as projectVersion}
							<DropdownMenu.Item
								disabled={projectVersion.id == $currentProjectVersion?.id}
								onSelect={() => {}}
								>{projectVersion.name}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{$currentProjectVersion?.name}</Breadcrumb.Page>
			</Breadcrumb.Item>
			<Breadcrumb.Item>
				<!-- TODO: indicate offline editing, etc. -->
				{#if $savingIndicator}
					<CloudSyncIcon size={18} />
					Saving...
				{:else}
					<CloudIcon size={18} />
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
					<Menubar.Item onSelect={saveToServer}>Save</Menubar.Item>
					<Menubar.Item>Save as...</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item onSelect={exportAsJSON}>Export as JSON</Menubar.Item>
					<Menubar.Item onSelect={exportAsTXT}>Export as TXT</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
			<Menubar.Menu>
				<Menubar.Trigger>Edit</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item onSelect={undoChange}>
						Undo <Menubar.Shortcut>⌘Z</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Item onSelect={redoChange}>
						Redo <Menubar.Shortcut>⇧⌘Z</Menubar.Shortcut>
					</Menubar.Item>
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
