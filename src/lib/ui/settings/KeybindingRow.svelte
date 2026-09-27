<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import { PlusIcon, RotateCcwIcon, TriangleAlertIcon, XIcon } from '@lucide/svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import IconButton from '$lib/ui/common/IconButton.svelte';
	import { actions, type ActionId } from '$lib/keybindings/actions';
	import {
		comboFromEvent,
		comboLabel,
		isModifierOnly,
		type KeyCombo
	} from '$lib/keybindings/keys';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { cn } from '$lib/utils/shadcn';
	import KeyComboKbd from './KeyComboKbd.svelte';
	import SettingsRow from './SettingsRow.svelte';

	let { id }: { id: ActionId } = $props();

	const action = $derived(actions[id]);
	const combos = $derived(keybindings.bindings[id]);

	/** The chord being replaced, or `combos.length` for a new one. */
	let recording: number | null = $state(null);
	/** Modifiers held on their own bind when released, so a full chord can still follow them. */
	let pending: KeyCombo | null = $state(null);

	function stop() {
		recording = null;
		pending = null;
	}

	function bind(combo: KeyCombo) {
		if (recording === null) return;
		const next = [...combos];
		next[recording] = combo;
		keybindings.setBindings(id, next);
		stop();
	}

	function remove(index: number) {
		keybindings.setBindings(
			id,
			combos.filter((_, i) => i !== index)
		);
	}

	/** A click on the button records the next chord into `slot`, until it loses focus. */
	const recordsInto =
		(slot: number): Attachment<HTMLButtonElement> =>
		(button) => {
			// Nothing else (the dialog's Escape included) sees the keys being recorded
			const claim = (e: KeyboardEvent) => {
				if (recording !== slot) return false;
				e.preventDefault();
				e.stopPropagation();
				return true;
			};
			const cleanups = [
				on(button, 'click', () => {
					button.focus(); // Safari leaves clicked buttons unfocused
					recording = slot;
					pending = null;
				}),
				on(button, 'blur', stop),
				on(button, 'keydown', (e) => {
					if (!claim(e)) return;
					const combo = comboFromEvent(e);
					if (combo === null) return;
					if (isModifierOnly(combo)) pending = combo;
					else bind(combo);
				}),
				on(button, 'keyup', (e) => {
					if (claim(e) && pending !== null) bind(pending);
				})
			];
			return () => cleanups.forEach((cleanup) => cleanup());
		};

	const chip = (active: boolean) =>
		cn(
			'hover:border-ring inline-flex items-center rounded-md border transition-colors',
			active && 'border-ring ring-ring/40 ring-2'
		);
</script>

{#snippet recorder()}
	{#if pending !== null}
		<KeyComboKbd combo={pending} />
	{:else}
		<span class="text-muted-foreground text-xs">Press keys…</span>
	{/if}
{/snippet}

<SettingsRow
	label={action.label}
	description={action.description}
	badge={action.kind === 'hold' ? 'hold' : undefined}
>
	{#each combos as combo, index (combo)}
		{@const others = keybindings.collisions(id, combo)}
		<div class={chip(recording === index)}>
			<button type="button" class="px-1.5 py-0.5 outline-none" {@attach recordsInto(index)}>
				{#if recording === index}
					{@render recorder()}
				{:else}
					<KeyComboKbd {combo} />
				{/if}
			</button>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="text-muted-foreground hover:text-foreground self-stretch border-l px-1"
							aria-label="Remove {comboLabel(combo)}"
							onclick={() => remove(index)}
						>
							<XIcon class="size-3" />
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Remove this key</Tooltip.Content>
			</Tooltip.Root>
		</div>
		{#if others.length > 0}
			<Tooltip.Root>
				<Tooltip.Trigger class="text-amber-500">
					<TriangleAlertIcon class="size-4" />
				</Tooltip.Trigger>
				<Tooltip.Content>
					{comboLabel(combo)} is also bound to {others
						.map((other) => actions[other].label)
						.join(', ')}
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	{/each}

	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class={cn(chip(recording === combos.length), 'px-1.5 py-0.5 outline-none')}
					aria-label="Add a key"
					{@attach recordsInto(combos.length)}
				>
					{#if recording === combos.length}
						{@render recorder()}
					{:else}
						<PlusIcon class="size-3" />
					{/if}
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Add a key</Tooltip.Content>
	</Tooltip.Root>

	{#if keybindings.isCustomized(id)}
		<IconButton
			variant="ghost"
			size="icon-xs"
			label="Reset to the default"
			onclick={() => keybindings.reset(id)}
		>
			<RotateCcwIcon />
		</IconButton>
	{/if}
</SettingsRow>
