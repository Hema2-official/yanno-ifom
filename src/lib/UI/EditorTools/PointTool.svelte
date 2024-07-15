<script lang="ts">
	import {
		displayMouseLeaveHandler,
		displayMouseMoveHandler,
		displayMouseUpHandler
	} from '$lib/stores/input';
	import { svgScalePercent } from '$lib/stores/svg';
	import type { CellBodyType } from '$lib/types/annotation.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { P } from '$lib/utils/pattern';
	import type { Writable } from 'svelte/store';

	export let bodies: Writable<CellBodyType[]>;
	export let pushLocalState: () => void;

	let interactiveRoot: SVGElement;
	$: svgElement = interactiveRoot?.ownerSVGElement;

	let currentBodyIndex = -1;
	let currentHandleIndex = -1;
	let isMouseDown = false;

	$: if (isMouseDown) {
		$displayMouseMoveHandler = handleMouseMove;
		$displayMouseUpHandler = handleMouseUp;
		$displayMouseLeaveHandler = handleMouseUp;
	} else {
		$displayMouseMoveHandler = null;
		$displayMouseUpHandler = null;
		$displayMouseLeaveHandler = null;
	}

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
		$bodies[currentBodyIndex].x[currentHandleIndex] = mouseViewBox.x;
		$bodies[currentBodyIndex].y[currentHandleIndex] = mouseViewBox.y;
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
	on:mousedown={handleMouseDown}
	on:mouseup={handleMouseUp}
	on:mousemove={handleMouseMove}
	bind:this={interactiveRoot}
>
	{#each $bodies as body, bodyIndex}
		<g>
			{#each body.x as x, i}
				{@const halfSize = 200 / $svgScalePercent}
				<rect
					id="hdl{bodyIndex}_{i}"
					x={x - halfSize}
					y={body.y[i] - halfSize}
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
