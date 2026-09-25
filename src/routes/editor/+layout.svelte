<script lang="ts">
	import { onMount } from 'svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { toolRegistry, type ToolId } from '$lib/ui/editor-tools/registry';
	import type { Snippet } from 'svelte';
	import TopBar from '$lib/ui/navigation/TopBar.svelte';
	import * as Menubar from '$lib/components/ui/menubar';
	import { optionsState } from '$lib/states/options.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { CloudAlertIcon, CloudIcon, CloudOffIcon, CloudSyncIcon } from '@lucide/svelte';
	import { download, tracksToText } from '$lib/utils/data.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { editSession } from '$lib/states/EditSessionState.svelte';
	import EditLockStatus from '$lib/ui/annotation/EditLockStatus.svelte';
	import { beforeNavigate } from '$app/navigation';

	let { children }: { children: Snippet } = $props();

	beforeNavigate((navigation) => {
		// Commits save lazily and undos are local: flush them before leaving
		if (annotationState.isDirty) {
			annotationState.save();
			if (navigation.willUnload) navigation.cancel();
		}
	});

	// Shortcuts must not steal keystrokes from text fields
	const isTypingTarget = (e: KeyboardEvent) =>
		e.target instanceof HTMLElement &&
		(e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));

	// Dialogs own the keyboard entirely; open menus only take Escape (any
	// other shortcut closes the display's context menu as a side effect)
	const isOpen = (roles: string) =>
		document.querySelector(`[data-state="open"]:is(${roles})`) !== null;
	const isDialogOpen = () => isOpen('[role="dialog"], [role="alertdialog"]');
	const isMenuOpen = () => isOpen('[role="menu"]');

	// Escape is the cursor tool's shortcut, handled apart from the others
	const shortcutTools = new Map(
		Object.entries(toolRegistry)
			.filter(([, tool]) => tool.shortcut !== 'Escape')
			.map(([id, tool]) => [tool.shortcut.toLowerCase(), id as ToolId])
	);

	onMount(() => {
		// Global shortcuts
		// TODO: centralize this and provide configuration
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isTypingTarget(e) || isDialogOpen()) return;

			if (e.ctrlKey || e.metaKey) {
				if (e.key.toLowerCase() === 'z') {
					e.preventDefault();
					if (e.shiftKey) annotationState.redo();
					else annotationState.undo();
				} else if (e.key === 'y') {
					e.preventDefault();
					annotationState.redo();
				}
				return;
			}
			if (e.altKey) return;

			if (e.key === 'Escape') {
				if (!isMenuOpen()) editorState.reset();
				return;
			}

			if (e.key === 'Delete' || e.key === 'Backspace') {
				if (editorState.selectedCells.length === 0 || projectState.readOnly) return;
				e.preventDefault();
				annotationState.deleteCells(editorState.selectedCells);
				return;
			}

			const tool = shortcutTools.get(e.key.toLowerCase());
			if (tool) {
				e.preventDefault();
				editorState.tool = tool;
				return;
			}

			// Hold Space to hide the annotation
			if (e.key === ' ') {
				e.preventDefault();
				svgState.isSvgShown = false;
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (isTypingTarget(e)) return;

			if (e.key === ' ') {
				e.preventDefault();
				svgState.isSvgShown = true;
			}
		};

		// Disable accidental UI zooming on touchpads
		const preventPageZoom = (e: WheelEvent) => {
			if (e.ctrlKey) e.preventDefault();
		};

		document.body.addEventListener('keydown', handleKeyDown);
		document.body.addEventListener('keyup', handleKeyUp);
		window.addEventListener('wheel', preventPageZoom, { passive: false });

		return () => {
			document.body.removeEventListener('keydown', handleKeyDown);
			document.body.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('wheel', preventPageZoom);
			// Leaving the editor frees the version's edit lock for others
			void editSession.stop();
		};
	});

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

			<Breadcrumb.Item class="ml-4 [&_svg]:mt-0.5 [&_svg]:size-4.5">
				<Tooltip.Provider delayDuration={200}>
					<Tooltip.Root>
						{#if projectState.readOnly}
							<EditLockStatus />
						{:else if projectState.cloudProject && projectState.isSaving}
							<CloudSyncIcon /> Saving...
						{:else if projectState.saveError}
							<!-- TODO: make the clickability more obvious either by saying click to retry or adding an actual Button next to the status -->
							<Tooltip.Trigger
								class="text-destructive inline-flex items-center gap-1"
								onclick={() => annotationState.save()}
							>
								<CloudAlertIcon />
								{projectState.cloudProject ? 'Out of sync' : 'Not saved'}
							</Tooltip.Trigger>
							<Tooltip.Content class="flex-col items-start">
								<span>{projectState.saveError}</span>
								<span class="opacity-70">Click to retry saving</span>
							</Tooltip.Content>
						{:else if projectState.cloudProject}
							<Tooltip.Trigger><CloudIcon /></Tooltip.Trigger>
							<Tooltip.Content>
								{#if annotationState.isDirty}Unsaved changes
								{:else}Synchronized with the cloud{/if}
							</Tooltip.Content>
						{:else}
							<CloudOffIcon />
							<span class="text-muted-foreground">Editing locally</span>
						{/if}
					</Tooltip.Root>
				</Tooltip.Provider>
			</Breadcrumb.Item>
		{/snippet}

		{#snippet extraFileMenuItems()}
			<Menubar.Separator />
			<Menubar.Item onSelect={exportAsJSON} disabled={!annotationState.data}>
				Export as JSON
			</Menubar.Item>
			<Menubar.Item onSelect={exportAsTXT} disabled={!annotationState.data}>
				Export as TXT
			</Menubar.Item>
		{/snippet}

		{#snippet extraMenus()}
			{#if !projectState.readOnly}
				<Menubar.Menu>
					<Menubar.Trigger>Edit</Menubar.Trigger>
					<Menubar.Content>
						<Menubar.Item
							onSelect={() => annotationState.undo()}
							disabled={!annotationState.canUndo}
						>
							Undo <Menubar.Shortcut>⌘Z</Menubar.Shortcut>
						</Menubar.Item>
						<Menubar.Item
							onSelect={() => annotationState.redo()}
							disabled={!annotationState.canRedo}
						>
							Redo <Menubar.Shortcut>⇧⌘Z</Menubar.Shortcut>
						</Menubar.Item>
						<Menubar.Separator />
						<Menubar.Item onSelect={() => (editorState.tool = 'draw')}>
							New Cell <Menubar.Shortcut>N</Menubar.Shortcut>
						</Menubar.Item>
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
			{/if}
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
