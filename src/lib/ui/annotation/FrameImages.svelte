<svelte:options namespace="svg" />

<script lang="ts">
	import { frameCache } from '$lib/states/FrameCache.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';

	let { frameIndex }: { frameIndex: number } = $props();

	const vb = $derived(svgState.svgViewBox);

	const filterOf = (channelIndex: number) =>
		videoDisplayState.channelFilters[channelIndex].map(({ id }) => `url(#${id})`).join(' ');
</script>

<!-- The frame's visible channels in viewBox units, each through its filters (defined by DisplayDefs) -->
{#each videoDisplayState.channels as channel, channelIndex (channelIndex)}
	{@const image = channel.visible ? projectState.imageIndex(frameIndex, channelIndex) : null}
	{@const href = image === null ? null : frameCache.url(image)}
	{#if href}
		<image
			{href}
			width={vb.width}
			height={vb.height}
			opacity={channel.opacity}
			filter={filterOf(channelIndex)}
		/>
	{/if}
{/each}
