import type { Component } from 'svelte';
import DrawTool from './DrawTool.svelte';
import PointTool from './PointTool.svelte';
import SmoothTool from './SmoothTool.svelte';
import WholeTool from './WholeTool.svelte';
import type { EditorToolProps } from './types';

export type ToolId = 'cursor' | 'point' | 'whole' | 'smooth' | 'draw';

// The tools' shortcuts are the `tool.<id>` actions in `keybindings/actions.ts`
export type ToolDefinition = {
	/** Translation key of the tooltip. */
	label: string;
	/** Mounted in every frame tile while the tool is active; the cursor tool has none. */
	component: Component<EditorToolProps> | null;
};

export const toolRegistry: Record<ToolId, ToolDefinition> = {
	cursor: { label: 'cursor_tool', component: null },
	point: { label: 'point_tool', component: PointTool },
	whole: { label: 'whole_tool', component: WholeTool },
	smooth: { label: 'smooth_tool', component: SmoothTool },
	draw: { label: 'draw_tool', component: DrawTool }
};
