<script lang="ts">
	import { _ } from "svelte-i18n";
	import svgLogo from '/logo.svg'
    import { getFramesDifference, getFramesAtChangeIndex, textToDataType, dataTypeToText, download } from "$lib/utils/data";
    import { getTiffFrames } from "$lib/utils/imaging";
  import { blob_pngs } from "$lib/stores";

	let txtProgressElement: HTMLProgressElement;
	let tifProgressElement: HTMLProgressElement;
	
	const handleTxtFileInput = (e: Event) => {
		const file = (e.currentTarget as HTMLInputElement).files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			textToDataType(text, (progress) => {
				txtProgressElement.value = progress / 100;
			}).then((d) => {
				d.changes.push({
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
				d.changes.push({
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

				console.log(d.changes);

				const processed = getFramesAtChangeIndex(d, 1);
				const difference = getFramesDifference(d.originalFrames, processed);
				console.log(processed);
				console.log(difference);

				const backtotext = dataTypeToText(d, 1);
				download(backtotext, "test.txt", "text/plain");
			});

			
		}
		reader.readAsText(file);
	}

	const handleTifFileInput = (e: Event) => {
		const file = (e.currentTarget as HTMLInputElement).files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const buf = reader.result as ArrayBuffer;
			getTiffFrames(buf, (progress) => {
				console.log(progress);
				tifProgressElement.value = progress / 100;
			}).then((frames) => {
				console.log(frames);
				blob_pngs.set(frames);
			});
			console.log("Promise returned");
		}
		reader.readAsArrayBuffer(file);
		console.log("Reading file");
	}

</script>

<nav class="navbar">
	<img src={svgLogo} class="logo" alt="Logo" />
	<p class="title">{$_("app_title")}</p>
	<div class="input-container">
		<input type="file"
			accept=".txt"
			on:change={handleTxtFileInput} />
		<progress value="0" bind:this={txtProgressElement} />
	</div>
	<div class="input-container">
		<input type="file" 
			accept=".tif,.tiff"
			on:change={handleTifFileInput}
			/>
		<progress value="0" bind:this={tifProgressElement} />
	</div>
</nav>

<style>
	.navbar {
		position: relative;
		top: 0;
		left: 0;
		height: var(--top-bar-height);
		width: 100%;
		display: flex;
		align-items: center;
		padding: 0 20px;
		gap: 80px;
		box-sizing: border-box;
		border-bottom: 0.2rem solid var(--accent-color);
	}

	.input-container {
		display: flex;
		flex-direction: column;
	}

	.logo {
		width: 4rem;
		height: 4rem;
	}

</style>
