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

<div class="flex w-full min-w-0 flex-col gap-3">
	<Label>{label}</Label>

	<label
		class="bg-muted/20 hover:bg-muted/30 border-muted-foreground/50 relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-2 transition-all duration-300 {file
			? 'h-auto'
			: ''}"
	>
		{#if file}
			<p class="text-muted-foreground max-w-full px-4 text-sm font-medium wrap-break-word">
				{file.name}
			</p>
		{:else}
			<div class="text-muted-foreground flex flex-col items-center justify-center gap-1">
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
			class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
		/>
	</label>
</div>
