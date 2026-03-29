<script lang="ts">
	import { contextMenuOpacity } from '$lib/stores/options';
	import {
		currentChangeIndex,
		currentFrameId,
		annotation,
		displayFrames,
		pushChange
	} from '$lib/stores/data';
	import { isEditing } from '$lib/stores/editor';
	import { Mouse, isDown } from '$lib/utils/mouse';
	import { deepCopy } from '$lib/utils/data';

	let shown = $state(false);
	let smooth = $state(true);
	let position = $state({ x: 0, y: 0 });
	let { cellId = $bindable('') }: { cellId?: string } = $props();

	let contextMenuElement: HTMLElement;
	let contextMenuWrapperElement: HTMLElement;

	export function show(pos: { x: number; y: number }) {
		const displayBounds = contextMenuWrapperElement.parentElement?.getBoundingClientRect();
		if (!displayBounds) throw new Error('Display bounds not found.');
		position.x = Math.min(displayBounds.width - contextMenuElement?.offsetWidth, pos.x);
		position.y = Math.min(displayBounds.height - contextMenuElement?.offsetHeight, pos.y);
		if (shown) {
			smooth = false;
			shown = false;
			setTimeout(() => {
				smooth = true;
				shown = true;
			}, 5);
		} else {
			shown = true;
		}
		contextMenuElement?.childNodes.forEach((element) => {
			(element as HTMLButtonElement).disabled = false;
		});
	}

	export function hide(smoothly = true) {
		if (!shown) return;
		if (!smoothly) {
			smooth = false;
			shown = false;
			setTimeout(() => {
				smooth = true;
			}, 5);
		} else {
			shown = false;
		}
		contextMenuElement?.childNodes.forEach((element) => {
			(element as HTMLButtonElement).disabled = true;
		});
	}

	const getMinimumHeight = () => {
		const children = contextMenuElement?.children;
		if (!children || children.length === 0) return 0;

		const firstChild = children[0];
		const lastChild = children[children.length - 1];
		const computedStyle = getComputedStyle(contextMenuElement);

		return (
			lastChild.getBoundingClientRect().bottom -
			firstChild.getBoundingClientRect().top +
			parseFloat(getComputedStyle(lastChild).marginBottom) +
			parseFloat(getComputedStyle(firstChild).marginTop) +
			parseFloat(computedStyle.borderTopWidth) +
			parseFloat(computedStyle.borderBottomWidth)
		);
	};

	let styles = $derived({
		'cm-display': ['flex', ''],
		'cm-top': [position.y, 'px'],
		'cm-left': [position.x, 'px'],
		'cm-opacity': [$contextMenuOpacity, '%'],
		'cm-transition-duration': [smooth ? 0.2 : 0, 's'],
		'cm-wrapper-height': [shown ? getMinimumHeight() : 0, 'px']
	});

	let cssVarStyles = $derived(
		Object.entries(styles)
			.map(([key, value]) => `--${key}:${value[0]}${value[1]}`)
			.join(';')
	);

	document.addEventListener('mousedown', (e: MouseEvent) => {
		if (!shown) return;
		if (!e.target) return;
		let target: HTMLElement | null = e.target as HTMLElement;

		while (target && target != document.body && target != contextMenuWrapperElement) {
			if (target === contextMenuElement) return;
			target = target.parentElement;
		}

		hide(!isDown(Mouse.Secondary, e.buttons));
	});
</script>

<div class="context-menu-wrapper" style={cssVarStyles} bind:this={contextMenuWrapperElement}>
	<div class="context-menu" bind:this={contextMenuElement}>
		<p>Cell #{cellId}</p>
		<button
			onclick={() => {
				isEditing.set(true);
				hide(false);
			}}>Edit</button
		>
		<button
			disabled={$currentChangeIndex !== $annotation.changes.length - 1}
			onclick={() => {
				hide(false);
				pushChange({
					time: Date.now(),
					message: `Delete cell ${cellId}`,
					frames: [
						{
							id: $currentFrameId,
							cells: [{ id: cellId, bodies: [] }]
						}
					]
				});
			}}>Delete</button
		>
		<button
			onclick={() => {
				hide(false);
				// check if we're on the last change
				if ($currentChangeIndex !== $annotation.changes.length - 1) {
					alert('You must be on the last change to do this.');
					return;
				}
				// prompt for new ID and check validity
				const newId = parseInt(
					prompt(`Change ID from ${cellId} to:`, cellId.toString()) ?? ''
				);
				if (isNaN(newId)) return; // cancelled
				if (newId !== 0 && !newId) {
					alert('Invalid input.');
					return;
				} // NaN, parseInt failed
				if (newId === cellId) return; // no change needed
				if (
					$displayFrames
						.find((f) => f.id == $currentFrameId)
						?.cells.findIndex((c) => c.id == newId) !== -1
				) {
					alert('This ID is already taken on this frame.');
					return;
				} // ID already exists
				// add change
				annotation.update((d) => {
					const renamedCell = deepCopy(
						$displayFrames
							.find((f) => f.id == $currentFrameId)
							?.cells.find((c) => c.id == cellId)
					);
					if (!renamedCell) throw new Error('Cell not found.');
					renamedCell.id = newId;
					d.changes.push({
						time: Date.now(),
						frames: [
							{
								id: $currentFrameId,
								cells: [{ id: cellId, bodies: [] }, renamedCell]
							}
						]
					});
					return d;
				});
			}}>Rename</button
		>
	</div>
</div>

<style lang="scss">
	.context-menu-wrapper {
		position: absolute;
		top: var(--cm-top);
		left: var(--cm-left);
		width: auto;
		max-height: var(--cm-wrapper-height);
		display: flex;
		overflow: hidden;
		z-index: 100;
		pointer-events: none;
		transition: max-height var(--cm-transition-duration) ease-out;
	}

	.context-menu {
		width: 7em;
		min-height: fit-content;
		height: fit-content;
		background-color: var(--background-color);
		border: 3px dashed var(--gray-accent);
		display: var(--cm-display);
		opacity: var(--cm-opacity);
		flex-direction: column;
		align-items: start;
		pointer-events: all;
		-moz-user-select: none;
		user-select: none;

		p {
			font-size: 20px;
			font-weight: bold;
			align-self: center;
			margin: 6px 0.6em;
		}

		button {
			width: 100%;
			padding: 6px 20px;
			font-size: 16px;
			font-weight: 500;
			font-family: inherit;
			background-color: unset;
			transition: background-color 0.1s;
			border: none;
			border-top: 2px solid var(--gray-accent);
			cursor: default;

			&:hover,
			&:focus-visible {
			outline: none;
			background-color: var(--accent-color);
		}
		}
	}
</style>
