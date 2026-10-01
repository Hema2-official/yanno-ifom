<script lang="ts">
	import { watch } from 'runed';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { Switch } from '$lib/components/ui/switch';
	import { toastError } from '$lib/api/errors';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { channelLooks } from '$lib/states/FrameSnapshots.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { labelKeys, svgState, type LabelKey } from '$lib/states/svg.svelte';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import ColorPicker from '$lib/ui/common/ColorPicker.svelte';
	import SettingsRow from '$lib/ui/settings/SettingsRow.svelte';
	import SliderRow from '$lib/ui/settings/SliderRow.svelte';
	import {
		bytesLabel,
		download,
		imageFormats,
		MAX_TIFF_BYTES,
		tiffSize
	} from '$lib/utils/export';
	import { clamp, wholeNumber } from '$lib/utils/math';
	import type { Background } from '$lib/utils/snapshots';
	import BackgroundRow from './BackgroundRow.svelte';
	import ChoiceRow from './ChoiceRow.svelte';
	import {
		exportFrames,
		frameSize,
		MAX_CANVAS_SIDE,
		shownAnnotationLook,
		type FrameRender,
		type FramesOutput
	} from './render';
	import FormatSelector from './FormatSelector.svelte';

	type Props = {
		open: boolean;
		/** The file name without the frames and the extension. */
		name: string;
	};

	let { open = $bindable(false), name }: Props = $props();

	const uid = $props.id();

	const frameCount = $derived(projectState.frameCount);

	// Svelte binds an empty number input as null or undefined
	let from: number | null | undefined = $state(0);
	let to: number | null | undefined = $state(0);
	let output = $state<FramesOutput>('tiff');
	let quality = $state(0.92);
	let scale = $state(1);
	let background: Background = $state({ color: '#000000', alpha: 1 });

	let video = $state(true);
	let normalized = $state(true);
	let colormapped = $state(true);

	let annotation = $state(true);
	let outlines = $state(true);
	let outlineColor = $state('#000000');
	let outlineWidth = $state(2);
	let fill = $state(false);
	let fillColor = $state('#ffffff');
	let labels = $state(true);
	let labelKey = $state<LabelKey>('ObjectID');
	let labelSize = $state(12);
	let arrows = $state(true);
	let arrowColor = $state('#f97316');
	let opacity = $state(1);

	const showAll = () => {
		from = 0;
		to = frameCount - 1;
	};

	const showShown = () => {
		from = annotationState.currentFrameIndex;
		to = clamp(from + videoDisplayState.concurrentFrames - 1, from, frameCount - 1);
	};

	// Each export starts from the whole video, looking as the display does
	watch([() => open], ([open]) => {
		if (!open) return;
		showAll();
		video = videoDisplayState.channels.some((channel) => channel.visible);
		normalized = svgState.normalizeSwitch.current;
		colormapped = svgState.colormapSwitch.current;

		const look = shownAnnotationLook();
		annotation = svgState.isAnnotationShown;
		outlines = look.stroke !== null;
		outlineColor = svgState.svgStroke.current;
		outlineWidth = look.width;
		fill = look.fill !== null;
		fillColor = svgState.svgFill.current;
		labels = look.labelKey !== null;
		labelKey = svgState.labelKey.current;
		labelSize = look.labelSize;
		arrows = look.arrows !== null;
		arrowColor = svgState.ancestryColor.current;
		opacity = look.opacity;
	});

	const scales = ['0.5', '1', '2', '3', '4'].map((value) => ({ value, label: `${value}x` }));

	const isImage = $derived(output !== 'tiff');
	const keepsAlpha = $derived(output !== 'tiff' && imageFormats[output].alpha);

	const first = $derived(wholeNumber(from, 0));
	const last = $derived(wholeNumber(to, 0));
	const frames = $derived(
		first !== null && last !== null && first <= last && last < frameCount
			? Array.from({ length: last - first + 1 }, (_, i) => first + i)
			: null
	);
	const size = $derived(frameSize(scale));
	const stackBytes = $derived(frames ? tiffSize(...size, frames.length) : 0);

	const summary = $derived.by(() => {
		if (!frames) return '';
		const count = frames.length === 1 ? '1 frame' : `${frames.length} frames`;
		const parts = [`${size[0]} × ${size[1]} px`, count];
		if (!isImage) parts.push(bytesLabel(stackBytes));
		else if (frames.length > 1) parts.push('in a ZIP');
		return parts.join(', ');
	});

	const problem = $derived.by(() => {
		if (!frames) return `Enter frames from 0 to ${frameCount - 1}`;
		if (!video && !annotation) return 'Turn on the video or the annotation';
		if (Math.max(...size) > MAX_CANVAS_SIDE) {
			return `The frames would be larger than browsers draw, ${MAX_CANVAS_SIDE} px`;
		}
		if (!isImage && stackBytes > MAX_TIFF_BYTES) {
			return 'The stack would pass TIFF’s 4 GB: export fewer frames, or a ZIP';
		}
		return null;
	});

	let framesDone: number | null = $state(null);
	let controller: AbortController | null = null;
	const busy = $derived(framesDone !== null);

	async function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (busy || problem !== null || !frames) return;

		const arrowLook = { color: arrowColor, width: svgState.ancestryWidth.current, only: null };
		const annotationLook = {
			stroke: outlines ? outlineColor : null,
			width: outlineWidth,
			fill: fill ? fillColor : null,
			labelKey: labels ? labelKey : null,
			labelSize,
			arrows: arrows ? arrowLook : null,
			opacity
		};

		const render: FrameRender = {
			scale,
			background: { color: background.color, alpha: keepsAlpha ? background.alpha : 1 },
			looks: video
				? channelLooks(videoDisplayState.filtersFor({ normalized, colormapped }))
				: null,
			annotation: annotation ? annotationLook : null
		};
		const range = frames.length === 1 ? `frame${frames[0]}` : `frames${first}-${last}`;

		const exporting = new AbortController();
		controller = exporting;
		framesDone = 0;
		try {
			const { blob, extension } = await exportFrames(frames, output, quality, render, {
				signal: exporting.signal,
				onProgress: (done) => (framesDone = done)
			});
			download(blob, `${name}_${range}.${extension}`, blob.type);
			open = false;
		} catch (error) {
			if (!exporting.signal.aborted) toastError("Couldn't export the frames", error);
		} finally {
			controller = null;
			framesDone = null;
		}
	}

	const readableLabelKey = (key: LabelKey) => key.replace(/([a-z])([A-Z])/g, '$1 $2');
	const percent = (value: number) => `${Math.round(value * 100)}%`;
	const px = (value: number) => `${value} px`;
