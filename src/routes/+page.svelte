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

<div class="flex justify-center w-4/5 mx-auto mt-[100px]">
	<!-- TODO: -->
	TODO: put something here
</div>
