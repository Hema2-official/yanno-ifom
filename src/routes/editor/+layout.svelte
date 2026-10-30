<script lang="ts">
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
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { CloudAlertIcon } from '@lucide/svelte';
	import { download, tracksToText } from '$lib/utils/export';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import PasteDialog from '$lib/ui/annotation/PasteDialog.svelte';
	import TrackIdDialog from '$lib/ui/annotation/TrackIdDialog.svelte';
	import ExportFramesDialog from '$lib/ui/export/ExportFramesDialog.svelte';
	import ExportViewportDialog from '$lib/ui/export/ExportViewportDialog.svelte';
	import ReportsDialog from '$lib/ui/reports/ReportsDialog.svelte';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';

	let { children }: { children: Snippet } = $props();

	const isMobile = new IsMobile();

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
		if (!annotationState.data || isMobile.current) return;
		if (isTypingTarget(e) || isDialogOpen()) return;
		const text = e.clipboardData?.getData('text/plain') ?? '';
		const frameIndex = inputState.pointer?.frameIndex ?? annotationState.currentFrameIndex;
		editorState.pasteText(frameIndex, text);
	};

	/** The exported files' name, without the extension. */
	const exportName = $derived(projectState.name ?? 'project');

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
</script>

{#if !isMobile.current}
	<KeybindingScope scope="editor" />
{/if}
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
			<Breadcrumb.Item>
				<Breadcrumb.Page>{projectState.name}</Breadcrumb.Page>
			</Breadcrumb.Item>

			{#if projectState.saveError}
				<Breadcrumb.Item class="ml-2 [&_svg]:mt-0.5 [&_svg]:size-4.5">
					<Tooltip.Root>
						<!-- TODO: make the clickability more obvious either by saying click to retry or adding an actual Button next to the status -->
						<Tooltip.Trigger
							class="text-destructive inline-flex items-center gap-1"
							onclick={() => annotationState.save()}
						>
							<CloudAlertIcon /> Not saved
						</Tooltip.Trigger>
						<Tooltip.Content class="flex-col items-start">
							<span>{projectState.saveError}</span>
							<span class="opacity-70">Click to retry saving</span>
						</Tooltip.Content>
					</Tooltip.Root>
				</Breadcrumb.Item>
			{/if}
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
			<Menubar.Menu>
				<Menubar.Trigger>Edit</Menubar.Trigger>
				<Menubar.Content>
					{@render actionItem('undo', 'Undo')}
					{@render actionItem('redo', 'Redo')}
					<Menubar.Separator />
					{@render actionItem('tool.draw', 'New Cell')}
					{@render actionItem('tool.split', 'Split Cells')}
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
					{@render actionItem('selection.copyToNext', 'Copy to Next Frame')}
					{@render actionItem('selection.copyToPrevious', 'Copy to Previous Frame')}
					<Menubar.Separator />
					{@render actionItem('selection.track', 'Select Whole Tracks')}
					{@render actionItem('selection.trackForward', 'Select Tracks Forward')}
					{@render actionItem('selection.trackBackward', 'Select Tracks Backward')}
					<Menubar.Separator />
					{@render actionItem('selection.setTrackId', 'Set Track ID...')}
					{@render actionItem('selection.interpolate', 'Interpolate Gaps')}
					{@render actionItem('selection.merge', 'Merge Cells')}
					{@render actionItem('selection.clearAncestor', 'Clear Ancestor')}
				</Menubar.Content>
			</Menubar.Menu>
			<Menubar.Menu>
				<Menubar.Trigger>View</Menubar.Trigger>
				<Menubar.Content>
					{@render actionItem('view.zoomIn', 'Zoom In')}
					{@render actionItem('view.zoomOut', 'Zoom Out')}
					{@render actionItem('view.zoomReset', 'Reset Zoom')}
					<Menubar.Separator />
					<Menubar.Item
						onSelect={() => (exportViewportOpen = true)}
						disabled={!videoDisplayState.readView}
					>
						Export current viewport...
					</Menubar.Item>
					<Menubar.Separator />
					{@render actionItem('reports.open', 'Reports...')}
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
<ReportsDialog name={exportName} />

{#if isMobile.current}
	<div
		class="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 p-6 text-center"
	>
		<h1 class="text-lg font-semibold">Narrow displays aren't supported</h1>
		<p class="text-muted-foreground text-sm">
			The content needs a wider window to show properly.
		</p>
		<a href={resolve('/projects')} class="text-sm underline underline-offset-4">
			Back to the projects
		</a>
	</div>
{/if}
