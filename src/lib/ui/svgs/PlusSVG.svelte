<script lang="ts">
	import type { SVGProps } from './types';

	let { size = 24, color = 'white' }: SVGProps = $props();

	let _size = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<svg
	style="width: {_size}; height: {_size}"
	stroke={color}
	viewBox="0 0 24 24"
	xmlns="http://www.w3.org/2000/svg"
>
	<path d="M4 12H20M12 4V20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
