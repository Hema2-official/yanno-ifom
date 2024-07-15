<script lang="ts">
</script>

<div class="auth-container">
	<img src="/logo.svg" alt="" on:dragstart|preventDefault />
	<slot />
</div>

<style lang="scss">
	.auth-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		width: 100%;

		img {
			width: 100px;
			height: 100px;
		}
	}
</style>
