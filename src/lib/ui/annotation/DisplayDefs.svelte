<svelte:options namespace="svg" />

<script lang="ts">
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';

	// The filters the frame images refer to by id; channels share the colormap's
	const filters = $derived(
		new Map(videoDisplayState.channelFilters.flat().map((step) => [step.id, step.functions]))
	);
</script>

{#each filters as [id, functions] (id)}
	<filter {id} color-interpolation-filters="sRGB">
		<feComponentTransfer>
			<feFuncR {...functions.r} />
			<feFuncG {...functions.g} />
			<feFuncB {...functions.b} />
		</feComponentTransfer>
	</filter>
{/each}
