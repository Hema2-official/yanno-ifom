<script lang="ts">
	import { _ } from "svelte-i18n";
	import svgLogo from '/logo.svg'
    import { getFramesDifference, getFramesAtChangeIndex, textToDataType, dataTypeToText, download } from "$lib/utils/data";
	
	let fileInputElement: HTMLInputElement;
	let progressElement: HTMLProgressElement;
	
	const handleFileInput = () => {
		const file = fileInputElement.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			const data = textToDataType(text, (progress) => {
				progressElement.value = progress;
			});

			data.changes.push({
				time: Date.now(),
				frames: [
					{
						index: 25,
						cells: [
							{
								id: 7,
								x: [0, 1, 2, 3, 4, 5],
								y: [0, 1, 2, 3, 4, 5],
							}
						]
					}
				]
			});
			data.changes.push({
				time: Date.now(),
				frames: [
					{
						index: 25,
						cells: [
							{
								id: 2,
								x: null,
								y: null,
							}
						]
					}
				]
			});

			console.log(data.changes);

			const processed = getFramesAtChangeIndex(data, 1);
			const difference = getFramesDifference(data.originalFrames, processed);
			console.log(processed);
			console.log(difference);

			const backtotext = dataTypeToText(data, 1);
			download(backtotext, "test.txt", "text/plain");
		}
		reader.readAsText(file);
	}

</script>

<nav class="navbar">
	<img src={svgLogo} class="logo" alt="Logo" />
	<p class="title">{$_("app_title")}</p>
	<div class="input-container">
		<input type="file"
			accept=".txt"
			bind:this={fileInputElement}
			on:change={handleFileInput}
			/>
		<progress value="0" bind:this={progressElement}></progress>
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
		border-bottom: 0.2rem solid var(--accent-color);
	}

	.input-container {
		gap: 20px;
	}

	.logo {
		width: 4rem;
		height: 4rem;
	}

</style>
