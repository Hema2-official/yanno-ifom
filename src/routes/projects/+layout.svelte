<script lang="ts">
	import type { Snippet } from 'svelte';
	import TopBar from '$lib/ui/navigation/TopBar.svelte';
	import * as Menubar from '$lib/components/ui/menubar';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex h-screen w-full flex-col items-center justify-start">
	<TopBar>
		{#snippet extraMenus()}
			<Menubar.Menu>
				<Menubar.Trigger>File</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item onSelect={() => window.open('/', '_blank')}>
						New Tab <Menubar.Shortcut>⌘T</Menubar.Shortcut>
					</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
		{/snippet}
	</TopBar>

	{@render children()}
</div>
