<script lang="ts">
	import {
		displayMouseLeaveHandler,
		displayMouseMoveHandler,
		displayMouseUpHandler
	} from '$lib/stores/input';
	import { svgScalePercent } from '$lib/stores/svg';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { P } from '$lib/utils/pattern';
	import type { EditorToolProps } from './types';

	let { bodies, pushLocalState }: EditorToolProps = $props();

	let interactiveRoot: SVGElement | undefined;
	let svgElement = $derived(interactiveRoot?.ownerSVGElement);

	let currentBodyIndex = $state(-1);
	let currentHandleIndex = $state(-1);
	let isMouseDown = $state(false);

	$effect(() => {
		if (isMouseDown) {
			$displayMouseMoveHandler = handleMouseMove;
			$displayMouseUpHandler = handleMouseUp;
			$displayMouseLeaveHandler = handleMouseUp;
		} else {
			$displayMouseMoveHandler = null;
			$displayMouseUpHandler = null;
			$displayMouseLeaveHandler = null;
		}
	});

	const handleMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const target = e.target as HTMLElement;
		if (!target.id.startsWith('hdl')) return;
		[currentBodyIndex, currentHandleIndex] = P('hdl#_#').match(target.id);

		isMouseDown = true;
	};

	const handleMouseUp = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		// reset
		currentBodyIndex = -1;
		currentHandleIndex = -1;
		isMouseDown = false;
		pushLocalState();
	};

	const handleMouseMove = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;
		if (!isMouseDown) return;

		const mouseViewBox = getPointerViewBoxCoords(e, svgElement);

		// set handle pos
		$bodies[currentBodyIndex][currentHandleIndex].x = mouseViewBox.x;
		$bodies[currentBodyIndex][currentHandleIndex].y = mouseViewBox.y;
	};
</script>

<!-- Non-interactive elements -->
{#each $bodies as body, i}
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
	{#each $bodies as body, bodyIndex}
		<g>
			{#each body as point, i}
				{@const halfSize = 200 / $svgScalePercent}
				<rect
					id="hdl{bodyIndex}_{i}"
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
