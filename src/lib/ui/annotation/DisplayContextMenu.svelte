<script module lang="ts">
	import type { TrackType } from '$lib/types/annotation.type';
	import type { Measurable } from '$lib/utils/display';

	export type DisplayTarget =
		| { kind: 'cell'; cell: TrackType }
		| { kind: 'background'; frameIndex: number };

	export type DisplayMenu = { anchor: Measurable; target: DisplayTarget };
</script>

<script lang="ts">
	import { useEventListener, watch } from 'runed';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import type { ActionId } from '$lib/keybindings/actions';
	import { comboLabel } from '$lib/keybindings/keys';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { cellsLabel } from '$lib/utils/tracks';

	type Props = {
		/** Null while it's closed. */
		menu: DisplayMenu | null;
		onClose: () => void;
	};

	let { menu, onClose }: Props = $props();

	// bits-ui only notices outside clicks that bubble up to the document, and
	// the tools and toolbar stop theirs, so any pointerdown outside the menu
	// closes it here in the capture phase
	useEventListener(
		() => (menu ? document : null),
		'pointerdown',
		(e) => {
			if (!(e.target instanceof Element && e.target.closest('[role="menu"]'))) onClose();
		},
		{ capture: true }
	);

	// Keeps the content up while the menu fades out
	let shown = $state.raw<DisplayMenu | null>(null);
	watch([() => menu], ([next]) => {
		if (next) shown = next;
	});
	const target = $derived(shown?.target);
</script>

{#snippet actionItem(id: ActionId, title: string)}
	<ContextMenu.Item
		inset
		onSelect={() => keybindings.run(id)}
		disabled={!keybindings.isEnabled(id)}
	>
		{title}
		<ContextMenu.Shortcut>{keybindings.label(id)}</ContextMenu.Shortcut>
	</ContextMenu.Item>
{/snippet}

<ContextMenu.Root open={menu !== null} onOpenChange={(open) => !open && onClose()}>
	<ContextMenu.Content class="w-60" customAnchor={menu?.anchor ?? null} preventScroll={false}>
		{#if target?.kind === 'cell'}
			{@const cell = target.cell}
			<!-- A right-clicked cell is always selected, so the items act on the whole selection -->
			<ContextMenu.Label class="text-center font-bold">
				{cellsLabel(editorState.selectedCells)}
			</ContextMenu.Label>
			<ContextMenu.Separator />
			{@render actionItem('selection.track', 'Select whole track')}
			{@render actionItem('selection.trackForward', 'Select track from here on')}
			{@render actionItem('selection.trackBackward', 'Select track up to here')}
			<ContextMenu.Separator />
			{@render actionItem('selection.setTrackId', 'Set track ID...')}
			{@render actionItem('selection.interpolate', 'Interpolate gaps')}
			{@render actionItem('selection.clearAncestor', 'Clear ancestor')}
			<ContextMenu.Separator />
			<ContextMenu.Item
				inset
				onSelect={() => editorState.mergeSelection(cell)}
				disabled={!keybindings.isEnabled('selection.merge')}
			>
				Merge into cell {cell.ObjectID}
				<ContextMenu.Shortcut>{keybindings.label('selection.merge')}</ContextMenu.Shortcut>
			</ContextMenu.Item>
			{@render actionItem('tool.split', 'Split...')}
			<ContextMenu.Separator />
			{@render actionItem('cut', 'Cut')}
			{@render actionItem('copy', 'Copy')}
			{@render actionItem('selection.copyToNext', 'Copy to next frame')}
			{@render actionItem('selection.copyToPrevious', 'Copy to previous frame')}
			{@render actionItem('selection.delete', 'Delete')}
		{:else if target?.kind === 'background'}
			{@const frameIndex = target.frameIndex}
			{@render actionItem('tool.draw', 'New cell')}
			<ContextMenu.Item inset onSelect={() => void editorState.pasteText(frameIndex)}>
				Paste...
				<ContextMenu.Shortcut>{comboLabel('Mod+v')}</ContextMenu.Shortcut>
			</ContextMenu.Item>
			<ContextMenu.Item
				inset
				onSelect={() => editorState.selectAll(annotationState.getFrame(frameIndex) ?? [])}
			>
				Select all in frame
			</ContextMenu.Item>
			<ContextMenu.Separator />
			<ContextMenu.Item inset onSelect={() => editorState.clearSelection()}>
				Deselect all
			</ContextMenu.Item>
		{/if}
	</ContextMenu.Content>
</ContextMenu.Root>
