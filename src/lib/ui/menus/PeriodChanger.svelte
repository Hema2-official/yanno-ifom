<script lang="ts">
	import type { Project } from '$lib/types/api.type';
	import { getWebFrameUrl } from '$lib/api/projects';
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
	import { cn } from '$lib/utils/shadcn';
	import { isPrimaryFrame } from '$lib/utils/frames';

	let { project = $bindable() }: { project: Project } = $props();

	let previewFrames = $state(10);
	let loadedFrames: Record<string, boolean> = $state({});

	let selectedStartIndex: number | null = $state(null);
	let isSelecting = $derived(selectedStartIndex !== null);

	function handleClick(index: number) {
		if (selectedStartIndex === null) {
			selectedStartIndex = index;
		} else {
			project.start_period = selectedStartIndex;
			project.channel_period = index + 1;
			selectedStartIndex = null;
		}
	}
</script>

<div class="flex flex-col gap-1 w-full min-w-0">
	<ScrollArea
		orientation="horizontal"
		class="pb-2.5 w-full min-w-0"
		scrollbarXClasses="h-2.5 data-[orientation=horizontal]:h-2.5 data-[size=small]:h-1.5"
	>
		<div
			class="flex border-2 border-light-gray-accent border-r-0 rounded-tl-xl rounded-bl-xl p-px transition-all duration-200"
			class:border-dashed={isSelecting}
		>
			{#each Array(previewFrames).keys() as index (index)}
				{@const frameUrl = getWebFrameUrl(project, index)}
				<button
					class={cn(
						'flex items-center justify-center h-20 aspect-square overflow-hidden bg-transparent outline-none p-0 m-0 cursor-pointer first:rounded-tl-lg first:rounded-bl-lg',
						isPrimaryFrame(project, index) ? 'border border-accent' : ''
					)}
					class:mr-2={index % project.channel_period === project.channel_period - 1}
					onclick={() => handleClick(index)}
				>
					{#if !loadedFrames[frameUrl]}
						<Spinner size={20} thickness={4} />
					{/if}
					<img
						src={frameUrl}
						alt="Preview"
						class="h-full aspect-square object-cover pointer-events-none"
						onload={() => (loadedFrames[frameUrl] = true)}
						style:display={loadedFrames[frameUrl] ? 'block' : 'none'}
					/>
				</button>
			{/each}
		</div>
	</ScrollArea>
	<span class="text-sm text-gray-accent italic text-left">
		{#if !isSelecting}
			Click to change the first primary frame...
		{:else}
			Click to select the end of the period...
		{/if}
	</span>
</div>
