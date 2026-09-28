<script module lang="ts">
	import type { TrackType } from '$lib/types/annotation.type';

	export type DisplayTarget =
		| { kind: 'cell'; cell: TrackType }
		| { kind: 'background'; frameIndex: number };
</script>

<script lang="ts">
	import { useEventListener, watch } from 'runed';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { comboLabel } from '$lib/keybindings/keys';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import type { Measurable } from '$lib/utils/display';
	import { cellsLabel } from '$lib/utils/tracks';

	type Props = {
		open: boolean;
		anchor: Measurable | null;
		target: DisplayTarget | null;
		onClose: () => void;
	};

	let { open, anchor, target, onClose }: Props = $props();

	// bits-ui only notices outside clicks that bubble up to the document, and
	// the tools and toolbar stop theirs, so any pointerdown outside the menu
	// closes it here in the capture phase
	useEventListener(
		() => (open ? document : null),
		'pointerdown',
		(e) => {
			if (!(e.target instanceof Element && e.target.closest('[role="menu"]'))) onClose();
		},
		{ capture: true }
	);

	/**	When target is nulled, this keeps the content open so it doesn't just disappear. */
	let lastTarget: DisplayTarget | null = $state(null);
	watch([() => target], ([_target]) => {
		if (_target) lastTarget = _target;
	});
</script>

<ContextMenu.Root {open} onOpenChange={(next) => !next && onClose()}>
	<ContextMenu.Content class="w-52" customAnchor={anchor} preventScroll={false}>
		{#if lastTarget?.kind === 'cell'}
			<!-- A right-clicked cell is always selected, so the items act on the whole selection -->
			<ContextMenu.Label class="text-center font-bold">
				{cellsLabel(editorState.selectedCells)}
			</ContextMenu.Label>
			<ContextMenu.Separator />
			<ContextMenu.Item inset onSelect={() => void editorState.cutSelection()}>
				Cut
				<ContextMenu.Shortcut>{keybindings.label('cut')}</ContextMenu.Shortcut>
			</ContextMenu.Item>
			<ContextMenu.Item inset onSelect={() => void editorState.copySelection()}>
				Copy
				<ContextMenu.Shortcut>{keybindings.label('copy')}</ContextMenu.Shortcut>
			</ContextMenu.Item>
			<ContextMenu.Item
				inset
				onSelect={() => annotationState.deleteCells(editorState.selectedCells)}
			>
				Delete
				<ContextMenu.Shortcut>{keybindings.label('selection.delete')}</ContextMenu.Shortcut>
			</ContextMenu.Item>
		{:else if lastTarget?.kind === 'background'}
			{@const frameIndex = lastTarget.frameIndex}
			<ContextMenu.Item inset onSelect={() => (editorState.tool = 'draw')}>
				New cell
				<ContextMenu.Shortcut>{keybindings.label('tool.draw')}</ContextMenu.Shortcut>
			</ContextMenu.Item>
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
