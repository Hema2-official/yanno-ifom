<script lang="ts">
	export let size: number | string = 24;
	export let color = 'white';

	// if size is a number, append 'px' to it
	$: _size = typeof size === 'number' ? `${size}px` : size;
</script>

<svg
	style="width: {_size}; height: {_size}"
	stroke={color}
	viewBox="0 0 24 24"
	xmlns="http://www.w3.org/2000/svg"
>
	<path d="M4 12H20M12 4V20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
