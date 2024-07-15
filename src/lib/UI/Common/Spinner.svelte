<script lang="ts">
	export let color = 'var(--color)';
	export let size = 42; // px
	export let speed = 0.75; // s
	export let thickness = 8; // px, odd numbers create a wobble effect
	export let opacity = 1;
	export let transitionSpeed = 0.2; // s

	$: styles = `
        --spinner-color: ${color};
        --spinner-size: ${size}px;
        --spinner-speed: ${speed}s;
        --spinner-thickness: ${thickness}px;
		--spinner-opacity: ${opacity};
		--spinner-transition-speed: ${transitionSpeed}s;
    `;
</script>

<div class="loading-spinner" style={styles} />

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
		border-radius: 50%;
		display: inline-block;
		opacity: var(--spinner-opacity);
		transition:
			opacity var(--spinner-transition-speed),
			border-color var(--spinner-transition-speed);
	}
</style>
