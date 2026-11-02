<script lang="ts">
	import { DownloadIcon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { download } from '$lib/utils/export';

	type CsvValue = string | number | null;

	type Props = {
		/** The file's name, without the extension. */
		name: string;
		header: string[];
		rows: () => CsvValue[][];
	};

	let { name, header, rows }: Props = $props();

	function toCsv(header: string[], rows: CsvValue[][]): string {
		const field = (value: CsvValue) => {
			const text = value === null ? '' : String(value);
			return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
		};
		return [header, ...rows].map((row) => row.map(field).join(',') + '\n').join('');
	}
</script>

<Button
	variant="secondary"
	size="sm"
	onclick={() => download(toCsv(header, rows()), `${name}.csv`, 'text/csv')}
>
	<DownloadIcon data-icon="inline-start" /> CSV
</Button>
