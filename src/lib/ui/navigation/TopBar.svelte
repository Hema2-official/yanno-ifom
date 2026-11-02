<script lang="ts">
	import * as Menubar from '$lib/components/ui/menubar';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		ChevronsUpDownIcon,
		CircleUserIcon,
		LogInIcon,
		LogOutIcon,
		SettingsIcon,
		UserPenIcon
	} from '@lucide/svelte';
	import LogoSVG from '$lib/ui/common/LogoSVG.svelte';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { settingsState } from '$lib/states/settings.svelte';
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import { resolve } from '$app/paths';
	import CreateProjectDialog from '$lib/ui/menus/projects/CreateProjectDialog.svelte';

	type Props = {
		extraCrumbs?: Snippet;
		extraFileMenuItems?: Snippet;
		extraMenus?: Snippet;
	};
	const { extraCrumbs, extraFileMenuItems, extraMenus }: Props = $props();

	let createLocal = $state(false);
	let showCreate = $state(false);

	function handleCreateProject(local: boolean) {
		createLocal = local;
		showCreate = true;
	}

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

	async function handleLogout() {
		// TODO: ask if user wants to save, if applicable
		goto(resolve('logout'));
	}
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
						Yanno (IFOM flavor)
					</Breadcrumb.Link>
				</Breadcrumb.Item>
				{@render extraCrumbs?.()}
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<Menubar.Root class="h-auto border-none p-0">
			<Menubar.Menu>
				<Menubar.Trigger>File</Menubar.Trigger>
				<Menubar.Content>
					<Menubar.Item onSelect={() => window.open('/', '_blank')}>
						New Tab <Menubar.Shortcut>⌘T</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Separator />
					<Menubar.Item onSelect={() => handleCreateProject(false)}>
						New cloud project...
					</Menubar.Item>
					<Menubar.Item onSelect={() => handleCreateProject(true)}>
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
					<Menubar.Item onSelect={() => settingsState.show('about')}>About</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
		</Menubar.Root>
	</div>

	<div class="flex flex-1 justify-end">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger disabled={accountState.currentAccount === undefined}>
				{#snippet child({ props })}
					<Button {...props} class="flex items-center gap-2" variant="secondary">
						{#if accountState.currentAccount === undefined}
							<Spinner size={14} thickness={3} />
						{:else}
							<CircleUserIcon data-icon="inline-start" />
							{accountState.currentAccount?.email ?? 'Not logged in'}
						{/if}
						<ChevronsUpDownIcon data-icon="inline-end" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>

			<DropdownMenu.Content side="top" class="w-(--bits-dropdown-menu-anchor-width)">
				{#if accountState.currentAccount}
					<!-- TODO: implement -->
					<DropdownMenu.Item>
						<UserPenIcon /> Profile
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item onSelect={() => (settingsState.open = true)}>
					<SettingsIcon /> Settings
					<DropdownMenu.Shortcut>
						{keybindings.label('settings.open')}
					</DropdownMenu.Shortcut>
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				{#if accountState.currentAccount}
					<DropdownMenu.Item onSelect={handleLogout}>
						<LogOutIcon /> Log out
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item onSelect={() => goto(resolve('login'))}>
						<LogInIcon /> Log in
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>

<CreateProjectDialog local={createLocal} bind:open={showCreate} />
