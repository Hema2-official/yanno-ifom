<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { EditorMode } from '$lib/types/editor.type';

	const tools = [
		{ mode: EditorMode.Point, label: 'P', title: 'point_tool' },
		{ mode: EditorMode.Whole, label: 'W', title: 'whole_tool' },
		{ mode: EditorMode.Smooth, label: 'S', title: 'smooth_tool' }
	];
</script>

<div
	class="editor-controls-wrapper"
	role="presentation"
	onmouseup={(e) => inputState.displayMouseUp?.(e)}
>
	<div>
		<div>
			{#each tools as tool (tool.mode)}
				<button
					title={$_(tool.title)}
					class:selected={editorState.mode === tool.mode}
					onclick={() => (editorState.mode = tool.mode)}>{tool.label}</button
				>
			{/each}
		</div>
		<button
			title={$_('auto_resample')}
			class:selected={optionsState.autoResample}
			onclick={() => (optionsState.autoResample = !optionsState.autoResample)}>R</button
		>
	</div>
	<div class="right">
		<button onclick={() => editorState.quit(true)} title={$_('confirm_and_quit')}>Save</button>
		<button onclick={() => editorState.quit(false)} title={$_('quit_without_saving')}
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
