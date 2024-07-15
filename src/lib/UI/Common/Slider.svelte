<script lang="ts">
	import type { EventHandler } from 'svelte/elements';

	export let value: number;
	export let min = 0;
	export let max: number;
	export let disabled = false;
	export let title: string = '';

	export let mDown: EventHandler<Event> = () => null;
	export let mUp: EventHandler<Event> = () => null;
</script>

<div class="slider-wrapper" title={title ? title : value.toString()}>
	<label class:disabled>
		<span class="label-text"><slot /></span>
		<input
			type="range"
			{min}
			{max}
			bind:value
			on:mousedown={mDown}
			on:mouseup={mUp}
			class="slider-input"
			{disabled}
		/>
	</label>
</div>

<style lang="scss">
	.slider-wrapper {
		display: flex;
		flex-direction: column;
		align-items: start;
		margin: 8px 4px;
		overflow: visible;

		label {
			position: relative;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			gap: 2px;
			white-space: nowrap;
			user-select: none;
			cursor: unset;

			.label-text {
				font-size: 16px;
				font-weight: 500;
				line-height: 20px;
			}

			.slider-input {
				appearance: none;
				background-color: var(--gray-accent);
				color: pink;
				transition: background-color 0.1s ease-in-out;
				border-radius: 10px;
				margin: 2px 4px;
				width: calc(100% - 8px);
				height: 10px;

				&:not(:disabled):hover,
				&:not(:disabled):focus-visible {
					outline: none;
					background-color: var(--accent-color);
				}

				&:disabled {
					opacity: 0.6;
					cursor: default;
				}
			}

			&.disabled {
				cursor: default;

				.label-text {
					opacity: 0.6;
					cursor: default;
				}
			}
		}
	}
</style>
