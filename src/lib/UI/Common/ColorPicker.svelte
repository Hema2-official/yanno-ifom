<script lang="ts">
	export let value: string;
	export let disabled = false;
	export let title: string = '';
</script>

<div class="color-picker-wrapper">
	<label class:disabled>
		<input
			type="color"
			bind:value
			class="color-picker-input"
			style="background-color: {value};"
			{disabled}
			{title}
		/>
		<span class="label-text"><slot /></span>
	</label>
</div>

<style lang="scss">
	.color-picker-wrapper {
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

			.label-text {
				font-size: 16px;
				font-weight: 500;
				line-height: 20px;
			}

			.color-picker-input {
				width: 20px;
				height: 20px;
				margin: 4px 8px 4px 4px;
				padding: 0;
				outline: none;
				border: none;
				box-shadow: none;
				transition:
					transform 0.1s ease-in-out,
					border-color 0.1s ease-in-out,
					box-shadow 0.1s ease-in-out;
				cursor: pointer;

				&:not(:disabled):hover,
				&:not(:disabled):focus-visible {
					outline: none;
					transform: rotate(10deg);
					box-shadow: 3px 3px 1px 0 var(--accent-color);
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

			&.disabled {
				cursor: default;
			}
		}
	}
</style>
