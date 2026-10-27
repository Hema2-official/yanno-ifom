<script module lang="ts">
	import { watch } from 'runed';
	import { SvelteMap } from 'svelte/reactivity';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import type { FluorescenceMeasure, Measurement } from '$lib/utils/fluorescence';

	// Kept while the reports are closed, since a measurement reads every frame of a channel
	const options = $state({
		source: '',
		removeBackground: false,
		together: false,
		measure: 'mean' as FluorescenceMeasure,
		/** Each cell's line, or the cells' median in each frame. */
		view: 'cells' as 'cells' | 'median'
	});
	/** The project's measurements by channel (a source's `value`). */
	const measurements = new SvelteMap<string, Measurement>();
	let progress = $state.raw<{ done: number; abort: AbortController } | null>(null);

	// A load stops the measurement, and another project drops the results, which are of its frames
	$effect.root(() => {
		let project: string | null = null;
		watch([() => projectState.key], ([key]) => {
			progress?.abort.abort();
			if (key !== null && key !== project) {
				project = key;
				measurements.clear();
			}
		});
	});
</script>

<script lang="ts">
	import { toastError } from '$lib/api/errors';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import * as Table from '$lib/components/ui/table';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import { VideoColor } from '$lib/types/api.type';
	import LineChart, { type ChartLine } from '$lib/ui/common/LineChart.svelte';
	import {
		appliesTo,
		cellsCsv,
		coupleFrames,
		couplesOf,
		fluorescenceMeasures,
		fluorescenceObjects,
		fluorescenceRows,
		measureFluorescence,
		medianCsv,
		quartilesByFrame,
		timeAt,
		type FluorescenceObject
	} from '$lib/utils/fluorescence';
	import CsvButton from './CsvButton.svelte';
	import FrameTimeFields from './FrameTimeFields.svelte';
	import SortHeader, { sortedColumn } from './SortHeader.svelte';
	import type { ReportProps } from './types';

	let { data, tracks, frameCount, name, show, showFrame }: ReportProps = $props();

	const uid = $props.id();

	// Each channel, or each color of an RGB one: `value` is the channel and the color's offset in a pixel
	const sources = $derived.by(() => {
		const config = projectState.videoConfig;
		const colors = config?.color === VideoColor.RGB ? ['red', 'green', 'blue'] : [null];
		return Array.from({ length: config?.channel_period ?? 1 }, (_, channel) => {
			const primary = channel === config?.start_period;
			const label = videoDisplayState.channels[channel]?.label.trim() ?? '';
			const named = label || `Channel ${channel}`;
			return colors.map((color, offset) => ({
				value: `${channel}:${offset}`,
				channel,
				// What the chart and the CSV call it
				name: color ? `${named}, ${color}` : named,
				label: `Channel ${channel}${primary ? ' (primary)' : ''}${label ? ` · ${label}` : ''}${color ? `, ${color}` : ''}`,
				file: `${label || `channel${channel}`}${color ? `_${color}` : ''}`,
				primary
			}));
		}).flat();
	});
	// The first extra channel's, until one is picked
	const source = $derived(
		sources.find(({ value }) => value === options.source) ??
			sources.find(({ primary }) => !primary) ??
			sources[0]
	);
	const look = $derived(videoDisplayState.channels[source.channel]);

	const time = $derived(videoDisplayState.frameTime);
	const timeOf = (frame: number) => timeAt(time, frame);

	const couples = $derived(couplesOf(tracks));
	const coupled = $derived(coupleFrames(data.current, couples));
	// The channel's measurement, while it's of the cells as they are
	const measurement = $derived.by(() => {
		const measured = measurements.get(source.value);
		const needed = options.together ? coupled : [];
		return measured && appliesTo(measured, data.current, needed) ? measured : null;
	});
	const rows = $derived(
		measurement ? fluorescenceRows(measurement, data.current, coupled, options) : []
	);
	const objects = $derived(fluorescenceObjects(rows, options.measure));
	const quartiles = $derived(quartilesByFrame(rows, options.measure, frameCount));

	async function measure() {
		progress?.abort.abort();
		const picked = source.value;
		const [channel, offset] = picked.split(':').map(Number);
		const abort = new AbortController();
		progress = { done: 0, abort };
		try {
			const video = await projectState.openVideo();
			const result = await measureFluorescence(
				data.current,
				coupled,
				frameCount,
				async (frame) => {
					const imageIndex = projectState.imageIndex(frame, channel);
					if (imageIndex === null) return null;
					const image = await video.getImage(imageIndex);
					// The picked color alone, at the video's own depth
					const [values] = await image.readRasters({
						samples: [offset],
						signal: abort.signal
					});
					return { data: values, width: image.getWidth(), height: image.getHeight() };
				},
				{
					signal: abort.signal,
					onFrame: (done) => {
						if (progress?.abort === abort) progress = { done, abort };
					}
				}
			);
			measurements.set(picked, result);
		} catch (error) {
			if (!abort.signal.aborted) toastError("Couldn't measure the fluorescence", error);
		} finally {
			if (progress?.abort === abort) progress = null;
		}
	}

	const measureLabel = $derived(fluorescenceMeasures[options.measure]);
	const x = $derived(Array.from({ length: frameCount }, (_, frame) => timeOf(frame)));
	const lines: ChartLine[] = $derived(
		options.view === 'median'
			? [{ id: 'median', values: quartiles.map((frame) => frame?.median ?? null) }]
			: Array.from(objects.values(), ({ key, rows }) => {
					const values = Array<number | null>(frameCount).fill(null);
					for (const row of rows) values[row.frame] = row[options.measure];
					return { id: key, values };
				})
	);
	const band = $derived(
		options.view === 'median'
			? quartiles.map((frame) => frame && { low: frame.lower, high: frame.upper })
			: undefined
	);

	// A line leaves for its cells in that frame, the median for the frame
	function pick(line: ChartLine, frame: number) {
		if (options.view === 'median') {
			showFrame(frame);
		} else {
			const row = objects.get(line.id)?.rows.find((row) => row.frame === frame);
			if (row) show(row.cells);
		}
	}

	const pickMeasure = (next: string) => {
		if (next in fluorescenceMeasures) options.measure = next as FluorescenceMeasure;
	};
	const pickView = (next: string | undefined) => {
		// Pressing the active item would deselect it
		if (next === 'cells' || next === 'median') options.view = next;
	};

	const format = (value: number, decimals = 1) =>
		value.toLocaleString(undefined, { maximumFractionDigits: decimals });
	const timeLabel = (frame: number) =>
		time ? `${format(timeOf(frame), 2)} ${time.unit}` : `frame ${frame}`;
	const objectName = (object: FluorescenceObject) => {
		if (object.track === null) return `Cell ${object.rows[0].cells[0].ObjectID}`;
		if (object.daughter === null) return `Track ${object.track}`;
		return `Tracks ${object.track} and ${object.daughter}`;
	};

	function readout(line: ChartLine, frame: number) {
		const spread = quartiles[frame];
		if (options.view === 'median' && spread) {
			const middle = `${format(spread.lower)}–${format(spread.upper)}`;
			return {
				value: format(spread.median),
				detail: `middle half ${middle} · ${spread.objects} cells · ${timeLabel(frame)}`
			};
		}
		const object = objects.get(line.id);
		return {
			value: format(line.values[frame] ?? NaN),
			detail: `${object ? objectName(object) : line.id} · ${timeLabel(frame)}`
		};
	}

	type Column = {
		id: string;
		label: string;
		value: (object: FluorescenceObject) => number | null;
		decimals?: number;
	};
	const columns: Column[] = $derived([
		{ id: 'track', label: 'Track', value: (object) => object.track },
		...(options.together
			? [
					{
						id: 'daughter',
						label: 'Daughter',
						value: (object: FluorescenceObject) => object.daughter
					}
				]
			: []),
		{ id: 'frames', label: 'Frames', value: (object) => object.rows.length },
		{ id: 'average', label: 'Average', value: (object) => object.average, decimals: 1 },
		{
			id: 'peak',
			label: 'Peak',
			value: (object) => object.peak[options.measure],
			decimals: 1
		},
		{
			id: 'peakAt',
			label: time ? `Peak at (${time.unit})` : 'Peak frame',
			value: (object) => timeOf(object.peak.frame),
			decimals: 2
		}
	]);

	// The brightest first
	let sort = $state({ id: 'average', descending: true });
	const sorted = $derived.by(() => {
		const { value } = sortedColumn(columns, sort);
		const sign = sort.descending ? -1 : 1;
		return Array.from(objects.values()).sort(
			(a, b) => sign * ((value(a) ?? -1) - (value(b) ?? -1))
		);
	});

	// The CSV follows the view
	const csv = $derived.by(() => {
		const context = {
			movie: projectState.name ?? '',
			channel: source.name,
			time,
			removeBackground: options.removeBackground
		};
		return options.view === 'median'
			? {
					name: `${name}_${source.file}_${options.measure}_median`,
					...medianCsv(quartiles, options.measure, context)
				}
			: { name: `${name}_${source.file}_fluorescence`, ...cellsCsv(rows, context) };
	});
