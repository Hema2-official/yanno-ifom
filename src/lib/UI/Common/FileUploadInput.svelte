<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { HardDriveUploadIcon } from '@lucide/svelte';

	type Props = {
		label: string;
		accept?: string;
		file?: File | null;
	};

	let { label, accept = '*', file = $bindable() }: Props = $props();

	function onchange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
	}
</script>

<div class="flex flex-col gap-3 w-full min-w-0">
	<Label>{label}</Label>

	<label
		class="relative flex flex-col items-center justify-center h-28 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-300 bg-muted/20 hover:bg-muted/30 border-muted-foreground/50 {file
			? 'h-auto'
			: ''}"
	>
		{#if file}
			<p class="text-sm font-medium text-muted-foreground wrap-break-word max-w-full px-4">
				{file.name}
			</p>
		{:else}
			<div class="gap-1 flex flex-col items-center justify-center text-muted-foreground">
				<HardDriveUploadIcon class="size-6" />

				<p class="text-sm font-semibold">
					Click to select <span class="font-normal">or drop a file</span>
				</p>

				{#if accept !== '*'}
					<p class="text-xs">{accept.replace(',', ' ')}</p>
				{/if}
			</div>
		{/if}
		<input
			type="file"
			{accept}
			{onchange}
			class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
		/>
	</label>
</div>
