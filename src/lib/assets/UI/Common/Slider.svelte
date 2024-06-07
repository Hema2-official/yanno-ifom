<script lang="ts">
	export let value: number;
	export let min = 0;
	export let max: number;
	export let disabled = false;
	export let title: string = '';

	export let mDown: (event: Event) => void = null;
	export let mUp: (event: Event) => void = null;
</script>

<div class="labeled-input-wrapper" title={title ? title : value.toString()}>
	<label class="range-label">
		<span class="label-text"><slot /></span>
		<input
			type="range"
			{min}
			{max}
			bind:value
			on:mousedown={mDown}
			on:mouseup={mUp}
			class="range range-success"
			{disabled}
		/>
	</label>
</div>

<style>
	input[type='range'] {
		-moz-appearance: none;
		-webkit-appearance: none;
		appearance: none;
		background-color: var(--gray-accent);
		color: pink;
		transition: background-color 0.1s ease-in-out;
		border-radius: 10px;
		margin: 0.2rem;
		width: calc(100% - 0.4rem);
		height: 10px;
	}
	input[type='range']:not(:disabled):hover,
	input[type='range']:not(:disabled):focus-visible {
		outline: none;
		background-color: var(--accent-color);
	}

	.range-label {
		flex-direction: column !important;
		align-items: center;
		width: 100%;
		gap: 0.1rem;
		cursor: unset !important;
	}

	input[type='range']:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.label-text:has(+ input[type='range']:disabled) {
		opacity: 0.6;
		cursor: default;
	}
	label:has(input[type='range']:disabled) {
		cursor: default;
	}
</style>
