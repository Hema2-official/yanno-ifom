<script lang="ts">
	import { _ } from 'svelte-i18n';
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
	import { dataTypeToText, download } from '$lib/utils/data.svelte';
	import type { NewCellType } from '$lib/types/annotation.type';
	import * as Menubar from '$lib/components/ui/menubar';
	import { autoResample, sidebarRight } from '$lib/stores/options';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		ChevronsUpDownIcon,
		CircleUserIcon,
		CloudIcon,
		CloudSyncIcon,
		LogInIcon,
		LogOutIcon,
		SettingsIcon,
		UserPenIcon
	} from 'lucide-svelte';
	import LogoSVG from '$lib/UI/Common/LogoSVG.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { accountState } from '$lib/states/AccountState.svelte';
	import Spinner from '../Common/Spinner.svelte';

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

	async function handleLogout() {
		// TODO: ask if user wants to save, if applicable
		goto('/logout');
	}
</script>

<div class="w-full flex items-center px-3 py-2 gap-2 border-b-1 border-accent">
	<LogoSVG class="size-14" />

	<div class="flex flex-col h-full justify-between items-start">
		<Breadcrumb.Root>
			<Breadcrumb.List class="text-lg">
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/" class="text-foreground font-semibold">
						{$_('app_title')}
					</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger class="flex items-center gap-1">
							<Breadcrumb.Link>{$currentProject?.name}</Breadcrumb.Link>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							{#each $currentProject?.versions ?? [] as projectVersion}
								<DropdownMenu.Item
									disabled={projectVersion.id == $currentProjectVersion?.id}
									onSelect={() => {}}
									>{projectVersion.name}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{$currentProjectVersion?.name}</Breadcrumb.Page>
				</Breadcrumb.Item>
				<Breadcrumb.Item>
					<!-- TODO: indicate offline editing, etc. -->
					{#if $savingIndicator}
						<CloudSyncIcon size={18} />
						Saving...
					{:else}
						<CloudIcon size={18} />
					{/if}
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<Menubar.Root class="border-none p-0 h-auto">
			<Menubar.Menu>
				<Menubar.Trigger>File</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item>
						New Tab <Menubar.Shortcut>⌘T</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item>Open project...</Menubar.Item>
					<Menubar.Item>Open offline...</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item onSelect={saveToServer}>Save</Menubar.Item>
					<Menubar.Item>Save as...</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item onSelect={exportAsJSON}>Export as JSON</Menubar.Item>
					<Menubar.Item onSelect={exportAsTXT}>Export as TXT</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
			<Menubar.Menu>
				<Menubar.Trigger>Edit</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item onSelect={undoChange}>
						Undo <Menubar.Shortcut>⌘Z</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Item onSelect={redoChange}>
						Redo <Menubar.Shortcut>⇧⌘Z</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item onSelect={createNewCell}>New Cell...</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Sub>
						<Menubar.SubTrigger>Find</Menubar.SubTrigger>
						<Menubar.SubContent>
							<Menubar.Item>Search the web</Menubar.Item>
							<Menubar.Separator />
							<Menubar.Item>Find...</Menubar.Item>
							<Menubar.Item>Find Next</Menubar.Item>
							<Menubar.Item>Find Previous</Menubar.Item>
						</Menubar.SubContent>
					</Menubar.Sub>
					<Menubar.Separator />
					<Menubar.Item>Cut</Menubar.Item>
					<Menubar.Item>Copy</Menubar.Item>
					<Menubar.Item>Paste</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
			<Menubar.Menu>
				<Menubar.Trigger>View</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item inset>Zoom In</Menubar.Item>
					<Menubar.Item inset>Zoom Out</Menubar.Item>
					<Menubar.Item inset>Reset Zoom</Menubar.Item>
					<Menubar.Separator />
					<Menubar.CheckboxItem bind:checked={$sidebarRight}>
						Sidebar on the right
					</Menubar.CheckboxItem>
					<Menubar.Separator />
					<Menubar.CheckboxItem bind:checked={$autoResample}>
						Auto Resample
					</Menubar.CheckboxItem>
				</Menubar.Content>
			</Menubar.Menu>
			<Menubar.Menu>
				<Menubar.Trigger>Help</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item>Documentation</Menubar.Item>
					<Menubar.Item>About</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
		</Menubar.Root>
	</div>

	<div class="flex-1 flex justify-end">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger disabled={accountState.currentAccount === undefined}>
				{#snippet child({ props })}
					<Button {...props} class="flex items-center gap-2" variant="secondary">
						{#if accountState.currentAccount === undefined}
							<Spinner size={14} thickness={3} />
						{:else}
							<CircleUserIcon />
							{accountState.currentAccount?.email ?? 'Not logged in'}
						{/if}
						<ChevronsUpDownIcon />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>

			<DropdownMenu.Content side="top" class="w-(--bits-dropdown-menu-anchor-width)">
				{#if accountState.currentAccount}
					<!-- TODO: implement -->
					<DropdownMenu.Item>
						<UserPenIcon /> Profile
					</DropdownMenu.Item>
					<DropdownMenu.Item>
						<SettingsIcon /> Settings
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={handleLogout}>
						<LogOutIcon /> Log out
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item>
						<LogInIcon /> Log in
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
