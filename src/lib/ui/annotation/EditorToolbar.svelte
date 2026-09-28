<script lang="ts">
	import { _ } from 'svelte-i18n';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { cn } from '$lib/utils/shadcn';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { toolRegistry, type ToolDefinition, type ToolId } from '$lib/ui/editor-tools/registry';
	import KeyComboKbd from '$lib/ui/settings/KeyComboKbd.svelte';

	const tools = Object.entries(toolRegistry) as [ToolId, ToolDefinition][];

	const selectTool = (id: string) => {
		// Disallow deselecting tools
		if (id) editorState.tool = id as ToolId;
	};
</script>

<!-- Clicks here must not reach the display's select and pan handling -->
<ToggleGroup.Root
	type="single"
	orientation="vertical"
	spacing={2}
	rovingFocus={false}
	bind:value={() => editorState.tool, selectTool}
	class="absolute top-4 left-4"
	onpointerdown={(e) => e.stopPropagation()}
>
	<!-- TODO: have icons for the tools and a setting to show icon/keybinding -->
	{#each tools as [id, tool] (id)}
		{@const label = keybindings.label(`tool.${id}`)}
		{@const [name, description] = $_(tool.label).split('\n', 2)}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<ToggleGroup.Item
						{...props}
						value={id}
						aria-label={name}
						class={cn(
							'bg-background/85 data-[state=on]:bg-accent data-[state=on]:hover:bg-accent size-13 text-base font-semibold',
							label.length > 3 && 'text-xs'
						)}
					>
						{label}
					</ToggleGroup.Item>
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
</ToggleGroup.Root>