</script>

<p class="text-muted-foreground text-sm">
	A channel's values under the cells, frame by frame, as the microscope recorded them in the
	video: from 0 to 65535 for a 16-bit one. Total is the sum under a cell. Remove background
	subtracts each frame's mean outside the cells, from every pixel. Mother and daughter together
	measures a daughter with her mother, joined across the neck, from the daughter's first frame
	until either ends or buds again.
</p>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
	<Select.Root type="single" bind:value={() => source.value, (value) => (options.source = value)}>
		<Select.Trigger class="w-52" size="sm" aria-label="Channel">{source.label}</Select.Trigger>
		<Select.Content>
			{#each sources as { value, label } (value)}
				<Select.Item {value} {label} />
			{/each}
		</Select.Content>
	</Select.Root>
	<Input
		class="h-7 w-44"
		placeholder="Name, such as its protein"
		aria-label="The channel's name"
		bind:value={look.label}
	/>
	<Button
		size="sm"
		class="ml-auto"
		disabled={!!progress || data.current.length === 0}
		onclick={measure}
	>
		Measure
	</Button>
</div>

{#if progress}
	<div class="flex items-center gap-3">
		<span class="text-muted-foreground shrink-0 text-sm tabular-nums">
			{progress.done} of {frameCount} frames measured
		</span>
		<Progress value={progress.done} max={frameCount} class="flex-1" />
		<Button variant="ghost" size="sm" onclick={() => progress?.abort.abort()}>Cancel</Button>
	</div>
{/if}

<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
	<Label for="{uid}-background" class="cursor-pointer">
		<Switch id="{uid}-background" bind:checked={options.removeBackground} />
		Remove background
	</Label>
	<Label for="{uid}-together" class="cursor-pointer">
		<Switch id="{uid}-together" bind:checked={options.together} />
		Mother and daughter together
	</Label>
	<FrameTimeFields />
</div>

{#if data.current.length === 0}
	<p class="text-muted-foreground text-sm">There are no cells to measure.</p>
{:else if measurement}
	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<Select.Root type="single" bind:value={() => options.measure, pickMeasure}>
				<Select.Trigger class="w-44" size="sm" aria-label="What to chart">
					{measureLabel}
				</Select.Trigger>
				<Select.Content>
					{#each Object.entries(fluorescenceMeasures) as [value, label] (value)}
						<Select.Item {value} {label} />
					{/each}
				</Select.Content>
			</Select.Root>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				aria-label="Each cell or their median"
				bind:value={() => options.view, pickView}
			>
				<ToggleGroup.Item value="cells">Each cell</ToggleGroup.Item>
				<ToggleGroup.Item value="median">Median</ToggleGroup.Item>
			</ToggleGroup.Root>
			<div class="ml-auto">
				<CsvButton {...csv} />
			</div>
		</div>

		<LineChart
			title={options.view === 'median'
				? `${measureLabel} of ${source.name}: the cells' median, their middle half shaded`
				: `${measureLabel} of ${source.name}, a line for each cell`}
			{x}
			xLabel={time ? `Time (${time.unit})` : 'Frame'}
			{lines}
			{band}
			{readout}
			onPick={pick}
		/>
	</div>

	<Table.Root>
		<SortHeader {columns} bind:sort />
		<Table.Body>
			<!-- A row leaves for its peak frame -->
			{#each sorted as object (object.key)}
				<Table.Row class="cursor-pointer" onclick={() => show(object.peak.cells)}>
					{#each columns as column (column.id)}
						<Table.Cell class="text-right tabular-nums">
							{column.value(object)?.toLocaleString(undefined, {
								maximumFractionDigits: column.decimals ?? 0
							}) ?? '—'}
						</Table.Cell>
					{/each}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{:else if measurements.has(source.value)}
	<p class="text-muted-foreground text-sm">
		The annotation has changed since the measurement. Measure again to update it.
	</p>
{/if}