</script>

<Dialog.Root bind:open>
	<!-- No dismissing while exporting; Stop ends it -->
	<Dialog.Content
		class="sm:max-w-lg"
		showCloseButton={!busy}
		onInteractOutside={(e) => busy && e.preventDefault()}
		onEscapeKeydown={(e) => busy && e.preventDefault()}
	>
		<form class="grid gap-4" {onsubmit}>
			<Dialog.Header>
				<Dialog.Title>Export frames</Dialog.Title>
				<Dialog.Description>
					The frames with their cells, without the selection.
				</Dialog.Description>
			</Dialog.Header>

			<div
				class="grid max-h-[60vh] gap-1 overflow-x-hidden overflow-y-auto pr-1"
				inert={busy}
			>
				<div class="flex items-center gap-2 pb-2">
					<Label for="{uid}-from" class="font-normal">Frames</Label>
					<Input
						id="{uid}-from"
						type="number"
						min="0"
						max={frameCount - 1}
						step="1"
						class="w-20"
						bind:value={from}
						aria-invalid={first === null}
					/>
					<span class="text-muted-foreground">to</span>
					<Input
						type="number"
						min="0"
						max={frameCount - 1}
						step="1"
						class="w-20"
						bind:value={to}
						aria-label="Last frame"
						aria-invalid={last === null}
					/>
					<div class="flex-1"></div>
					<Button variant="secondary" size="sm" onclick={showShown}>Shown</Button>
					<Button variant="secondary" size="sm" onclick={showAll}>All</Button>
				</div>

				<FormatSelector bind:value={output} bind:quality hasTiff={true} />

				<ChoiceRow
					label="Scale"
					options={scales}
					bind:value={() => String(scale), (value) => (scale = Number(value))}
				/>
				<BackgroundRow bind:background alpha={keepsAlpha} />

				<SettingsRow label="Source video" for="{uid}-video">
					<Switch id="{uid}-video" bind:checked={video} />
				</SettingsRow>
				{#if video}
					<div class="pl-6">
						<SettingsRow label="Normalize" for="{uid}-normalize">
							<Switch id="{uid}-normalize" bind:checked={normalized} />
						</SettingsRow>
						<SettingsRow label="Colormap" for="{uid}-colormap">
							<Switch id="{uid}-colormap" bind:checked={colormapped} />
						</SettingsRow>
					</div>
				{/if}

				<SettingsRow label="Annotation" for="{uid}-annotation">
					<Switch id="{uid}-annotation" bind:checked={annotation} />
				</SettingsRow>
				{#if annotation}
					<div class="pl-6">
						<SettingsRow label="Outlines" for="{uid}-outlines">
							<ColorPicker bind:value={outlineColor} disabled={!outlines} />
							<Switch id="{uid}-outlines" bind:checked={outlines} />
						</SettingsRow>
						{#if outlines}
							<SliderRow
								label="Outline width"
								bind:value={outlineWidth}
								min={0.5}
								max={8}
								step={0.5}
								format={px}
							/>
						{/if}
						<SettingsRow label="Fill" for="{uid}-fill">
							<ColorPicker bind:value={fillColor} disabled={!fill} />
							<Switch id="{uid}-fill" bind:checked={fill} />
						</SettingsRow>
						<SettingsRow label="Labels" for="{uid}-labels">
							<Select.Root type="single" bind:value={labelKey} disabled={!labels}>
								<Select.Trigger class="w-32 font-normal" size="sm">
									{readableLabelKey(labelKey)}
								</Select.Trigger>
								<Select.Content>
									{#each labelKeys as value (value)}
										<Select.Item {value} label={readableLabelKey(value)} />
									{/each}
								</Select.Content>
							</Select.Root>
							<Switch id="{uid}-labels" bind:checked={labels} />
						</SettingsRow>
						{#if labels}
							<SliderRow
								label="Label size"
								bind:value={labelSize}
								min={6}
								max={40}
								format={px}
							/>
						{/if}
						<SettingsRow label="Ancestry arrows" for="{uid}-arrows">
							<ColorPicker bind:value={arrowColor} disabled={!arrows} />
							<Switch id="{uid}-arrows" bind:checked={arrows} />
						</SettingsRow>
						<SliderRow
							label="Opacity"
							bind:value={opacity}
							min={0}
							max={1}
							step={0.05}
							format={percent}
						/>
					</div>
				{/if}
			</div>

			{#if problem}
				<p class="text-destructive text-sm">{problem}</p>
			{:else}
				<p class="text-muted-foreground text-sm">{summary}</p>
			{/if}

			<Dialog.Footer>
				{#if framesDone !== null && frames}
					<div class="mr-auto flex min-w-0 flex-1 items-center">
						<Progress value={framesDone} max={frames.length} class="max-w-48" />
					</div>
				{/if}
				{#if busy}
					<Button variant="secondary" onclick={() => controller?.abort()}>Stop</Button>
				{:else}
					<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>
						Cancel
					</Dialog.Close>
				{/if}
				<Button type="submit" disabled={busy || problem !== null}>
					{busy && frames ? `Exporting ${framesDone}/${frames.length}` : 'Export'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
