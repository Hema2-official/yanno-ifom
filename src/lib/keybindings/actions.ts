import { annotationState } from '$lib/states/AnnotationState.svelte';
import { editorState } from '$lib/states/EditorState.svelte';
import { projectState } from '$lib/states/ProjectState.svelte';
import { settingsState } from '$lib/states/settings.svelte';
import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
import type { ToolId } from '$lib/ui/editor-tools/registry';
import { clamp } from '$lib/utils/math';
import type { KeyCombo } from './keys';

/** Where an action applies: `global` always, `editor` while the editor is open. */
export type ActionScope = 'global' | 'editor';

/** A press action runs on keydown; a hold action is on while its keys are down. */
export type ActionDefinition = {
	label: string;
	description?: string;
	/** The heading it's listed under in the settings. */
	group: string;
	scope: ActionScope;
	defaults: KeyCombo[];
} & ({ kind: 'press'; run: () => void; enabled?: () => boolean } | { kind: 'hold' });

const selectTool = (tool: ToolId) => ({
	kind: 'press' as const,
	run: () => (editorState.tool = tool),
	enabled: () => !projectState.readOnly
});

const selectTracks = (direction: -1 | 0 | 1) => ({
	kind: 'press' as const,
	run: () => editorState.selectTracks(direction),
	enabled: () => editorState.selectedCells.some((cell) => cell.TrackID !== null)
});

/** Moves the frame window by `delta`, staying within the video. */
const stepFrame = (delta: number) => {
	const target = annotationState.currentFrameIndex + delta;
	annotationState.currentFrameIndex = clamp(target, 0, videoDisplayState.maxFrameIndex);
};

