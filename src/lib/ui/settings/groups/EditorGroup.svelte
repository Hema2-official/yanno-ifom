<script module lang="ts">
	import { SlidersHorizontalIcon } from '@lucide/svelte';
	import * as Select from '$lib/components/ui/select';
	import { searchRows, type SettingsGroup } from '../group';

	// Each row's label with its search keywords
	const rows = {
		autoResample: 'Auto-resample outlines vertices smooth',
		vertexSpacing: 'Vertex spacing resample distance',
		pointerLock: 'Pointer lock while panning cursor drag',
		zoomSpeed: 'Zoom speed wheel scroll',
		toolAfterPaste: 'Tool to switch to after pasting cells',
		prefetch: 'Frames to prefetch preload cache bandwidth',
		cacheSize: 'Frame cache size memory RAM'
	};
	const search = searchRows(rows);

	export const group: SettingsGroup = {
		id: 'editor',
		label: 'Editor',
		icon: SlidersHorizontalIcon,
		search
	};
</script>

<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { frameCache } from '$lib/states/FrameCache.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import type { GroupProps } from '../group';
	import SettingsRow from '../SettingsRow.svelte';
	import SettingsSection from '../SettingsSection.svelte';
	import SliderRow from '../SliderRow.svelte';
	import { getToolLabels, toolRegistryEntries } from '$lib/ui/editor-tools/registry';

	let { query }: GroupProps = $props();

	const uid = $props.id();
	const shown = $derived(search(query));
	const any = (...keys: (keyof typeof rows)[]) => keys.some((key) => shown.includes(key));

	const MiB = 2 ** 20;
	const size = (bytes: number) =>
		bytes >= 1024 * MiB
			? `${(bytes / (1024 * MiB)).toFixed(1)} GB`
			: `${Math.round(bytes / MiB)} MB`;
</script>

{#if any('autoResample', 'vertexSpacing')}
	<SettingsSection heading="Outline editing">
		{#if shown.includes('autoResample')}
			<SettingsRow
				label="Auto-resample outlines"
				description="Evens out a cell's vertices whenever it's drawn or edited"
				for="{uid}-resample"
			>
				<Switch id="{uid}-resample" bind:checked={optionsState.autoResample.current} />
			</SettingsRow>
		{/if}
		{#if shown.includes('vertexSpacing')}
			<SliderRow
				label="Vertex spacing"
				description="Between the vertices of a resampled outline, in image pixels"
				bind:value={optionsState.resampleSegmentLength.current}
				min={0.2}
				max={5}
				step={0.1}
				disabled={!optionsState.autoResample.current}
				format={(value) => `${value.toFixed(1)} px`}
			/>
		{/if}
	</SettingsSection>
{/if}

{#if any('pointerLock', 'zoomSpeed')}
	<SettingsSection heading="Display">
		{#if shown.includes('pointerLock')}
			<SettingsRow
				label="Pointer lock while panning"
				description="Hides the cursor, so a drag can go on past the window's edge"
				for="{uid}-pointer-lock"
			>
				<Switch
					id="{uid}-pointer-lock"
					bind:checked={optionsState.pointerLockEnabled.current}
				/>
			</SettingsRow>
		{/if}
		{#if shown.includes('zoomSpeed')}
			<SliderRow
				label="Zoom speed"
				bind:value={zoomState.scrollMultiplier.current}
				min={0.2}
				max={5}
				step={0.1}
				format={(value) => `${value.toFixed(1)}×`}
			/>
		{/if}
	</SettingsSection>
{/if}

{#if any('toolAfterPaste')}
	<SettingsSection heading="Clipboard">
		{#if shown.includes('toolAfterPaste')}
			<SettingsRow label="Tool to switch to after pasting cells" for="{uid}-theme">
				<Select.Root type="single" bind:value={optionsState.toolAfterPaste.current}>
					<Select.Trigger id="{uid}-theme" class="w-32 capitalize" size="sm">
						{optionsState.toolAfterPaste.current === 'none'
							? "Don't switch"
							: getToolLabels(optionsState.toolAfterPaste.current)[0]}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="none" label="Don't switch" />
						{#each toolRegistryEntries as [key] (key)}
							<Select.Item value={key} label={getToolLabels(key)[0]} />
						{/each}
					</Select.Content>
				</Select.Root>
			</SettingsRow>
		{/if}
	</SettingsSection>
{/if}

{#if any('prefetch', 'cacheSize')}
	<SettingsSection heading="Video">
		{#if shown.includes('prefetch')}
			<SliderRow
				label="Frames to prefetch"
				description="Number of frames before and after the current one to load"
				bind:value={frameCache.prefetchRadius.current}
				min={0}
				max={100}
				step={5}
			/>
		{/if}
		{#if shown.includes('cacheSize')}
			{@const currentUsage = size(frameCache.totalBytes)}
			<SliderRow
				label="Frame cache"
				description="Memory reserved for caching frames ({currentUsage} in use)"
				bind:value={frameCache.maxBytes.current}
				min={64 * MiB}
				max={2048 * MiB}
				step={64 * MiB}
				format={size}
			/>
		{/if}
	</SettingsSection>
{/if}
