<script lang="ts">
	import { SearchIcon, XIcon } from '@lucide/svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { settingsState } from '$lib/states/settings.svelte';
	import { groups } from './groups';
	import { ScrollArea } from '$lib/components/ui/scroll-area';

	const selected = $derived(groups.find(({ id }) => id === settingsState.page) ?? groups[0]);
	let search = $state('');
	const query = $derived(search.trim().toLowerCase());

	// Each group counts its own matches; a search shows every group that has some
	const hits = $derived(
		Object.fromEntries(groups.map((group) => [group.id, group.search(query).length]))
	);
	const shown = $derived(query ? groups.filter((group) => hits[group.id] > 0) : [selected]);

	function showGroup(group: (typeof groups)[number]) {
		settingsState.page = group.id;
		search = '';
	}
</script>

<Dialog.Root bind:open={settingsState.open} onOpenChange={(open) => !open && (search = '')}>
	<Dialog.Content class="overflow-hidden p-0 sm:max-w-3xl">
		<Dialog.Title class="sr-only">Settings</Dialog.Title>
		<Dialog.Description class="sr-only">Keyboard shortcuts and appearance.</Dialog.Description>
		<Sidebar.Provider
			class="h-[34rem] max-h-[calc(100vh-2rem)] min-h-0"
			style="--sidebar-width: 14rem"
		>
			<Sidebar.Root collapsible="none" class="border-r">
				<Sidebar.Header>
					<InputGroup.Root class="bg-background">
						<InputGroup.Input placeholder="Search settings" bind:value={search} />
						<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
						{#if search}
							<InputGroup.Button onclick={() => (search = '')}>
								<XIcon />
							</InputGroup.Button>
						{/if}
					</InputGroup.Root>
				</Sidebar.Header>
				<Sidebar.Content>
					<Sidebar.Group>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each groups as group (group.id)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton
											isActive={!query && selected === group}
											aria-disabled={!!query && hits[group.id] === 0}
											onclick={() => showGroup(group)}
										>
											<group.icon />
											<span>{group.label}</span>
										</Sidebar.MenuButton>
										{#if query}
											<Sidebar.MenuBadge>{hits[group.id]}</Sidebar.MenuBadge>
										{/if}
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>
			</Sidebar.Root>

			<main class="flex min-w-0 flex-1 flex-col overflow-hidden">
				<header class="flex h-14 shrink-0 items-center px-4">
					<Breadcrumb.Root>
						<Breadcrumb.List>
							<Breadcrumb.Item>Settings</Breadcrumb.Item>
							<Breadcrumb.Separator />
							<Breadcrumb.Item>
								<Breadcrumb.Page>
									{query ? 'Search results' : selected.label}
								</Breadcrumb.Page>
							</Breadcrumb.Item>
						</Breadcrumb.List>
					</Breadcrumb.Root>
				</header>

				<ScrollArea class="min-h-0 flex-1">
					<div class="flex flex-col gap-6 px-4 pb-4">
						{#each shown as group (group.id)}
							<section class="flex flex-col gap-4">
								{#if query}
									<h3 class="text-base font-semibold">{group.label}</h3>
								{/if}
								<group.component {query} />
							</section>
						{:else}
							<p class="text-muted-foreground text-sm">
								No settings match “{search.trim()}”.
							</p>
						{/each}
					</div>
				</ScrollArea>
			</main>
		</Sidebar.Provider>
	</Dialog.Content>
</Dialog.Root>
