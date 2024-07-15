<script lang="ts">
	import { _ } from 'svelte-i18n';
	import TopBarButton from './TopBarButton.svelte';
	import {
		annotation,
		currentFrameId,
		currentProject,
		currentProjectVersion,
		displayFrames,
		pushChange,
		redoChange,
		saveToServer,
		savingIndicator,
		undoChange
	} from '$lib/stores/data';
	import type { SubmenuItemType } from '$lib/types/navigation.type';
	import { dataTypeToText, download } from '$lib/utils/data';
	import type { NewCellType } from '$lib/types/annotation.type';
	// import {
	// 	getFramesDifference,
	// 	getFramesAtChangeIndex,
	// 	textToDataType,
	// 	dataTypeToText,
	// 	download
	// } from '$lib/utils/data';

	// const handleTxtFileInput = (e: Event) => {
	// 	const file = (e.currentTarget as HTMLInputElement).files[0];
	// 	if (!file) return;
	// 	const reader = new FileReader();
	// 	reader.onload = () => {
	// 		const text = reader.result as string;
	// 		textToDataType(text).then((d) => {
	// 			d.changes.push({
	// 				time: Date.now(),
	// 				frames: [
	// 					{
	// 						id: 25,
	// 						cells: [
	// 							{
	// 								id: 7,
	// 								x: [0, 1, 2, 3, 4, 5],
	// 								y: [0, 1, 2, 3, 4, 5]
	// 							}
	// 						]
	// 					}
	// 				]
	// 			});
	// 			d.changes.push({
	// 				time: Date.now(),
	// 				frames: [
	// 					{
	// 						id: 25,
	// 						cells: [
	// 							{
	// 								id: 2,
	// 								x: null,
	// 								y: null
	// 							}
	// 						]
	// 					}
	// 				]
	// 			});

	// 			console.log(d.changes);

	// 			const processed = getFramesAtChangeIndex(d, 1);
	// 			const difference = getFramesDifference(d.originalFrames, processed);
	// 			console.log(processed);
	// 			console.log(difference);

	// 			const backtotext = dataTypeToText(d, 1);
	// 			download(backtotext, 'test.txt', 'text/plain');
	// 		});
	// 	};
	// 	reader.readAsText(file);
	// };

	// const handleTifFileInput = (e: Event) => {
	//     const file = (e.currentTarget as HTMLInputElement).files[0];
	//     if (!file) return;
	//     const reader = new FileReader();
	//     reader.onload = () => {
	//         const buf = reader.result as ArrayBuffer;
	//         getTiffFramesAsPngs(buf).then((frames) => {
	//             console.log(frames);
	//             blob_pngs.set(frames);
	//         });
	//         console.log("Promise returned");
	//     }
	//     reader.readAsArrayBuffer(file);
	//     console.log("Reading file");
	// }

	const exportAsJSON = () => {
		download(
			JSON.stringify($annotation),
			$currentProject.name + '_' + $currentProjectVersion + '.json',
			'application/json'
		);
	};

	const exportAsTXT = () => {
		download(
			dataTypeToText($annotation),
			$currentProject.name + '_' + $currentProjectVersion + '.txt',
			'text/plain'
		);
	};

	const createNewCell = () => {
		// Find an ID that doesn't exist amongst the $displayFrames' cells
		const existingCellIds = $displayFrames.flatMap((f) => f.cells.map((c) => c.id));
		let newCellId = 1;
		while (existingCellIds.includes(newCellId)) newCellId++;

		// Create a new cell (at center)
		const newCell: NewCellType = {
			id: newCellId,
			bodies: [
				{
					x: [256, 258, 260, 258, 256, 254, 252, 254],
					y: [252, 254, 256, 258, 260, 258, 256, 254]
				}
			]
		};

		// Push a change with the new cell
		pushChange({
			time: Date.now(),
			message: `Add new cell ${newCellId}`,
			frames: [{ id: $currentFrameId, cells: [newCell] }]
		});
	};

	const controlButtons: { label: string; items: SubmenuItemType[] }[] = [
		{
			label: 'File',
			items: [
				{ label: 'Open', onClick: () => console.log('Open clicked') },
				{ label: 'Save', onClick: saveToServer },
				{ label: 'Export as JSON', onClick: exportAsJSON },
				{ label: 'Export as TXT', onClick: exportAsTXT }
			]
		},
		{
			label: 'Edit',
			items: [
				{ label: 'Undo', onClick: undoChange },
				{ label: 'Redo', onClick: redoChange },
				{ label: 'New Cell...', onClick: createNewCell }
			]
		},
		{
			label: 'View',
			items: [
				{ label: 'Zoom In', onClick: () => console.log('Zoom In clicked') },
				{ label: 'Zoom Out', onClick: () => console.log('Zoom Out clicked') },
				{ label: 'Reset Zoom', onClick: () => console.log('Reset Zoom clicked') }
			]
		},
		{
			label: 'Help',
			items: [
				{ label: 'Documentation', onClick: () => console.log('Documentation clicked') },
				{ label: 'About', onClick: () => console.log('About clicked') }
			]
		}
	];
</script>

<nav class="navbar">
	<img src="/logo.svg" class="logo" alt="" />

	<div class="content">
		<div class="info-row">
			<p class="title">{$_('app_title')}</p>
			<p class="project-name">{$currentProject.name}</p>
			<p class="project-version">{$currentProjectVersion}</p>
			{#if $savingIndicator}
				<p class="project-version">Saving...</p>
			{/if}
		</div>
		<div class="control-row">
			{#each controlButtons as button}
				<TopBarButton submenuItems={button.items}>{button.label}</TopBarButton>
			{/each}
		</div>
	</div>
</nav>

<style lang="scss">
	.navbar {
		height: 74px;
		width: 100%;
		display: flex;
		align-items: center;
		padding: 0 12px;
		gap: 20px;
		border-bottom: 3px solid var(--accent-color);

		.logo {
			height: 84%;
			aspect-ratio: 1;
		}

		.content {
			display: flex;
			flex-direction: column;
			height: 100%;
			justify-content: space-evenly;
			align-items: start;

			.info-row {
				display: flex;
				flex-direction: row;
				gap: 8px;

				.title {
					text-align: center;
					font-size: 16px;
					font-weight: 600;
					margin: 0;
					margin-right: 6px;
				}

				.project-name {
					text-align: center;
					font-size: 16px;
					margin: 0;
				}

				.project-version {
					text-align: center;
					font-size: 16px;
					margin: 0;
					opacity: 0.7;
				}
			}

			.control-row {
				display: flex;
				flex-direction: row;
				gap: 6px;
			}
		}
	}
</style>
