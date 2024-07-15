import { writable, type Writable } from 'svelte/store';
import type { ComponentType } from 'svelte';
import PointTool from '$lib/UI/EditorTools/PointTool.svelte';

export const isEditing = writable(false);
export const editorTool: Writable<ComponentType> = writable(PointTool);
export const lastPointerViewBoxCoords = writable({ x: 0, y: 0 });
export const smoothRadius = writable(10);

export const hoverElementsShown = writable(false);
