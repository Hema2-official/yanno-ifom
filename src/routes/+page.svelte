<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	onMount(() =>
		window.setTimeout(() => {
			goto(resolve('/projects'));
		}, 2000)
	);
</script>

<div class="mx-auto mt-[100px] flex w-4/5 justify-center">
	<!-- TODO: -->
	TODO: put something here
</div>
