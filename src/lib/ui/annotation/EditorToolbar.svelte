<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { toolRegistry, type ToolDefinition, type ToolId } from '$lib/ui/editor-tools/registry';

	const tools = Object.entries(toolRegistry) as [ToolId, ToolDefinition][];
</script>

<!-- Clicks here must not reach the display's select and pan handling -->
<div class="editor-toolbar" role="presentation" onpointerdown={(e) => e.stopPropagation()}>
	<!-- TODO: have icons for the tools and a setting to show icon/keybinding -->
	{#each tools as [id, tool] (id)}
		{@const label = keybindings.label(`tool.${id}`)}
		<button
			title={$_(tool.label)}
			class:selected={editorState.tool === id}
			class:long={label.length > 3}
			onclick={() => (editorState.tool = id)}>{label}</button
		>
	{/each}
	<!-- TODO: move out auto-resample button -->
	<button
		title={$_('auto_resample')}
		class:selected={optionsState.autoResample}
		onclick={() => (optionsState.autoResample = !optionsState.autoResample)}>R</button
	>
</div>

<style lang="scss">
	.editor-toolbar {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 8px;

		> button {
			width: 54px;
			height: 54px;
			font-size: 16px;
			font-weight: 600;
			font-family: inherit;
			color: var(--color);
			border: 3px solid transparent;
			border-radius: 9px;
			background-color: var(--background-color-translucent);
			transition:
				border-color 0.1s,
				background-color 0.1s;
			cursor: default;

			&:hover,
			&:focus-visible {
				outline: none;
				border-color: var(--accent-color);
			}

			&.selected {
				border-color: var(--accent-color);
				background-color: var(--accent-color);
			}

			&.long {
				font-size: 11px;
			}
		}
	}
</style>
