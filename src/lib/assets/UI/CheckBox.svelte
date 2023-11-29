<script lang="ts">
	export let checked = false;

	// export function prop
	export let cb: (event: any) => void;
</script>

<div class="labeled-input-wrapper">
	<label>
		<input type="checkbox" {checked} on:change={cb} class="labeled-input checkbox" />
		<span class="checkmark"></span>
		<span class="label-text"><slot /></span>
	</label>
</div>

<style>
	.checkbox {
		display: inline-block;
		border-radius: 4px;
		border: 2px solid var(--gray-accent);
		background-color: unset;
		transition: border-color 0.1s, background-color 0.1s;
		appearance: none;
	}

	.checkbox:hover {
		border-color: var(--accent-color);
	}


	.checkbox:checked:hover {
		background-color: var(--accent-color);
	}

	.checkmark::after {
		content: "";
		position: absolute;
		opacity: 0;
		transition: opacity 0.1s;
		left: .7rem;
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

	.checkbox:checked ~ .checkmark::after {
		opacity: 1;
	}
</style>