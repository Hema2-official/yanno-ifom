<script lang="ts">
	import { _ } from 'svelte-i18n';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { toolRegistry, type ToolDefinition, type ToolId } from '$lib/ui/editor-tools/registry';
	import KeyComboKbd from '$lib/ui/settings/KeyComboKbd.svelte';

	const tools = Object.entries(toolRegistry) as [ToolId, ToolDefinition][];
</script>

<!-- Clicks here must not reach the display's select and pan handling -->
<div class="editor-toolbar" role="presentation" onpointerdown={(e) => e.stopPropagation()}>
	<!-- TODO: have icons for the tools and a setting to show icon/keybinding -->
	{#each tools as [id, tool] (id)}
		{@const label = keybindings.label(`tool.${id}`)}
		{@const [name, description] = $_(tool.label).split('\n')}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class:selected={editorState.tool === id}
						class:long={label.length > 3}
						onclick={() => (editorState.tool = id)}>{label}</button
					>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="right" class="flex-col items-start gap-0.5">
				<span class="flex items-center gap-2 font-medium">
					{name}
					{#each keybindings.bindings[`tool.${id}`] as combo (combo)}
						<KeyComboKbd {combo} />
					{/each}
				</span>
				{#if description}
					<span class="opacity-80">{description}</span>
				{/if}
			</Tooltip.Content>
		</Tooltip.Root>
	{/each}
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
