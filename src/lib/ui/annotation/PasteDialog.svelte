<script lang="ts">
	import { watch } from 'runed';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState, type PendingPaste } from '$lib/states/EditorState.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { wholeNumber } from '$lib/utils/math';
	import {
		cellsLabel,
		framesLabel,
		newObjectId,
		trackAncestor,
		withMask
	} from '$lib/utils/tracks';
	import type { TrackType } from '$lib/types/annotation.type';
	import { optionsState } from '$lib/states/options.svelte';

	const uid = $props.id();

	const close = () => (editorState.pendingPaste = null);

	// Keeps the content up while the dialog fades out
	let shown = $state.raw<PendingPaste | null>(null);
	let startFrame: number | null | undefined = $state(null);
	let objectId = $state('');
	let keepTrack = $state(false);
	let trackId: number | null | undefined = $state(null);
	let keepClass = $state(false);
	let classText = $state('');

	const cells = $derived(shown?.cells ?? []);
	const single = $derived(cells.length === 1);
	const sourceFrames = $derived(
		Array.from(new Set(cells.map((cell) => cell.Frame))).sort((a, b) => a - b)
	);
	const firstFrame = $derived(sourceFrames[0] ?? 0);
	const lastFrame = $derived(sourceFrames.at(-1) ?? 0);
	const start = $derived(wholeNumber(startFrame, 0));
	// The earliest cells go to the chosen frame, the others keeping their distance
	const shift = $derived(start === null ? 0 : start - firstFrame);
	const sourceHint = $derived.by(() => {
		const hint = `Copied from ${framesLabel(sourceFrames)}`;
		if (sourceFrames.length < 2 || start === null) return hint;
		return `${hint}, landing on ${framesLabel(sourceFrames.map((frame) => frame + shift))}`;
	});

	const classToText = (value: unknown) =>
		typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);

	// Each paste starts from the cells' own values
	watch([() => editorState.pendingPaste], ([next]) => {
		if (!next) return;
		shown = next;
		const [cell] = next.cells;
		startFrame = next.frameIndex;
		keepTrack = cell.TrackID !== null;
		trackId = cell.TrackID;
		keepClass = cell.Class != null;
		classText = classToText(cell.Class);
	});

	// The suggested object ID follows the frame the earliest cells go to
	watch([() => shown, () => firstFrame + shift], ([, frame]) => {
		objectId = newObjectId(frame, annotationState.data?.current ?? []);
	});

	const problem = $derived.by(() => {
		const metadata = projectState.videoMetadata;
		if (!metadata) return 'The video size is unknown';
		const odd = cells.find(
			({ SegmentationRLE: { size } }) =>
				size[0] !== metadata.height || size[1] !== metadata.width
		);
		if (odd) {
			return `The masks are ${odd.SegmentationRLE.size.join('x')}, the video is ${metadata.height}x${metadata.width}`;
		}
		if (start === null) return 'Enter the frame to paste to';
		const frameCount = projectState.frameCount;
		if (lastFrame + shift >= frameCount) {
			return `The cells would go past the last frame, ${frameCount - 1}`;
		}
		if (single) {
			const id = objectId.trim();
			if (!id) return 'Enter an object ID';
			if (annotationState.getCell(id)) return `Object ID ${id} is taken`;
		}
		if (keepTrack) {
			// One cell per track and frame, counting the pasted ones too
			const slots = cells.flatMap((cell) => {
				const id = single ? (trackId ?? null) : cell.TrackID;
				return id === null ? [] : [{ id, frame: cell.Frame + shift }];
			});
			const clash = slots.find(
				({ id, frame }, index) =>
					slots.findIndex((slot) => slot.id === id && slot.frame === frame) !== index ||
					(annotationState.getFrame(frame) ?? []).some((cell) => cell.TrackID === id)
			);
			if (clash) return `Track ${clash.id} would have two cells in frame ${clash.frame}`;
		}
		return null;
	});

	function makeEntry(tracks: TrackType[], cell: TrackType) {
		const frame = cell.Frame + shift;
		const track = keepTrack ? (single ? (trackId ?? null) : cell.TrackID) : null;
		// Joining a track, the cell takes its ancestor, or brings its own to a track without one
		const ancestor =
			track === null ? null : (trackAncestor(tracks, track) ?? cell.AncestorID ?? null);
		if (track !== null && ancestor === track) {
			throw new Error(`Track ${track} would be its own ancestor`);
		}

		// withMask only checks that the mask traces to an outline
		return withMask(
			{
				Frame: frame,
				ObjectID: single ? objectId.trim() : newObjectId(frame, tracks),
				SegmentationRLE: cell.SegmentationRLE,
				TrackID: track,
				Interpolated: false,
				Class: keepClass ? (single ? classText || null : (cell.Class ?? null)) : null,
				AncestorID: ancestor
			},
			cell.SegmentationRLE
		);
	}

	function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (problem !== null) return;

		const where = (copies: TrackType[]) => framesLabel(copies.map((copy) => copy.Frame));
		const pasted = annotationState.addCells(
			(tracks) => {
				const next = tracks.slice();
				return cells.map((cell) => {
					const copy = makeEntry(next, cell);
					next.push(copy);
					return copy;
				});
			},
			(pasted) => `Paste ${cellsLabel(pasted)} to ${where(pasted)}`
		);
		if (!pasted) return;

		editorState.selectAll(pasted);
		if (optionsState.toolAfterPaste.current !== 'none')
			editorState.tool = optionsState.toolAfterPaste.current;

		toast(`Pasted ${cellsLabel(pasted)} to ${where(pasted)}`, {
			action: { label: 'Undo', onClick: () => annotationState.undo() }
		});
		close();
	}
</script>

<Dialog.Root open={editorState.pendingPaste !== null} onOpenChange={(open) => !open && close()}>
	<Dialog.Content>
		<form class="grid gap-4" {onsubmit}>
			<Dialog.Header>
				<Dialog.Title>Paste {single ? 'cell' : 'cells'}...</Dialog.Title>
			</Dialog.Header>

			<div class="grid gap-2">
				<Label for="{uid}-frame">
					{sourceFrames.length > 1 ? 'Starting at frame' : 'Frame'}
				</Label>
				<div class="flex gap-2">
					<Input
						id="{uid}-frame"
						type="number"
						min="0"
						step="1"
						bind:value={startFrame}
						required
						aria-invalid={start === null}
					/>
					<Button
						variant="secondary"
						disabled={start === firstFrame}
						onclick={() => (startFrame = firstFrame)}
					>
						{sourceFrames.length > 1 ? 'Source frames' : 'Source frame'}
					</Button>
				</div>
				<p class="text-muted-foreground text-sm">{sourceHint}</p>
			</div>

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
