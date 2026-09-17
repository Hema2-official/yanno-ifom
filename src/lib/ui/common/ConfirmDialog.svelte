<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		onConfirm: () => void;
	};

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = 'Confirm',
		onConfirm
	}: Props = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description>{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel variant="secondary">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={onConfirm}>
				{confirmLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
