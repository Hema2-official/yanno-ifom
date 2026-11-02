import type { Component } from 'svelte';
import AncestryTool from './AncestryTool.svelte';
import DrawTool from './DrawTool.svelte';
import BrushTool from './BrushTool.svelte';
import PointTool from './PointTool.svelte';
import SmoothTool from './SmoothTool.svelte';
import SplitTool from './SplitTool.svelte';
import WholeTool from './WholeTool.svelte';
import type { EditorToolProps } from './types';

export type ToolId =
	| 'cursor'
	| 'point'
	| 'whole'
	| 'smooth'
	| 'brush'
	| 'split'
	| 'draw'
	| 'ancestry';

// The tools' shortcuts are the `tool.<id>` actions in `keybindings/actions.ts`
export type ToolDefinition = {
	name: string;
	description: string;
	/** Mounted in every frame tile while the tool is active; the cursor tool has none. */
	component: Component<EditorToolProps> | null;
	/** Takes the right button, so the display neither turns nor opens its menu. */
	rightButton?: boolean;
};

export const toolRegistry: Record<ToolId, ToolDefinition> = {
	cursor: {
		name: 'Cursor tool',
		description: 'Pan the view and select cells.',
		component: null
	},
	point: {
		name: 'Point tool',
		description: 'Enables editing the cell accurately by dragging each point.',
		component: PointTool
	},
	whole: {
		name: 'Whole tool',
		description: 'Enables editing the entire cell by moving, resizing and rotating it.',
		component: WholeTool
	},
	smooth: {
		name: 'Smooth tool',
		description: "Enables the quick editing of the cell's border by dragging a portion of it.",
		component: SmoothTool
	},
	brush: {
		name: 'Brush tool',
		description:
			"Paints the selected cell's mask, or a new cell's while none is selected. The right button erases.",
		component: BrushTool,
		rightButton: true
	},
	split: {
		name: 'Split tool',
		description: 'Cuts cells in two along a line dragged across them.',
		component: SplitTool
	},
	draw: {
		name: 'Draw tool',
		description: 'Draws a new cell by tracing its outline.',
		component: DrawTool
	},
	ancestry: {
		name: 'Ancestry tool',
		description: 'Drag an arrow from a tracked ancestor onto its descendant.',
		component: AncestryTool
	}
};

export const toolRegistryEntries = Object.entries(toolRegistry) as [ToolId, ToolDefinition][];
