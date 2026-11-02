<script module lang="ts">
	import { ShapesIcon } from '@lucide/svelte';
	import { searchRows, type SettingsGroup } from '../group';

	// Each row's label with its search keywords
	const rows = {
		outlines: 'Draw outlines stroke border',
		outlineColor: 'Outline color stroke',
		outlineWidth: 'Outline width stroke thickness',
		fill: 'Fill cells',
		fillColor: 'Fill color',
		labelSize: 'Label size font text',
		arrows: 'Draw ancestry arrows lineage',
		arrowColor: 'Arrow color ancestry',
		arrowWidth: 'Arrow width ancestry thickness',
		arrowsOnce: 'One arrow per ancestry in the stack first frame',
		opacity: 'Opacity transparency'
	};
	const search = searchRows(rows);

	export const group: SettingsGroup = {
		id: 'annotation',
		label: 'Annotation',
		icon: ShapesIcon,
		search
	};
</script>

<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { svgState } from '$lib/states/svg.svelte';
	import ColorPicker from '$lib/ui/common/ColorPicker.svelte';
	import type { GroupProps } from '../group';
	import SettingsRow from '../SettingsRow.svelte';
	import SettingsSection from '../SettingsSection.svelte';
	import SliderRow from '../SliderRow.svelte';

	let { query }: GroupProps = $props();

	const uid = $props.id();
	const shown = $derived(search(query));
	const any = (...keys: (keyof typeof rows)[]) => keys.some((key) => shown.includes(key));

	const px = (value: number) => `${value} px`;
	const percent = (value: number) => `${Math.round(value * 100)}%`;
</script>

{#if any('opacity')}
	<SettingsSection heading="General">
		{#if shown.includes('opacity')}
			<SliderRow
				label="Annotation opacity"
				bind:value={svgState.annotationOpacity.current}
				min={0}
				max={1}
				step={0.05}
				format={percent}
			/>
		{/if}
	</SettingsSection>
{/if}

{#if any('outlines', 'outlineColor', 'outlineWidth', 'fill', 'fillColor')}
	<SettingsSection heading="Cells">
		{#if shown.includes('outlines')}
			<SettingsRow label="Draw outlines" for="{uid}-outlines">
				<Switch id="{uid}-outlines" bind:checked={svgState.svgStrokeSwitch.current} />
			</SettingsRow>
		{/if}
		{#if shown.includes('outlineColor')}
			<SettingsRow label="Outline color" for="{uid}-outline-color">
				<ColorPicker id="{uid}-outline-color" bind:value={svgState.svgStroke.current} />
			</SettingsRow>
		{/if}
		{#if shown.includes('outlineWidth')}
			<SliderRow
				label="Outline width"
				description="In image pixels; selected cells are drawn a pixel thicker"
				bind:value={svgState.outlineWidth.current}
				min={0.5}
				max={8}
				step={0.5}
				format={px}
			/>
		{/if}
		{#if shown.includes('fill')}
			<SettingsRow label="Fill cells" for="{uid}-fill">
				<Switch id="{uid}-fill" bind:checked={svgState.svgFillSwitch.current} />
			</SettingsRow>
		{/if}
		{#if shown.includes('fillColor')}
			<SettingsRow label="Fill color" for="{uid}-fill-color">
				<ColorPicker id="{uid}-fill-color" bind:value={svgState.svgFill.current} />
			</SettingsRow>
		{/if}
	</SettingsSection>
{/if}

{#if any('labelSize')}
	<SettingsSection heading="Labels">
		{#if shown.includes('labelSize')}
			<SliderRow
				label="Label size"
				description="In image pixels"
				bind:value={svgState.labelSize.current}
				min={6}
				max={40}
				format={px}
			/>
		{/if}
	</SettingsSection>
{/if}

{#if any('arrows', 'arrowColor', 'arrowWidth', 'arrowsOnce')}
	<SettingsSection heading="Ancestry">
		{#if shown.includes('arrows')}
			<SettingsRow
				label="Draw ancestry arrows"
				description="From each ancestor to its descendants in the same frame"
				for="{uid}-arrows"
			>
				<Switch id="{uid}-arrows" bind:checked={svgState.ancestrySwitch.current} />
			</SettingsRow>
		{/if}
		{#if shown.includes('arrowColor')}
			<SettingsRow label="Arrow color" for="{uid}-arrow-color">
				<ColorPicker id="{uid}-arrow-color" bind:value={svgState.ancestryColor.current} />
			</SettingsRow>
		{/if}
		{#if shown.includes('arrowWidth')}
			<SliderRow
				label="Arrow width"
				description="In image pixels"
				bind:value={svgState.ancestryWidth.current}
				min={0.5}
				max={8}
				step={0.5}
				format={px}
			/>
		{/if}
		{#if shown.includes('arrowsOnce')}
			<SettingsRow
				label="One arrow per ancestry in the stack"
				description="Only in the first of the shown frames that has it"
				for="{uid}-arrows-once"
			>
				<Switch id="{uid}-arrows-once" bind:checked={svgState.ancestryFirstOnly.current} />
			</SettingsRow>
		{/if}
	</SettingsSection>
{/if}
