<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toastError } from '$lib/api/errors';
	import { LoaderCircleIcon } from '@lucide/svelte';

	type Props = {
		open: boolean;
		/** The current name, offered for editing whenever the dialog opens. */
		name: string;
		rename: (name: string) => Promise<unknown>;
	};

	let { open = $bindable(false), name: currentName, rename }: Props = $props();

	const uid = $props.id();

	let name = $state('');
	let busy = $state(false);
	let canSubmit = $derived(!!name.trim() && name.trim() !== currentName && !busy);

	$effect(() => {
		if (open) name = currentName;
	});

	async function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;

		busy = true;
		try {
			await rename(name.trim());
			open = false;
		} catch (error) {
			toastError('Rename failed', error);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={!busy}
		onInteractOutside={(e) => busy && e.preventDefault()}
		onEscapeKeydown={(e) => busy && e.preventDefault()}
	>
		<form class="grid gap-4" {onsubmit}>
			<Dialog.Header>
				<Dialog.Title>Rename project</Dialog.Title>
			</Dialog.Header>

			<Input id="{uid}-name" bind:value={name} placeholder="Project name" />

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })} disabled={busy}>
					Cancel
				</Dialog.Close>
				<Button type="submit" disabled={!canSubmit}>
					{#if busy}
						<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					Rename
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
