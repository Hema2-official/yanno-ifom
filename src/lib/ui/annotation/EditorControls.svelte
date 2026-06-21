<script lang="ts">
	import { _ } from 'svelte-i18n';
	import NewEditor from './NewEditor.svelte';
	import { editorTool } from '$lib/stores/editor';
	import PointTool from '../editor-tools/PointTool.svelte';
	import WholeTool from '../editor-tools/WholeTool.svelte';
	import SmoothTool from '../editor-tools/SmoothTool.svelte';
	import { displayMouseUpHandler } from '$lib/stores/input';
	import { optionsState } from '$lib/states/options.svelte';

	let editorControlsWrapperElement: HTMLElement;

	let { editorComponent }: { editorComponent: NewEditor } = $props();

	const styles: Record<string, unknown> = {};
	const stylesUnits: { [key: string]: string } = {};

	let cssVarStyles = $derived(
		Object.entries(styles)
			.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
			.join(';')
	);

	// function radioSelect(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement; }) {
	//     e.currentTarget.classList.add('selected');
	//     const siblings = e.currentTarget.parentElement?.children;
	//     if (siblings)
	//         for (const sibling of siblings)
	//             if (sibling !== e.currentTarget) sibling.classList.remove('selected');
	// }
</script>

<div
	class="editor-controls-wrapper"
	style={cssVarStyles}
	role="presentation"
	onmouseup={$displayMouseUpHandler}
	bind:this={editorControlsWrapperElement}
>
	<div>
		<div>
			<button
				title={$_('point_tool')}
				class:selected={$editorTool === PointTool}
				onclick={() => ($editorTool = PointTool)}>P</button
			>
			<button
				title={$_('whole_tool')}
				class:selected={$editorTool === WholeTool}
				onclick={() => ($editorTool = WholeTool)}>W</button
			>
			<button
				title={$_('smooth_tool')}
				class:selected={$editorTool === SmoothTool}
				onclick={() => ($editorTool = SmoothTool)}>S</button
			>
		</div>
		<button
			title={$_('auto_resample')}
			class:selected={optionsState.autoResample}
			onclick={() => (optionsState.autoResample = !optionsState.autoResample)}>R</button
		>
	</div>
	<div class="right">
		<button onclick={() => editorComponent.quit(true)} title={$_('confirm_and_quit')}
			>Save</button
		>
		<button onclick={() => editorComponent.quit(false)} title={$_('quit_without_saving')}
			>Nope</button
		>
	</div>
</div>

<style lang="scss">
	$spacing-from-edge: 16px;
	$border-radius: 9px;

	.editor-controls-wrapper {
		position: absolute;
		display: block;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 100;
		pointer-events: none;

		> .right {
			left: auto;
			right: $spacing-from-edge;
		}

		// > .bottom {
		// 	top: auto;
		// 	bottom: $spacing-from-edge;
		// }

		> * {
			position: absolute;
			top: $spacing-from-edge;
			left: $spacing-from-edge;
			display: flex;
			flex-direction: column;
			background-color: unset;
			pointer-events: all;

			/* Single button */
			> button {
				width: 54px;
				height: 54px;
				margin-bottom: 8px;
				font-size: 16px;
				font-weight: 600;
				font-family: inherit;
				color: var(--color);
				border: 3px solid transparent;
				border-radius: $border-radius;
				background-color: var(--background-color-translucent);
				transition:
					border-color 0.1s,
					background-color 0.1s;
				cursor: default;

				&:hover,
				&:focus-visible {
					outline: none;
					border-color: var(--accent-color);
				}

				&.selected {
					border-color: var(--accent-color);
					background-color: var(--accent-color);

					// + button {
					// 	border-top-color: var(--accent-color);
					// }
				}
			}

			/* Group of buttons */
			> :not(button) {
				width: 54px;
				height: auto;
				margin-bottom: 8px;
				display: flex;
				flex-direction: column;

				> button {
					height: 54px;
					font-size: 16px;
					font-weight: 600;
					font-family: inherit;
					color: var(--color);
					background-color: var(--background-color-translucent);
					border: none;
					transition:
						border-color 0.1s,
						background-color 0.1s;
					cursor: default;

					&:first-child {
						border-top-left-radius: $border-radius;
						border-top-right-radius: $border-radius;
						border: 3px solid transparent;
						border-bottom: none;
					}

					&:not(:first-child) {
						border: 3px solid transparent;
						border-top: 3px solid var(--gray-accent);
						border-bottom: none;
					}

					&:last-child {
						border-bottom-left-radius: $border-radius;
						border-bottom-right-radius: $border-radius;
						border-bottom: 3px solid transparent;
					}

					&:hover,
					&:focus-visible {
						outline: none;
						border-color: var(--accent-color);

						& + button {
							border-top-color: var(--accent-color);
						}
					}

					&.selected {
						border-color: var(--accent-color);
						background-color: var(--accent-color);

						& + button {
							border-top-color: var(--accent-color);
						}
					}
				}
			}
		}
	}
</style>
