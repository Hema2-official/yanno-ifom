<script lang="ts">
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Button } from '$lib/components/ui/button';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { cn } from '$lib/utils/shadcn';
	import { DotIcon, FlagIcon, PencilIcon, PlusIcon, TrashIcon, Undo2Icon } from '@lucide/svelte';
	import { ElementSize, useEventListener, watch } from 'runed';

	let { class: className }: { class?: string } = $props();

	const ROW_HEIGHT = 28;
	const PADDING = 4;
	const OVERSCAN = 8;

	const MAX_LABEL_LENGTH = 200;

	const TIME_OF_DAY: Intl.DateTimeFormatOptions = {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	};
	const timeFormat = new Intl.DateTimeFormat('en', TIME_OF_DAY);
	const fullTimeFormat = new Intl.DateTimeFormat('en', { ...TIME_OF_DAY, second: '2-digit' });
	const shortDateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'short' });
	const mediumDateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

	// Keyed by the first word of the messages annotationState writes
	const verbIcons = new Map([
		['Add', PlusIcon],
		['Delete', TrashIcon],
		['Edit', PencilIcon],
		['Undo', Undo2Icon]
	]);

	type Entry = { icon: typeof PlusIcon; label: string; when: Date | null };

	const changes = $derived(annotationState.saved?.changes ?? []);
	// Newest first: row i is the state with the last i changes undone, so the
	// bottom row is the state before the first change
	const rowCount = $derived(annotationState.saved ? changes.length + 1 : 0);
	const currentRow = $derived(annotationState.undoneCount);

	let viewport: HTMLElement | null = $state(null);
	let scrollTop = $state(0);
	const viewportSize = new ElementSize(() => viewport);

	// Not runed's ScrollState: it polls the element on every animation frame
	useEventListener(
		() => viewport,
		'scroll',
		(event) => (scrollTop = event.currentTarget.scrollTop),
		{ passive: true }
	);

	const firstRow = $derived(
		Math.max(0, Math.floor((scrollTop - PADDING) / ROW_HEIGHT) - OVERSCAN)
	);
	const endRow = $derived(
		Math.min(
			rowCount,
			Math.ceil((scrollTop + viewportSize.height - PADDING) / ROW_HEIGHT) + OVERSCAN
		)
	);
	const rows = $derived(
		Array.from({ length: Math.max(0, endRow - firstRow) }, (_, i) => firstRow + i)
	);

	// Follow the current state wherever it moves (undo, redo, a new change)
	watch([() => viewport, () => currentRow], ([element, row]) => {
		if (!element) return;

		// The row together with the padding on both sides
		const top = row * ROW_HEIGHT;
		const bottom = top + ROW_HEIGHT + 2 * PADDING;
		if (top < element.scrollTop) element.scrollTop = top;
		else if (bottom > element.scrollTop + element.clientHeight)
			element.scrollTop = bottom - element.clientHeight;

		// Renders the rows there before the scroll event arrives
		scrollTop = element.scrollTop;
	});

	/** Shows the state of `row`, as if the changes above it had been undone one by one. */
	function jumpTo(row: number) {
		annotationState.undoneCount = row;
	}

	function entryOf(row: number): Entry {
		if (row === changes.length) return { icon: FlagIcon, label: 'Initial state', when: null };

		const { msg = 'Change', time } = changes[changes.length - 1 - row];
		const when = time ? new Date(time) : null;
		return {
			icon: verbIcons.get(msg.split(' ', 1)[0]) ?? DotIcon,
			label: msg.length > MAX_LABEL_LENGTH ? `${msg.slice(0, MAX_LABEL_LENGTH)}…` : msg,
			when: when && !Number.isNaN(when.getTime()) ? when : null
		};
	}

	// The time of day for today's changes, the date for older ones
	function shortTime(when: Date) {
		return when.toDateString() === new Date().toDateString()
			? timeFormat.format(when)
			: shortDateFormat.format(when);
	}

	function tooltipOf(entry: Entry, isUndone: boolean) {
		const lines = [entry.label];
		if (entry.when) {
			lines.push(
				`${mediumDateFormat.format(entry.when)} ${fullTimeFormat.format(entry.when)}`
			);
		}
		if (isUndone) lines.push('Undone, click to redo');
		return lines.join('\n');
	}
</script>

<ScrollArea
	bind:viewportRef={viewport}
	class={cn('h-full min-h-0 flex-1 rounded-lg border', className)}
>
	{#if rowCount === 0}
		<p class="text-muted-foreground p-4 text-center text-sm">No annotation loaded</p>
	{:else}
		<ol
			aria-label="History"
			class="relative"
			style:height="{rowCount * ROW_HEIGHT + 2 * PADDING}px"
		>
			{#each rows as row (row)}
				{@const entry = entryOf(row)}
				{@const Icon = entry.icon}
				{@const isCurrent = row === currentRow}
				{@const isUndone = row < currentRow}
				<li
					class="absolute inset-x-0 pr-3 pl-1"
					style:top="{PADDING + row * ROW_HEIGHT}px"
					style:height="{ROW_HEIGHT}px"
					aria-posinset={row + 1}
					aria-setsize={rowCount}
				>
					<Button
						variant={isCurrent ? 'secondary' : 'ghost'}
						size="sm"
						class={cn(
							'h-full w-full justify-start gap-2 font-normal focus-visible:ring-inset',
							isCurrent && 'font-medium',
							isUndone && 'text-muted-foreground'
						)}
						aria-current={isCurrent ? 'step' : undefined}
						title={tooltipOf(entry, isUndone)}
						onclick={() => jumpTo(row)}
					>
						<Icon />
						<span class="min-w-0 flex-1 truncate text-left">{entry.label}</span>
						{#if entry.when}
							<time
								class="text-xs tabular-nums opacity-70"
								datetime={entry.when.toISOString()}
							>
								{shortTime(entry.when)}
							</time>
						{/if}
					</Button>
				</li>
			{/each}
		</ol>
	{/if}
</ScrollArea>
