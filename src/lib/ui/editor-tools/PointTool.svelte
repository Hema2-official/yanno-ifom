<script lang="ts">
	import { svgState } from '$lib/states/svg.svelte';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { P } from '$lib/utils/pattern';
	import { overrideDisplayPointerWhile } from './interaction.svelte';
	import type { EditorToolProps } from './types';

	let { bodies = $bindable(), pushLocalState }: EditorToolProps = $props();

	let interactiveRoot: SVGGElement | undefined = $state();
	let svgElement = $derived(interactiveRoot?.ownerSVGElement);

	const handleIdPattern = P('hdl#_#');
	let currentBodyIndex = -1;
	let currentHandleIndex = -1;
	let isMouseDown = $state(false);

	overrideDisplayPointerWhile(
		() => isMouseDown,
		(e) => handleMouseMove(e),
		(e) => handleMouseUp(e)
	);

	function handleMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		const target = e.target as SVGElement;
		if (!target.id.startsWith('hdl')) return;
		[currentBodyIndex, currentHandleIndex] = handleIdPattern.match(target.id);

		isMouseDown = true;
	}

	function handleMouseUp(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!isMouseDown) return;
		isMouseDown = false;
		pushLocalState();
	}

	function handleMouseMove(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement || !isMouseDown) return;

		const mouseViewBox = getPointerViewBoxCoords(e, svgElement);
		bodies[currentBodyIndex][currentHandleIndex].x = mouseViewBox.x;
		bodies[currentBodyIndex][currentHandleIndex].y = mouseViewBox.y;
	}
</script>

<!-- Non-interactive elements -->
{#each bodies as body, i (i)}
	<path
		id="body{i}"
		d={cellBodyToPath(body)}
		fill="none"
		stroke="black"
		stroke-width="2px"
		opacity="1"
	/>
{/each}

<!-- Interactive elements -->
<g
	role="presentation"
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	onmousemove={handleMouseMove}
	bind:this={interactiveRoot}
>
	{#each bodies as body, bodyIndex (bodyIndex)}
		{@const halfSize = 200 / svgState.svgScalePercent}
		<g>
			{#each body as point, pointIndex (pointIndex)}
				<rect
					id="hdl{bodyIndex}_{pointIndex}"
					x={point.x - halfSize}
					y={point.y - halfSize}
					width={halfSize * 2}
					height={halfSize * 2}
					fill="pink"
					stroke="black"
					stroke-width={halfSize / 3}
					cursor="crosshair"
				/>
			{/each}
		</g>
	{/each}
</g>
