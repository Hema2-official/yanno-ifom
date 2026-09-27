<script module lang="ts">
	import { SettingState } from '$lib/states/SettingState.svelte';
	import { AVAILABLE_COLORMAPS, type ColorMapType } from '$lib/utils/imaging';

	// Listed first in the picker
	const favoriteColormaps = new SettingState<ColorMapType[]>('favoriteColormaps', []);
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { watch } from 'runed';
	import { StarIcon } from '@lucide/svelte';

	let { value = $bindable() }: { value: string } = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement | null>(null);

	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerRef?.focus();
		});
	}

	function toggleFavorite(e: MouseEvent, colormap: ColorMapType) {
		e.stopPropagation();
		if (favoriteColormaps.current.includes(colormap)) {
			favoriteColormaps.current = favoriteColormaps.current.filter((cm) => cm !== colormap);
		} else {
			favoriteColormaps.current = [...favoriteColormaps.current, colormap];
		}
	}

	let sortedColormaps: ColorMapType[] = $state([]);
	watch([() => open], () => {
		sortedColormaps = [...new Set([...favoriteColormaps.current, ...AVAILABLE_COLORMAPS])];
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger bind:ref={triggerRef}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="sm"
				class="w-48 justify-between text-left text-sm font-normal"
				role="combobox"
				aria-expanded={open}
			>
				<span class="truncate">{value}</span>
				<ChevronsUpDownIcon data-icon="inline-end" class="opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-48 p-0">
		<Command.Root>
			<Command.Input placeholder="Search..." />
			<Command.List class="max-h-60 overflow-y-auto">
				<Command.Empty>No colormap found.</Command.Empty>
				<Command.Group>
					{#each sortedColormaps as colormap (colormap)}
						<Command.Item
							value={colormap}
							onSelect={() => {
								value = colormap;
								closeAndFocusTrigger();
							}}
							class="gap-1! p-0!"
						>
							<Button
								variant="ghost"
								size="icon-sm"
								class="hover:bg-transparent!"
								onclick={(e) => toggleFavorite(e, colormap)}
							>
								<StarIcon
									class={favoriteColormaps.current.includes(colormap)
										? 'fill-yellow-400 text-yellow-400'
										: ''}
								/>
							</Button>
							{colormap}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
