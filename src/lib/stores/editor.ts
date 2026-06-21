import { writable, type Writable } from 'svelte/store';
import type { Component } from 'svelte';
import PointTool from '$lib/ui/editor-tools/PointTool.svelte';
import type { EditorToolProps } from '$lib/ui/editor-tools/types';

export const isEditing = writable(false);
export const editorTool: Writable<Component<EditorToolProps>> = writable(PointTool);
export const lastPointerViewBoxCoords = writable({ x: 0, y: 0 });
export const smoothRadius = writable(10);

export const hoverElementsShown = writable(false);
