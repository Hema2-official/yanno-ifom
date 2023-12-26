<script>
	import { _ } from "svelte-i18n";
	import svgLogo from '/logo.svg'

</script>

<nav class="navbar">
	<img src={svgLogo} class="logo" alt="Logo" />
	<p class="title">{$_("app_title")}</p>
	<div class="input-container">
		<input
			type="file"
			class="file-input file-input-bordered file-input-accent w-full max-w-xs"
		/>
		<span>OR</span>
	</div>
</nav>

<style>
	.navbar {
		position: relative;
		top: 0;
		left: 0;
		height: var(--top-bar-height);
		width: calc(100% - var(--right-bar-width));
		display: flex;
		align-items: center;
		padding: 0 20px;
		gap: 80px;
		box-sizing: border-box;
		border-bottom: 2px solid var(--accent-color);
	}

	.input-container {
		gap: 20px;
	}

	.logo {
		width: 4rem;
		height: 4rem;
	}

</style>
