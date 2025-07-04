<script lang="ts">
	export let click: (event: MouseEvent) => void;
	export let disabled = false;
	export let title: string = '';
	export let type: 'button' | 'submit' | 'reset' = 'button';
</script>

<div class="button-wrapper">
	<button on:click={click} class="button" {disabled} {title} {type}><slot /></button>
</div>

<style lang="scss">
	.button-wrapper {
		display: flex;
		flex-direction: column;
		margin: 12px 4px;
	}

	.button {
		display: inline-block;
		max-width: 100%;
		overflow: hidden;
		padding: 4px 16px;
		border: none;
		border: 1px solid var(--gray-accent);
		border-radius: 5px;
		background: transparent;
		transition:
			border-color 0.1s,
			background-color 0.1s,
			opacity 0.1s,
			box-shadow 0.1s;

		appearance: none;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;

		&:disabled {
			opacity: 0.6;
			cursor: default;
		}

		&:not(:disabled):hover,
		&:not(:disabled):focus-visible {
			outline: none;
			border-color: var(--focus-color);
			opacity: 0.8;
			box-shadow: 0 1px 0 1px var(--focus-color);
		}

		&:not(:disabled):active:hover,
		&:not(:disabled):active:focus-visible {
			outline: none;
			background-color: var(--focus-color);
		}
	}
</style>
