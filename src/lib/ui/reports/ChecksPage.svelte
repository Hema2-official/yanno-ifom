<script lang="ts">
	import { CircleCheckIcon } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { optionsState } from '$lib/states/options.svelte';
	import type { SettingState } from '$lib/states/SettingState.svelte';
	import CsvButton from './CsvButton.svelte';
	import { levelIcons } from './levels';
	import type { ReportProps } from './types';

	let { checks, name, show }: ReportProps = $props();

	const uid = $props.id();

	const limits: { id: string; label: string; unit: string; setting: SettingState<number> }[] = [
		{ id: 'jump', label: 'Jumps over', unit: 'px', setting: optionsState.reportJump },
		{
			id: 'area',
			label: 'Size changes over',
			unit: '×',
			setting: optionsState.reportAreaFactor
		}
	];
	// An emptied field keeps the last limit
	const setLimit = (setting: SettingState<number>, value: unknown) => {
		if (typeof value === 'number' && value >= 1) setting.current = value;
	};

	/** How many findings a check lists before it's asked for all of them. */
	const LISTED = 20;
	/** By title. */
	let listedInFull: string[] = $state([]);
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
	{#each limits as { id, label, unit, setting } (id)}
		<div class="flex items-center gap-1">
			<Label for="{uid}-{id}" class="mr-1 font-normal">{label}</Label>
			<Input
				id="{uid}-{id}"
				type="number"
				min="1"
				step="any"
				class="h-7 w-18"
				bind:value={() => setting.current, (value) => setLimit(setting, value)}
			/>
			<span class="text-muted-foreground text-sm">{unit}</span>
		</div>
	{/each}
	<div class="ml-auto">
		<CsvButton
			name="{name}_checks"
			header={['check', 'level', 'finding', 'frame', 'cells']}
			rows={() =>
				checks.flatMap((check) =>
					check.findings.map(({ text, cells }) => [
						check.title,
						check.level,
						text,
						cells[0]?.Frame ?? null,
						cells.map((cell) => cell.ObjectID).join(' ')
					])
				)}
		/>
	</div>
</div>

{#each checks as check (check.title)}
	{@const count = check.findings.length}
	{@const full = listedInFull.includes(check.title)}
	<section class="flex flex-col gap-1">
		<h4 class="flex items-center gap-2 text-sm font-medium">
			{#if count === 0}
				<CircleCheckIcon class="text-muted-foreground size-4" />
			{:else}
				{@const { Icon, color } = levelIcons[check.level]}
				<Icon class="size-4 {color}" />
			{/if}
			{check.title}
			<Badge variant="outline" class="select-none">
				{count === 0 ? 'none' : count.toLocaleString()}
			</Badge>
		</h4>
		{#if check.description}<p class="text-muted-foreground text-xs">{check.description}</p>{/if}
		{#if count > 0}
			<!-- Each finding leaves the reports for its cells -->
			<ul class="pt-0.5 text-sm">
				{#each full ? check.findings : check.findings.slice(0, LISTED) as finding (finding)}
					<li>
						<Button
							variant="link"
							size="sm"
							class="text-foreground decoration-muted-foreground/50 h-auto cursor-pointer justify-start p-0 text-left font-normal whitespace-normal underline underline-offset-4"
							onclick={() => show(finding.cells)}
						>
							{finding.text}
						</Button>
					</li>
				{/each}
			</ul>
			{#if count > LISTED && !full}
				<Button
					variant="ghost"
					size="sm"
					class="self-start"
					onclick={() => listedInFull.push(check.title)}
				>
					Show all {count.toLocaleString()}
				</Button>
			{/if}
		{/if}
	</section>
{/each}
