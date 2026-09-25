<script lang="ts">
	import { CloudIcon, LoaderCircleIcon, UserPenIcon } from '@lucide/svelte';
	import { time as formatTime } from 'svelte-i18n';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import { editSession } from '$lib/states/EditSessionState.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';

	// Why the editor is read-only; shown in the editor's status tooltip
	const lock = $derived(editSession.lock);

	const clock = (epochMs: number) =>
		$formatTime(new Date(epochMs), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
</script>

{#if projectState.cloudProject?.role === 'viewer'}
	<Tooltip.Trigger class="inline-flex items-center gap-1"><CloudIcon /> View only</Tooltip.Trigger
	>
	<Tooltip.Content>
		{projectState.cloudProject?.owner.name} shared this project with you as a viewer
	</Tooltip.Content>
{:else if lock?.holder && !lock.editing}
	<Tooltip.Trigger class="inline-flex items-center gap-1">
		<UserPenIcon />
		{lock.holder.you ? 'Open in another tab of yours' : `${lock.holder.name} is editing`}
	</Tooltip.Trigger>
	<Tooltip.Content>
		Editing since {clock(lock.holder.since)}{lock.holder.last_save
			? `, last saved at ${clock(lock.holder.last_save)}`
			: ''}
	</Tooltip.Content>
	{#if lock.steal?.mine}
		<LoaderCircleIcon class="animate-spin" /> Taking over...
	{:else}
		<Button variant="secondary" size="sm" class="h-6" onclick={() => editSession.takeOver()}>
			Take over
		</Button>
	{/if}
{:else}
	<LoaderCircleIcon class="animate-spin" />
	{#if lock?.steal}
		Handing over to {lock.steal.name}...
	{:else if lock?.editing}
		Loading the latest data...
	{:else}
		Connecting...
	{/if}
{/if}
