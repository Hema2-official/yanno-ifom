<script lang="ts">
	export let checked = false;
	export let disabled = false;
	export let title: string = '';
</script>

<div class="checkbox-wrapper">
	<label class:disabled>
		<input type="checkbox" bind:checked class="checkbox" {disabled} {title} />
		<span class="label-text"><slot /></span>
	</label>
</div>

<style lang="scss">
	.checkbox-wrapper {
		display: flex;
		flex-direction: column;
		align-items: start;
		margin: 8px 4px;
		overflow: visible;

		label {
			position: relative;
			display: flex;
			align-items: center;
			justify-content: space-between;
			white-space: nowrap;
			user-select: none;
			cursor: pointer;

			&.disabled {
				cursor: default;
			}

			.label-text {
				font-size: 16px;
				font-weight: 500;
				line-height: 20px;
			}

			.checkbox {
				display: inline-block;
				width: 20px;
				height: 20px;
				margin: 4px 8px 4px 4px;
				padding: 0;
				outline: none;
				border: none;
				border: 2px solid var(--gray-accent);
				border-radius: 6px;
				background-color: transparent;
				transition:
					border-color 0.1s,
					background-color 0.1s;
				appearance: none;
				cursor: pointer;

				&::after {
					content: '';
					box-sizing: content-box;
					position: absolute;
					opacity: 0;
					transition: opacity 0.1s;
					left: 11px;
					top: 7px;
					width: 4px;
					height: 8px;
					border: solid var(--color);
					border-radius: 3px;
					border-width: 0 3px 3px 0;
					transform: rotate(45deg);
				}

				&:checked::after {
					opacity: 1;
				}

				&:not(:disabled) {
					&:hover,
					&:focus-visible {
						border-color: var(--accent-color);

						&:checked {
							background-color: var(--accent-color);
						}
					}
				}

				&:disabled {
					opacity: 0.6;
					cursor: default;

					+ .label-text {
						opacity: 0.6;
						cursor: default;
					}
				}
			}
		}
	}
</style>
