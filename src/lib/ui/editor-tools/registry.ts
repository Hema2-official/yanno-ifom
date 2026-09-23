import type { Component } from 'svelte';
import DrawTool from './DrawTool.svelte';
import PointTool from './PointTool.svelte';
import SmoothTool from './SmoothTool.svelte';
import WholeTool from './WholeTool.svelte';
import type { EditorToolProps } from './types';

export type ToolId = 'cursor' | 'point' | 'whole' | 'smooth' | 'draw';

export type ToolDefinition = {
	/** Translation key of the tooltip. */
	label: string;
	shortcut: string;
	/** Mounted in every frame tile while the tool is active; the cursor tool has none. */
	component: Component<EditorToolProps> | null;
};

export const toolRegistry: Record<ToolId, ToolDefinition> = {
	cursor: { label: 'cursor_tool', shortcut: 'Escape', component: null },
	point: { label: 'point_tool', shortcut: 'P', component: PointTool },
	whole: { label: 'whole_tool', shortcut: 'W', component: WholeTool },
	smooth: { label: 'smooth_tool', shortcut: 'S', component: SmoothTool },
	draw: { label: 'draw_tool', shortcut: 'N', component: DrawTool }
};
