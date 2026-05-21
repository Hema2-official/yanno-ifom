<script lang="ts">
	import type { Project } from '$lib/types/api.type';
	import { getWebFrameUrl } from '$lib/api/projects';
	import Spinner from '../Common/Spinner.svelte';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
	import { cn } from '$lib/utils/shadcn';

	let { project = $bindable() }: { project: Project } = $props();

	let previewFrames = $state(10);

	let loadedFrames: Record<string, boolean> = $state({});

	let selectedStartIndex: number | null = $state(null);
	let selectedEndIndex: number | null = $state(null);

	let selecting = $derived(selectedStartIndex !== null);

	function handleClick(index: number) {
		if (selectedStartIndex === null) {
			selectedStartIndex = index;
		} else {
			selectedEndIndex = index;
			project.start_period = selectedStartIndex;
			project.channel_period = selectedEndIndex + 1;
			selectedStartIndex = null;
			selectedEndIndex = null;
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
			class:border-dashed={selecting}
		>
			{#each Array(previewFrames).keys() as index}
				{@const frameUrl = getWebFrameUrl(project, index)}
				{@const isPrimary = (index % project.channel_period) - project.start_period === 0}
				<button
					class={cn(
						'flex items-center justify-center h-20 aspect-square overflow-hidden bg-transparent outline-none p-0 m-0 cursor-pointer first:rounded-tl-lg first:rounded-bl-lg',
						isPrimary ? 'border border-accent' : ''
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
						onload={() => (loadedFrames[frameUrl] = true)}
						class:h-full={loadedFrames[frameUrl]}
						class:aspect-square={loadedFrames[frameUrl]}
						class:object-cover={loadedFrames[frameUrl]}
						class:pointer-events-none={loadedFrames[frameUrl]}
						style:display={loadedFrames[frameUrl] ? 'block' : 'none'}
					/>
				</button>
			{/each}
		</div>
	</ScrollArea>
	<span class="text-sm text-gray-accent italic text-left">
		{#if !selecting}
			Click to change the first primary frame...
		{:else}
			Click to select the end of the period...
		{/if}
	</span>
</div>
