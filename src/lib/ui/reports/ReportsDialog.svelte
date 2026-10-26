<script lang="ts">
	import {
		ChartColumnIcon,
		GitForkIcon,
		ListChecksIcon,
		MicroscopeIcon,
		RouteIcon
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import type { TrackType } from '$lib/types/annotation.type';
	import { checkLevelOrder, runChecks, summarizeTracks } from '$lib/utils/reports';
	import ChecksPage from './ChecksPage.svelte';
	import FluorescencePage from './FluorescencePage.svelte';
	import { levelIcons } from './levels';
	import LineagePage from './LineagePage.svelte';
	import OverviewPage from './OverviewPage.svelte';
	import TracksPage from './TracksPage.svelte';
	import type { ReportProps } from './types';

	/** The downloads' file name, without the extension. */
	let { name }: { name: string } = $props();

	type Page = { id: string; label: string; icon: Component; Component: Component<ReportProps> };
	const pages: Page[] = [
		{ id: 'overview', label: 'Overview', icon: ChartColumnIcon, Component: OverviewPage },
		{ id: 'checks', label: 'Checks', icon: ListChecksIcon, Component: ChecksPage },
		{ id: 'tracks', label: 'Tracks', icon: RouteIcon, Component: TracksPage },
		{ id: 'lineage', label: 'Lineage', icon: GitForkIcon, Component: LineagePage },
		{
			id: 'fluorescence',
			label: 'Fluorescence',
			icon: MicroscopeIcon,
			Component: FluorescencePage
		}
	];
	// Kept while the reports are closed, so a finding's next one is a key away
	let selected = $state.raw(pages[0]);

	const data = $derived(annotationState.data);
	const frameCount = $derived(projectState.frameCount);
	const tracks = $derived(summarizeTracks(data?.current ?? []));
	const checks = $derived(
		runChecks(data?.current ?? [], tracks, frameCount - 1, {
			jump: optionsState.reportJump.current,
			areaFactor: optionsState.reportAreaFactor.current
		})
	);

	// The worst level with findings, marked on the Checks page's entry
	const worst = $derived(
		checkLevelOrder.find((level) =>
			checks.some((check) => check.level === level && check.findings.length > 0)
		)
	);

	const subtitle = $derived(
		[projectState.name, projectState.versionName].filter(Boolean).join(' · ')
	);

	function show(cells: TrackType[]) {
		editorState.reportsOpen = false;
		editorState.reveal(cells);
	}

	function showFrame(frame: number) {
		editorState.reportsOpen = false;
		editorState.showFrame(frame);
	}
</script>

<Dialog.Root bind:open={editorState.reportsOpen}>
	<Dialog.Content class="overflow-hidden p-0 sm:max-w-4xl">
		<Dialog.Title class="sr-only">Reports</Dialog.Title>
		<Dialog.Description class="sr-only">
			Statistics, checks, tracks, lineage and fluorescence of the annotation.
		</Dialog.Description>
		<Sidebar.Provider
			class="h-152 max-h-[calc(100vh-2rem)] min-h-0"
			style="--sidebar-width: 12rem"
		>
			<Sidebar.Root collapsible="none" class="border-r">
				<Sidebar.Content>
					<Sidebar.Group>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each pages as page (page.id)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton
											isActive={selected === page}
											onclick={() => (selected = page)}
										>
											<page.icon />
											<span>{page.label}</span>
										</Sidebar.MenuButton>
										{#if page.id === 'checks' && worst}
											{@const { Icon, color } = levelIcons[worst]}
											<Sidebar.MenuBadge class={color}>
												<Icon class="size-4" />
											</Sidebar.MenuBadge>
										{/if}
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>
			</Sidebar.Root>

			<main class="flex min-w-0 flex-1 flex-col overflow-hidden">
				<header class="flex h-14 shrink-0 items-center gap-3 px-4 pr-12">
					<Breadcrumb.Root>
						<Breadcrumb.List>
							<Breadcrumb.Item>Reports</Breadcrumb.Item>
							<Breadcrumb.Separator />
							<Breadcrumb.Item>
								<Breadcrumb.Page>{selected.label}</Breadcrumb.Page>
							</Breadcrumb.Item>
						</Breadcrumb.List>
					</Breadcrumb.Root>
					<span class="text-muted-foreground ml-auto truncate text-sm">{subtitle}</span>
				</header>

				<ScrollArea class="min-h-0 flex-1">
					<div class="flex flex-col gap-5 px-4 pt-1 pb-4">
						{#if data}
							<selected.Component
								{data}
								{tracks}
								{checks}
								{frameCount}
								{name}
								{show}
								{showFrame}
							/>
						{/if}
					</div>
				</ScrollArea>
			</main>
		</Sidebar.Provider>
	</Dialog.Content>
</Dialog.Root>
