<script module lang="ts">
	import { InfoIcon } from '@lucide/svelte';
	import { searchRows, type SettingsGroup } from '../group';

	const rows = {
		chromium: 'Chromium browser runtime',
		webGpu: 'WebGPU GPU graphics drivers Vulkan',
		version: 'Version number build commit hash',
		worker: 'Service worker offline copy unregister',
		models: 'Cached models downloads storage clear'
	};
	const search = searchRows(rows);

	export const group: SettingsGroup = {
		id: 'about',
		label: 'About',
		icon: InfoIcon,
		search
	};
</script>

<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { version } from '$app/env';
	import { toastError } from '$lib/api/errors';
	import { Button } from '$lib/components/ui/button';
	import { cachedModels, clearModels, trackingModels } from '$lib/compute/models';
	import { gpuAdapter, modelsUrl } from '$lib/compute/run';
	import { chromiumVersion } from '$lib/utils/platform';
	import type { GroupProps } from '../group';
	import SettingsRow from '../SettingsRow.svelte';
	import SettingsSection from '../SettingsSection.svelte';
	import WebGpuHelp from '../WebGpuHelp.svelte';

	let { query }: GroupProps = $props();

	const shown = $derived(search(query));

	const adapter = gpuAdapter();
	let models = $state(cachedModels(modelsUrl()));

	async function handleClearModels() {
		await clearModels().catch((error) => toastError("Couldn't clear the models", error));
		models = cachedModels(modelsUrl());
	}

	const appWorker = () => navigator.serviceWorker?.getRegistration();
	let worker = $state(appWorker());

	async function handleUnregister(registration: ServiceWorkerRegistration) {
		try {
			await registration.unregister();
			toast('Unregistered until the next load');
		} catch (error) {
			toastError("Couldn't unregister the service worker", error);
		}
		worker = appWorker();
	}

	const gpuName = ({ vendor, architecture, description }: GPUAdapterInfo) =>
		description || [vendor, architecture].filter(Boolean).join(' ');

	const size = (bytes: number) => `${Math.round(bytes / 2 ** 20)} MB`;
	const total = (kept: { bytes: number | null }[]) =>
		kept.reduce((sum, { bytes }) => sum + (bytes ?? 0), 0);
</script>

{#snippet value(text: string)}
	<span class="text-sm">{text}</span>
{/snippet}

{#if shown.includes('chromium') || shown.includes('webGpu')}
	<SettingsSection heading="Browser">
		{#if shown.includes('chromium')}
			<SettingsRow label="Based on Chromium?">
				{@render value(chromiumVersion ? `Yes (version ${chromiumVersion})` : 'No')}
			</SettingsRow>
		{/if}
		{#if shown.includes('webGpu')}
			{#await adapter}
				<SettingsRow label="Supports WebGPU?">{@render value('Checking...')}</SettingsRow>
			{:then adapter}
				<SettingsRow
					label="Supports WebGPU?"
					description={adapter
						? 'GPU: ' + gpuName(adapter.info)
						: 'Steps run on the CPU, which is several times slower'}
				>
					{@render value(adapter ? 'Yes' : 'No')}
				</SettingsRow>
				{#if !adapter}
					<WebGpuHelp />
				{/if}
			{/await}
		{/if}
	</SettingsSection>
{/if}

{#if shown.includes('version') || shown.includes('worker')}
	<SettingsSection heading="App">
		{#if shown.includes('version')}
			<SettingsRow label="Version">{@render value(version)}</SettingsRow>
		{/if}
		{#if shown.includes('worker')}
			<SettingsRow label="Service worker">
				{#await worker then registration}
					{#if registration}
						{@render value(registration.active ? 'Active' : 'Installing')}
						<Button
							variant="outline"
							size="sm"
							onclick={() => handleUnregister(registration)}
						>
							Unregister
						</Button>
					{:else}
						{@render value('Not registered')}
					{/if}
				{/await}
			</SettingsRow>
		{/if}
	</SettingsSection>
{/if}

{#if shown.includes('models')}
	{#await models then models}
		<SettingsSection heading="Cached models">
			{#each models as { name, bytes } (name)}
				<SettingsRow
					label={name}
					description={trackingModels.find(({ file }) => file === name)?.label}
				>
					{@render value(bytes === null ? 'Outdated' : size(bytes))}
				</SettingsRow>
			{:else}
				<p class="text-muted-foreground py-2 text-xs">None yet.</p>
			{/each}
			{#if models.length}
				<SettingsRow label="Total">
					{@render value(size(total(models)))}
					<Button variant="outline" size="xs" onclick={handleClearModels}>Clear</Button>
				</SettingsRow>
			{/if}
		</SettingsSection>
	{/await}
{/if}
