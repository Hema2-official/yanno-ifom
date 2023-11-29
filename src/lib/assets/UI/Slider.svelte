<script lang="ts">
	export let value = 0;
	export let max = 1;

	// export function prop
	export let slide: (event: any) => void;
	export let mDown: (event: Event) => void = null;
	export let mUp: (event: Event) => void = null;
</script>

<div class="labeled-input-wrapper">
	<label class="range-label">
		<span class="label-text"><slot /></span>
		<input
			type="range"
			min="0"
			max="{max}"
			{value}
			on:change={slide}
			on:mousedown={mDown}
			on:mouseup={mUp}
			class="range range-success"
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
		transition: background-color .1s ease-in-out;
		border-radius: 10px;
		margin: .2rem;
		width: calc(100% - .4rem);
		height: 10px;
	}
	input[type='range']:hover {
		background-color: var(--accent-color);
	}

	.range-label {
		flex-direction: column !important;
		align-items: center;
		width: 100%;
		gap: .1rem;
		cursor: unset !important;
	}
</style>
