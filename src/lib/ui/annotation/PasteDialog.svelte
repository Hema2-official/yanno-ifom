<script lang="ts">
	import { watch } from 'runed';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState, type PendingPaste } from '$lib/states/EditorState.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { cellsLabel, newObjectId, withMask } from '$lib/utils/tracks';
	import type { TrackType } from '$lib/types/annotation.type';
	import { optionsState } from '$lib/states/options.svelte';

	const uid = $props.id();

	const close = () => (editorState.pendingPaste = null);

	// Keeps the content up while the dialog fades out
	let shown = $state.raw<PendingPaste | null>(null);
	let target: 'here' | 'source' = $state('here');
	let objectId = $state('');
	let keepTrack = $state(false);
	// Svelte binds an empty number input as null or undefined
	let trackId: number | null | undefined = $state(null);
	let keepClass = $state(false);
	let classText = $state('');

	const cells = $derived(shown?.cells ?? []);
	const single = $derived(cells.length === 1);
	const sourceFrame = $derived(cells[0]?.Frame ?? 0);
	const targetFrame = $derived.by(() =>
		target === 'source' ? sourceFrame : (shown?.frameIndex ?? 0)
	);

	const classToText = (value: unknown) =>
		typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);

	// Each paste starts from the cells' own values
	watch([() => editorState.pendingPaste], ([next]) => {
		if (!next) return;
		shown = next;
		const [cell] = next.cells;
		target = 'here';
		keepTrack = cell.TrackID !== null;
		trackId = cell.TrackID;
		keepClass = cell.Class != null;
		classText = classToText(cell.Class);
	});

	// The suggested object ID follows the target frame
	watch([() => shown, () => targetFrame], ([, frame]) => {
		objectId = newObjectId(frame, annotationState.data?.current ?? []);
	});

	const problem = $derived.by(() => {
		if (cells.some((cell) => cell.Frame !== sourceFrame)) {
			return 'The cells come from several frames';
		}
		const metadata = projectState.videoMetadata;
		if (!metadata) return 'The video size is unknown';
		const odd = cells.find(
			({ SegmentationRLE: { size } }) =>
				size[0] !== metadata.height || size[1] !== metadata.width
		);
		if (odd) {
			return `The masks are ${odd.SegmentationRLE.size.join('x')}, the video is ${metadata.height}x${metadata.width}`;
		}
		if (single) {
			const id = objectId.trim();
			if (!id) return 'Enter an object ID';
			if (annotationState.getCell(id)) return `Object ID ${id} is taken`;
		}
		if (keepTrack) {
			const ids = single ? [trackId ?? null] : cells.map((cell) => cell.TrackID);
			const inFrame = annotationState.getFrame(targetFrame) ?? [];
			const crowded = ids.find(
				(id) => id !== null && inFrame.some((cell) => cell.TrackID === id)
			);
			if (crowded != null)
				return `Track ${crowded} already has a cell in frame ${targetFrame}`;
		}
		return null;
	});

	function makeEntry(tracks: TrackType[], cell: TrackType) {
		const tId = keepTrack ? (single ? (trackId ?? null) : cell.TrackID) : null;
		let aId: number | null = null; // Only a cell joining a track shares its ancestor
		if (tId != null) aId = tracks.find((other) => other.TrackID === tId)?.AncestorID ?? null;

		// withMask only checks that the mask traces to an outline
		return withMask(
			{
				Frame: targetFrame,
				ObjectID: single ? objectId.trim() : newObjectId(targetFrame, tracks),
				SegmentationRLE: cell.SegmentationRLE,
				TrackID: tId,
				Interpolated: false,
				Class: keepClass ? (single ? classText || null : (cell.Class ?? null)) : null,
				AncestorID: aId
			},
			cell.SegmentationRLE
		);
	}

	function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (problem !== null) return;

		const frame = targetFrame;
		const pasted = annotationState.addCells(
			(tracks) => {
				const next = tracks.slice();
				return cells.map((cell) => {
					const copy = makeEntry(next, cell);
					next.push(copy);
					return copy;
				});
			},
			(pasted) => `Paste ${cellsLabel(pasted)} to frame ${frame}`
		);
		if (!pasted) return;

		editorState.selectAll(pasted);
		if (optionsState.toolAfterPaste.current !== 'none')
			editorState.tool = optionsState.toolAfterPaste.current;

		toast(`Pasted ${cellsLabel(pasted)} to frame ${frame}`, {
			action: { label: 'Undo', onClick: () => annotationState.undo() }
		});
		close();
	}
</script>

<Dialog.Root open={editorState.pendingPaste !== null} onOpenChange={(open) => !open && close()}>
	<Dialog.Content>
		<form class="grid gap-4" {onsubmit}>
			<!-- TODO: if current frame if source frame, just say 'Paste cell(s) here' -->
			<Dialog.Header>
				<Dialog.Title>Paste {single ? 'cell' : 'cells'}...</Dialog.Title>
			</Dialog.Header>

			<RadioGroup.Root bind:value={target} class="w-full">
				<div class="flex items-center space-x-2">
					<RadioGroup.Item value="here" id="r2" />
					<Label for="r2">here</Label>
				</div>
				<div class="flex items-center space-x-2">
					<RadioGroup.Item
						value="source"
						id="r1"
						disabled={sourceFrame >= projectState.frameCount}
					/>
					<Label for="r1">on frame {sourceFrame}</Label>
				</div>
			</RadioGroup.Root>

			<!-- Several cells keep each their own track ID and class -->
			<div class="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-4">
				{#if single}
					<span></span>
					<Label for="{uid}-object">Object ID</Label>
					<Input id="{uid}-object" bind:value={objectId} required />
				{/if}

				<Checkbox id="{uid}-track" bind:checked={keepTrack} />
				<Label for="{uid}-track" class={single ? undefined : 'col-span-2'}>
					{single ? 'Track ID' : 'Keep track IDs'}
				</Label>
				{#if single}
					<Input
						type="number"
						min="1"
						step="1"
						bind:value={trackId}
						disabled={!keepTrack}
						required={keepTrack}
						aria-label="Track ID"
					/>
				{/if}

				<Checkbox id="{uid}-class" bind:checked={keepClass} />
				<Label for="{uid}-class" class={single ? undefined : 'col-span-2'}>
					{single ? 'Class' : 'Keep classes'}
				</Label>
				{#if single}
					<Input bind:value={classText} disabled={!keepClass} aria-label="Class" />
				{/if}
			</div>

			{#if problem}
				<p class="text-destructive text-sm">{problem}</p>
			{/if}

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
				<Button type="submit" disabled={problem !== null}>Paste</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
