<script lang="ts">
	import type { EventHandler } from 'svelte/elements';

	export let onClick: EventHandler<MouseEvent>;
	export let disabled = false;
	export let loading = false;
</script>

<button class="proceed-button" on:click={onClick} class:disabled class:loading>
	<slot />
</button>

<style lang="scss">
	.proceed-button {
		padding: 6px 20px;
		margin-top: 16px;
		background: transparent;
		border: none;
		border: 1px solid var(--gray-accent);
		border-radius: 5px;
		font-size: 16px;
		font-weight: 600;
		transition:
			background-color 0.2s,
			border-color 0.2s,
			color 0.2s;

		cursor: pointer;

		&.disabled {
			color: var(--gray-accent);
		}

		&:not(.disabled):hover {
			border-color: var(--accent-color);
		}

		&.loading {
			background: linear-gradient(
				to right,
				transparent 0%,
				var(--accent-color) 50%,
				transparent 100%
			);
			background-size: 1000px 100%;
			animation: bg 3s linear infinite;
		}

		@keyframes bg {
			0% {
				background-position-x: 0;
			}
			100% {
				background-position-x: 1000px;
			}
		}
	}
</style>
