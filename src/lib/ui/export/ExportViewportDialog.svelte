<script lang="ts">
	import { watch } from 'runed';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { toastError } from '$lib/api/errors';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import { download, encodeImage, imageFormats, type ImageFormat } from '$lib/utils/export';
	import type { Background, DisplayView } from '$lib/utils/snapshots';
	import BackgroundRow from './BackgroundRow.svelte';
	import ChoiceRow from './ChoiceRow.svelte';
	import { MAX_CANVAS_SIDE, renderViewport, viewportSize } from './render';
	import { LoaderCircleIcon } from '@lucide/svelte';
	import FormatSelector from './FormatSelector.svelte';

	type Props = {
		open: boolean;
		/** The file name without the extension. */
		name: string;
	};

	let { open = $bindable(false), name }: Props = $props();

	let format = $state<ImageFormat>('png');
	let quality = $state(0.92);
	let scale = $state(1);
	let background: Background = $state({ color: '#000000', alpha: 1 });
	let busy = $state(false);

	/** The display's own background, as a color input takes it. */
	const displayBackground = () => {
		const color = getComputedStyle(document.documentElement)
			.getPropertyValue('--empty-background-color')
			.trim();
		return /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000';
	};

	// The display can't change while the dialog is up
	let view: DisplayView | null = $state.raw(null);
	watch([() => open], ([open]) => {
		if (!open) return;
		view = videoDisplayState.readView?.() ?? null;
		background = { color: displayBackground(), alpha: 1 };
	});

	const scales = ['1', '2', '3', '4'].map((value) => ({ value, label: `${value}x` }));

	const size = $derived(view ? viewportSize(view, scale) : null);
	const problem = $derived.by(() => {
		if (!view || !size) return 'The display isn’t shown';
		if (Math.max(...size) > MAX_CANVAS_SIDE) {
			return `The image would be larger than browsers draw, ${MAX_CANVAS_SIDE} px`;
		}
		return null;
	});

	async function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (busy || problem !== null || !view) return;
		const { alpha, lossy, extension, mimeType } = imageFormats[format];
		busy = true;
		try {
			const canvas = await renderViewport(view, {
				scale,
				background: { color: background.color, alpha: alpha ? background.alpha : 1 }
			});
			const blob = await encodeImage(canvas, format, lossy ? quality : 1);
			download(blob, `${name}_viewport.${extension}`, mimeType);
			open = false;
		} catch (error) {
			toastError("Couldn't export the viewport", error);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form class="grid gap-4" {onsubmit}>
			<Dialog.Header>
				<Dialog.Title>Export current viewport</Dialog.Title>
				<Dialog.Description>
					The display as it's shown, without the selection or the tools.
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-1" inert={busy}>
				<FormatSelector bind:value={format} bind:quality />
				<ChoiceRow
					label="Scale"
					options={scales}
					bind:value={() => String(scale), (value) => (scale = Number(value))}
				/>
				<BackgroundRow bind:background alpha={imageFormats[format].alpha} />
			</div>

			{#if problem}
				<p class="text-destructive text-sm">{problem}</p>
			{:else if size}
				<p class="text-muted-foreground text-sm">{size[0]} × {size[1]} px</p>
			{/if}

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
				<Button type="submit" disabled={busy || problem !== null}>
					{#if busy}<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
					{/if} Export
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