// In precedence order: of the press actions sharing a chord, the first
// enabled one runs; hold actions all apply
const table = {
	'settings.open': {
		label: 'Open the settings',
		group: 'General',
		scope: 'global',
		kind: 'press',
		defaults: ['Mod+,'],
		run: () => (settingsState.open = true)
	},
	undo: {
		label: 'Undo',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['Mod+z'],
		enabled: () => annotationState.canUndo,
		run: () => annotationState.undo()
	},
	redo: {
		label: 'Redo',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['Mod+Shift+z', 'Mod+y'],
		enabled: () => annotationState.canRedo,
		run: () => annotationState.redo()
	},
	'selection.delete': {
		label: 'Delete the selected cells',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['Delete', 'Backspace'],
		enabled: () => !projectState.readOnly && editorState.selectedCells.length > 0,
		run: () => annotationState.deleteCells(editorState.selectedCells)
	},
	copy: {
		label: 'Copy the selected cells',
		description: 'As JSON text, for pasting into any project',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['Mod+c'],
		enabled: () => editorState.selectedCells.length > 0,
		run: () => void editorState.copySelection()
	},
	cut: {
		label: 'Cut the selected cells',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['Mod+x'],
		enabled: () => !projectState.readOnly && editorState.selectedCells.length > 0,
		run: () => void editorState.cutSelection()
	},
	'selection.add': {
		label: 'Add to the selection',
		description: 'Held while clicking a cell',
		group: 'Editing',
		scope: 'editor',
		kind: 'hold',
		defaults: ['Mod']
	},
	'selection.range': {
		label: 'Select range across frames',
		description: 'Held while clicking a cell to select overlapping cells across frames',
		group: 'Editing',
		scope: 'editor',
		kind: 'hold',
		defaults: ['Shift']
	},
	'selection.track': {
		label: 'Select the tracks of the selected cells',
		group: 'Editing',
		scope: 'editor',
		defaults: [],
		...selectTracks(0)
	},
	'selection.trackForward': {
		label: 'Select the tracks from the selected cells on',
		description: 'From the first selected cell of each track',
		group: 'Editing',
		scope: 'editor',
		defaults: [],
		...selectTracks(1)
	},
	'selection.trackBackward': {
		label: 'Select the tracks up to the selected cells',
		description: 'Up to the last selected cell of each track',
		group: 'Editing',
		scope: 'editor',
		defaults: [],
		...selectTracks(-1)
	},
	'selection.setTrackId': {
		label: 'Set the track ID of the selected cells',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['t'],
		enabled: () => !projectState.readOnly && editorState.selectedCells.length > 0,
		run: () => (editorState.trackIdDialogOpen = true)
	},
	'selection.interpolate': {
		label: 'Fill the gaps between the selected cells',
		description: 'With cells blended from the nearest ones before and after',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['i'],
		enabled: () => !projectState.readOnly && editorState.selectedCells.length > 1,
		run: () => editorState.interpolateSelection()
	},
	'selection.merge': {
		label: 'Merge the selected cells',
		description: 'Of one frame, into the last one clicked',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: ['m'],
		enabled: () =>
			!projectState.readOnly &&
			editorState.selectedCells.length > 1 &&
			editorState.selectedByFrame.size === 1,
		run: () => editorState.mergeSelection()
	},
	'selection.clearAncestor': {
		label: 'Clear the ancestor of the selected cells',
		description: 'On their whole tracks',
		group: 'Editing',
		scope: 'editor',
		kind: 'press',
		defaults: [],
		enabled: () =>
			!projectState.readOnly &&
			editorState.selectedCells.some((cell) => cell.AncestorID != null),
		run: () => annotationState.setAncestor(editorState.selectedCells, null)
	},
	'tool.cursor': {
		label: 'Cursor tool',
		description: 'Also clears the selection',
		group: 'Tools',
		scope: 'editor',
		kind: 'press',
		defaults: ['Escape'],
		run: () => editorState.reset()
	},
	'tool.point': {
		label: 'Point tool',
		group: 'Tools',
		scope: 'editor',
		defaults: ['p'],
		...selectTool('point')
	},
	'tool.whole': {
		label: 'Whole tool',
		group: 'Tools',
		scope: 'editor',
		defaults: ['w'],
		...selectTool('whole')
	},
	'tool.smooth': {
		label: 'Smooth tool',
		group: 'Tools',
		scope: 'editor',
		defaults: ['s'],
		...selectTool('smooth')
	},
	'tool.brush': {
		label: 'Brush tool',
		description: 'The right button erases',
		group: 'Tools',
		scope: 'editor',
		defaults: ['b'],
		...selectTool('brush')
	},
	'tool.split': {
		label: 'Split tool',
		description: 'Cuts cells in two along a dragged line',
		group: 'Tools',
		scope: 'editor',
		defaults: ['k'],
		...selectTool('split')
	},
	'tool.draw': {
		label: 'Draw tool',
		description: 'Draws a new cell',
		group: 'Tools',
		scope: 'editor',
		defaults: ['n'],
		...selectTool('draw')
	},
	'tool.ancestry': {
		label: 'Ancestry tool',
		description: 'Drags an arrow from an ancestor onto its descendant',
		group: 'Tools',
		scope: 'editor',
		defaults: ['a'],
		...selectTool('ancestry')
	},
	'whole.scaleFromCenter': {
		label: 'Resize around the center',
		description: 'Held while resizing with the whole tool',
		group: 'Tools',
		scope: 'editor',
		kind: 'hold',
		defaults: ['Mod']
	},
	'whole.keepAspect': {
		label: 'Keep the aspect ratio',
		description: 'Held while resizing with the whole tool',
		group: 'Tools',
		scope: 'editor',
		kind: 'hold',
		defaults: ['Shift']
	},
	'frame.previous': {
		label: 'Previous frame',
		group: 'View',
		scope: 'editor',
		kind: 'press',
		defaults: ['ArrowLeft'],
		enabled: () => projectState.frameCount > 0,
		run: () => stepFrame(-1)
	},
	'frame.next': {
		label: 'Next frame',
		group: 'View',
		scope: 'editor',
		kind: 'press',
		defaults: ['ArrowRight'],
		enabled: () => projectState.frameCount > 0,
		run: () => stepFrame(1)
	},
	'reports.open': {
		label: 'Open the reports',
		description: 'Statistics, checks, tracks and lineage of the annotation',
		group: 'View',
		scope: 'editor',
		kind: 'press',
		defaults: ['r'],
		enabled: () => annotationState.data !== null,
		run: () => (editorState.reportsOpen = true)
	},
	'display.hideAnnotation': {
		label: 'Hide the annotation',
		description: 'While held',
		group: 'View',
		scope: 'editor',
		kind: 'hold',
		defaults: ['Space']
	},
	'display.hideLabels': {
		label: 'Hide the labels',
		description: 'While held',
		group: 'View',
		scope: 'editor',
		kind: 'hold',
		defaults: ['Shift']
	}
} satisfies Record<string, ActionDefinition>;

export type ActionId = keyof typeof table;

export const actions: Record<ActionId, ActionDefinition> = table;
export const actionIds = Object.keys(table) as ActionId[];
