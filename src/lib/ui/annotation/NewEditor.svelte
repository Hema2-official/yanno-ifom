<script lang="ts">
	import { editorState, type EditingSession } from '$lib/states/EditorState.svelte';
	import { EditorMode } from '$lib/types/editor.type';
	import PointTool from '../editor-tools/PointTool.svelte';
	import SmoothTool from '../editor-tools/SmoothTool.svelte';
	import WholeTool from '../editor-tools/WholeTool.svelte';

	let { session }: { session: EditingSession } = $props();

	const toolComponents = {
		[EditorMode.Point]: PointTool,
		[EditorMode.Whole]: WholeTool,
		[EditorMode.Smooth]: SmoothTool
	};
	const Tool = $derived(toolComponents[editorState.mode]);
</script>

<Tool bind:bodies={session.bodies} pushLocalState={() => session.pushState()} />
