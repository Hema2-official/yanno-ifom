<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useEventListener } from 'runed';
	import KeybindingScope from '$lib/keybindings/KeybindingScope.svelte';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import type { ActionId } from '$lib/keybindings/actions';
	import { comboLabel } from '$lib/keybindings/keys';
	import { isDialogOpen, isTypingTarget, keybindings } from '$lib/states/KeybindingState.svelte';
	import type { Snippet } from 'svelte';
	import TopBar from '$lib/ui/navigation/TopBar.svelte';
	import * as Menubar from '$lib/components/ui/menubar';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		ChevronDownIcon,
		CloudAlertIcon,
		CloudIcon,
		CloudOffIcon,
		CloudSyncIcon
	} from '@lucide/svelte';
	import { download, tracksToText } from '$lib/utils/export';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { editSession } from '$lib/states/EditSessionState.svelte';
	import EditLockStatus from '$lib/ui/annotation/EditLockStatus.svelte';
	import PasteDialog from '$lib/ui/annotation/PasteDialog.svelte';
	import TrackIdDialog from '$lib/ui/annotation/TrackIdDialog.svelte';
	import ExportFramesDialog from '$lib/ui/export/ExportFramesDialog.svelte';
	import ExportViewportDialog from '$lib/ui/export/ExportViewportDialog.svelte';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Project } from '$lib/types/api.type';
	import type { PathnameWithSearchOrHash } from '$app/types';

	let { children }: { children: Snippet } = $props();

	beforeNavigate((navigation) => {
		// Commits save lazily and undos are local: flush them before leaving
		if (annotationState.isDirty) {
			annotationState.save();
			if (navigation.willUnload) navigation.cancel();
		}
	});

	// Disable accidental UI zooming on touchpads
	useEventListener(
		() => window,
		'wheel',
		(e) => {
			if (e.ctrlKey) e.preventDefault();
		},
		{ passive: false }
	);

	const handlePaste = (e: ClipboardEvent) => {
		if (projectState.readOnly || !annotationState.data) return;
		if (isTypingTarget(e) || isDialogOpen()) return;
		const text = e.clipboardData?.getData('text/plain') ?? '';
		const frameIndex = inputState.pointer?.frameIndex ?? annotationState.currentFrameIndex;
		editorState.pasteText(frameIndex, text);
	};

	// Leaving the editor frees the version's edit lock for others
	onDestroy(() => void editSession.stop());

	/** The exported files' name, without the extension. */
	const exportName = $derived(
		`${projectState.name}_${projectState.versionName ?? 'local project'}`
	);

	let exportFramesOpen = $state(false);
	let exportViewportOpen = $state(false);

	const exportAsJSON = () => {
		if (!annotationState.data) return;
		download(JSON.stringify(annotationState.data), `${exportName}.json`, 'application/json');
	};

	const exportAsTXT = () => {
		if (!annotationState.data) return;
		download(tracksToText(annotationState.data.current), `${exportName}.txt`, 'text/plain');
	};

	const versionHref = (project: Project, versionId: string): PathnameWithSearchOrHash =>
		`/editor?project=${project.id}&version=${versionId}`;
</script>

<KeybindingScope scope="editor" />
<svelte:window onpaste={handlePaste} />

{#snippet actionItem(id: ActionId, title: string)}
	<Menubar.Item onSelect={() => keybindings.run(id)} disabled={!keybindings.isEnabled(id)}>
		{title}
		<Menubar.Shortcut>{keybindings.label(id)}</Menubar.Shortcut>
	</Menubar.Item>
{/snippet}

<div class="flex h-screen w-full flex-col items-center justify-start">
	<TopBar>
		{#snippet extraCrumbs()}
			<Breadcrumb.Separator />
			<!-- The project crumb leads back to its page; local projects have none -->
			<Breadcrumb.Item>
				{#if projectState.cloudProject}
					<Breadcrumb.Link
						href={resolve(`/projects?project=${projectState.cloudProject.id}`)}
					>
						{projectState.name}
					</Breadcrumb.Link>
				{:else}
					<Breadcrumb.Page>{projectState.name}</Breadcrumb.Page>
				{/if}
			</Breadcrumb.Item>

			{#if projectState.cloudProject && projectState.cloudVersion}
				{@const project = projectState.cloudProject}
				<Breadcrumb.Separator />
				<!-- The version crumb switches versions: the page reloads, saving this one first -->
				<Breadcrumb.Item>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger class="flex items-center gap-1">
							<Breadcrumb.Page>{projectState.versionName}</Breadcrumb.Page>
							<ChevronDownIcon class="size-4 opacity-70" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							<DropdownMenu.Group>
								<DropdownMenu.GroupHeading>Versions</DropdownMenu.GroupHeading>
								<DropdownMenu.RadioGroup
									value={projectState.cloudVersion.id}
									onValueChange={(id) => goto(resolve(versionHref(project, id)))}
								>
									{#each project.versions as version (version.id)}
										<DropdownMenu.RadioItem
											value={version.id}
											disabled={!version.ready}
										>
											{version.name}
											{#if !version.ready}
												<span class="text-muted-foreground"
													>(processing)</span
												>
											{/if}
										</DropdownMenu.RadioItem>
									{/each}
								</DropdownMenu.RadioGroup>
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Breadcrumb.Item>
			{/if}

			<Breadcrumb.Item class="ml-2 [&_svg]:mt-0.5 [&_svg]:size-4.5">
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
					{:else if projectState.localProject}
						<CloudOffIcon />
						<span class="text-muted-foreground">Editing locally</span>
					{/if}
				</Tooltip.Root>
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
			<Menubar.Item
				onSelect={() => (exportFramesOpen = true)}
				disabled={projectState.frameCount === 0}
			>
				Export frames...
			</Menubar.Item>
		{/snippet}

		{#snippet extraMenus()}
			{#if !projectState.readOnly}
				<Menubar.Menu>
					<Menubar.Trigger>Edit</Menubar.Trigger>
					<Menubar.Content>
						{@render actionItem('undo', 'Undo')}
						{@render actionItem('redo', 'Redo')}
						<Menubar.Separator />
						{@render actionItem('tool.draw', 'New Cell')}
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
						{@render actionItem('cut', 'Cut')}
						{@render actionItem('copy', 'Copy')}
						<Menubar.Item
							onSelect={() =>
								void editorState.pasteText(annotationState.currentFrameIndex)}
							disabled={!annotationState.data}
						>
							Paste... <Menubar.Shortcut>{comboLabel('Mod+v')}</Menubar.Shortcut>
						</Menubar.Item>
						<Menubar.Separator />
						{@render actionItem('selection.setTrackId', 'Set Track ID...')}
						{@render actionItem('selection.interpolate', 'Interpolate Gaps')}
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
					<Menubar.Item
						inset
						onSelect={() => (exportViewportOpen = true)}
						disabled={!videoDisplayState.readView}
					>
						Export current viewport...
					</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
		{/snippet}
	</TopBar>

	{@render children()}
</div>

<PasteDialog />
<TrackIdDialog />
<ExportFramesDialog bind:open={exportFramesOpen} name={exportName} />
<ExportViewportDialog bind:open={exportViewportOpen} name={exportName} />
