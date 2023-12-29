<script lang="ts">
	export let checked = false;
	export let disabled = false;
</script>

<div class="labeled-input-wrapper">
	<label>
		<input type="checkbox" bind:checked={checked} class="labeled-input checkbox" disabled={disabled} />
		<span class="label-text"><slot /></span>
	</label>
</div>

<style>
	.checkbox {
		display: inline-block;
		border-radius: 0.36rem;
		border: 0.15rem solid var(--gray-accent);
		background-color: transparent;
		transition: border-color 0.1s, background-color 0.1s;
		appearance: none;
	}

	.checkbox:not(:disabled):hover, .checkbox:not(:disabled):focus-visible {
		outline: none;
		border-color: var(--accent-color);
	}

	.checkbox:not(:disabled):checked:hover, .checkbox:not(:disabled):checked:focus-visible {
		outline: none;
		background-color: var(--accent-color);
	}

	.checkbox::after {
		content: "";
		position: absolute;
		opacity: 0;
		transition: opacity 0.1s;
		left: .67rem;
		top: .45rem;
		width: .25rem;
		height: .5rem;
		border: solid var(--color);
		border-radius: .15rem;
		border-width: 0 3px 3px 0;
		-webkit-transform: rotate(45deg);
		-ms-transform: rotate(45deg);
		transform: rotate(45deg);
	}

	.checkbox:checked::after {
		opacity: 1;
	}

	.checkbox:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.checkbox:disabled + .label-text {
		opacity: 0.6;
		cursor: default;
	}
	label:has(.checkbox:disabled) {
		cursor: default;
	}


</style>