<script lang="ts">
	import { watch } from 'runed';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { wholeNumber } from '$lib/utils/math';
	import {
		cellsLabel,
		formatRanges,
		framesLabel,
		newTrackId,
		occupiedFrames,
		sharedFrames
	} from '$lib/utils/tracks';

	const uid = $props.id();

	const cells = $derived(editorState.selectedCells);

	let input: number | null | undefined = $state(null);

	const trackIds = $derived(
		Array.from(new Set(cells.flatMap((cell) => cell.TrackID ?? []))).sort((a, b) => a - b)
	);
	const description = $derived.by(() => {
		const tracks =
			trackIds.length === 0
				? 'untracked'
				: `in track${trackIds.length > 1 ? 's' : ''} ${formatRanges(trackIds)}`;
		return `${cellsLabel(cells)} on ${framesLabel(cells.map((cell) => cell.Frame))}, ${tracks}`;
	});

	// Each time it opens: the cells' own track, when they all have the same one
	watch([() => editorState.trackIdDialogOpen], ([open]) => {
		if (!open) return;
		const tracked = cells.every((cell) => cell.TrackID !== null);
		input = trackIds.length === 1 && tracked ? trackIds[0] : null;
	});

	const trackId = $derived(wholeNumber(input, 1));

	// A track has one cell per frame at most
	const shared = $derived(sharedFrames(cells));
	const occupied = $derived.by(() => {
		if (trackId === null || !annotationState.data) return [];
		return occupiedFrames(annotationState.data.current, cells, trackId);
	});
	const canApply = $derived(trackId !== null && shared.length === 0 && occupied.length === 0);

	function useNewTrack() {
		input = newTrackId(annotationState.data?.current ?? []) ?? 1;
	}

	function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canApply || trackId === null) return;
		if (annotationState.setTrackId(cells, trackId)) editorState.trackIdDialogOpen = false;
	}
</script>

<Dialog.Root bind:open={editorState.trackIdDialogOpen}>
	<Dialog.Content>
		<form class="grid gap-4" {onsubmit}>
			<Dialog.Header>
				<Dialog.Title>Set track ID</Dialog.Title>
				<Dialog.Description class="first-letter:uppercase">{description}</Dialog.Description
				>
			</Dialog.Header>

			<div class="grid gap-2">
				<Label for="{uid}-track">Track ID</Label>
				<div class="flex gap-2">
					<Input
						id="{uid}-track"
						type="number"
						min="1"
						step="1"
						bind:value={input}
						required
						aria-invalid={input != null && trackId === null}
					/>
					<Button variant="secondary" onclick={useNewTrack}>New track</Button>
				</div>
			</div>

			{#if shared.length > 0}
				<p class="text-destructive text-sm">
					The selection has several cells in {framesLabel(shared)}, and a track can have
					only one per frame.
				</p>
			{:else if occupied.length > 0}
				<p class="text-destructive text-sm">
					Track {trackId} already has a cell in {framesLabel(occupied)}.
				</p>
			{/if}

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
				<Button type="submit" disabled={!canApply}>Apply</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
