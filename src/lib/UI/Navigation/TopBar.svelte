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
	import { dataTypeToText, download } from '$lib/utils/data.svelte';
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
			$currentProject.name + '_' + $currentProjectVersion.id + '.json',
			'application/json'
		);
	};

	const exportAsTXT = () => {
		download(
			dataTypeToText($annotation),
			$currentProject.name + '_' + $currentProjectVersion.id + '.txt',
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

<nav
	class="h-[74px] w-full flex items-center px-3 gap-5 border-b-[3px] border-[var(--accent-color)]"
>
	<img src="/logo.svg" class="h-[84%] aspect-square" alt="" />

	<div class="flex flex-col h-full justify-evenly items-start">
		<div class="flex flex-row gap-2">
			<p class="text-center text-base font-semibold m-0 mr-1.5">{$_('app_title')}</p>
			<p class="text-center text-base m-0">{$currentProject.name}</p>
			<p class="text-center text-base m-0 opacity-70">{$currentProjectVersion.name}</p>
			{#if $savingIndicator}
				<p class="text-center text-base m-0 opacity-70">Saving...</p>
			{/if}
		</div>
		<div class="flex flex-row gap-1.5">
			{#each controlButtons as button}
				<TopBarButton submenuItems={button.items}>{button.label}</TopBarButton>
			{/each}
		</div>
	</div>
</nav>
