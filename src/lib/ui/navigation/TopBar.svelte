<script lang="ts">
	import { _ } from 'svelte-i18n';
	import * as Menubar from '$lib/components/ui/menubar';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { SettingsIcon } from '@lucide/svelte';
	import LogoSVG from '$lib/ui/common/LogoSVG.svelte';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { settingsState } from '$lib/states/settings.svelte';
	import { resolve } from '$app/paths';
	import CreateProjectDialog from '$lib/ui/menus/projects/CreateProjectDialog.svelte';

	type Props = {
		extraCrumbs?: Snippet;
		extraFileMenuItems?: Snippet;
		extraMenus?: Snippet;
	};
	const { extraCrumbs, extraFileMenuItems, extraMenus }: Props = $props();

	let showCreate = $state(false);

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
</script>

<div
	class="bg-background border-accent sticky top-0 z-10 flex w-full items-center gap-2 border-b-1 px-3 py-2"
>
	<LogoSVG class="size-14" />

	<div class="flex h-full flex-col items-start justify-between">
		<Breadcrumb.Root>
			<Breadcrumb.List class="text-lg">
				<Breadcrumb.Item>
					<Breadcrumb.Link
						href={resolve('/projects')}
						class="text-foreground font-semibold"
					>
						{$_('app_title')}
					</Breadcrumb.Link>
				</Breadcrumb.Item>
				{@render extraCrumbs?.()}
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<Menubar.Root class="h-auto border-none p-0">
			<Menubar.Menu>
				<Menubar.Trigger>File</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item onSelect={() => window.open(resolve('/'), '_blank')}>
						New Tab <Menubar.Shortcut>⌘T</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item onSelect={() => (showCreate = true)}>
						New local project...
					</Menubar.Item>
					{@render extraFileMenuItems?.()}
				</Menubar.Content>
			</Menubar.Menu>
			{@render extraMenus?.()}
			<Menubar.Menu>
				<Menubar.Trigger>Help</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item>Documentation</Menubar.Item>
					<Menubar.Item>About</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
		</Menubar.Root>
	</div>

	<div class="flex flex-1 justify-end">
		<Button variant="secondary" onclick={() => (settingsState.open = true)}>
			<SettingsIcon data-icon="inline-start" /> Settings
		</Button>
	</div>
</div>

<CreateProjectDialog bind:open={showCreate} />
