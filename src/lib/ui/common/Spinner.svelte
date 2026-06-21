<script lang="ts">
	let {
		color = 'var(--color)',
		size = 42,
		speed = 0.75,
		thickness = 8,
		opacity = 1,
		transitionSpeed = 0.2
	}: {
		color?: string;
		size?: number;
		speed?: number;
		thickness?: number;
		opacity?: number;
		transitionSpeed?: number;
	} = $props();

	let styles = $derived(`
		--spinner-color: ${color};
		--spinner-size: ${size}px;
		--spinner-speed: ${speed}s;
		--spinner-thickness: ${thickness}px;
		--spinner-opacity: ${opacity};
		--spinner-transition-speed: ${transitionSpeed}s;
	`);
</script>

<div class="loading-spinner inline-block rounded-full" style={styles}></div>

<style lang="scss">
	@keyframes rotate-forever {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.loading-spinner {
		animation-duration: var(--spinner-speed);
		animation-iteration-count: infinite;
		animation-name: rotate-forever;
		animation-timing-function: linear;
		height: var(--spinner-size);
		width: var(--spinner-size);
		border: var(--spinner-thickness) solid;
		border-color: var(--spinner-color);
		border-right-color: transparent;
		opacity: var(--spinner-opacity);
		transition:
			opacity var(--spinner-transition-speed),
			border-color var(--spinner-transition-speed);
	}
</style>
