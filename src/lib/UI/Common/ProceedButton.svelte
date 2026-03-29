<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		onClick,
		disabled = false,
		loading = false,
		children
	}: {
		onClick: (event: MouseEvent) => void;
		disabled?: boolean;
		loading?: boolean;
		children?: Snippet;
	} = $props();
</script>

<button
	class="proceed-button px-5 py-1.5 mt-4 bg-transparent border border-border rounded-md text-base font-semibold cursor-pointer transition-[background-color,border-color,color] duration-200"
	onclick={onClick}
	class:disabled
	class:loading
>
	{@render children?.()}
</button>

<style lang="scss">
	.proceed-button {
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
	}

	@keyframes bg {
		0% {
			background-position-x: 0;
		}
		100% {
			background-position-x: 1000px;
		}
	}
</style>
