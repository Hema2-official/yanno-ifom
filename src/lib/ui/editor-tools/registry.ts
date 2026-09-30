import type { Component } from 'svelte';
import DrawTool from './DrawTool.svelte';
import BrushTool from './BrushTool.svelte';
import PointTool from './PointTool.svelte';
import SmoothTool from './SmoothTool.svelte';
import WholeTool from './WholeTool.svelte';
import type { EditorToolProps } from './types';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

export type ToolId = 'cursor' | 'point' | 'whole' | 'smooth' | 'brush' | 'draw';

// The tools' shortcuts are the `tool.<id>` actions in `keybindings/actions.ts`
export type ToolDefinition = {
	/** Translation key of the tooltip. */
	label: string;
	/** Mounted in every frame tile while the tool is active; the cursor tool has none. */
	component: Component<EditorToolProps> | null;
	/** Takes the right button, so the display neither turns nor opens its menu. */
	rightButton?: boolean;
};

export const toolRegistry: Record<ToolId, ToolDefinition> = {
	cursor: { label: 'cursor_tool', component: null },
	point: { label: 'point_tool', component: PointTool },
	whole: { label: 'whole_tool', component: WholeTool },
	smooth: { label: 'smooth_tool', component: SmoothTool },
	brush: { label: 'brush_tool', component: BrushTool, rightButton: true },
	draw: { label: 'draw_tool', component: DrawTool }
};

export const toolRegistryEntries = Object.entries(toolRegistry) as [ToolId, ToolDefinition][];

export function getToolLabels(toolId: ToolId): [string, string] {
	return get(_)(toolRegistry[toolId].label).split('\n', 2) as [string, string];
}
