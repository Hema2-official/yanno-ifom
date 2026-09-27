<!-- An icon-only button that names its action in a tooltip and to screen readers -->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { mergeProps } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';

	type Props = ComponentProps<typeof Button> & {
		label: string;
		side?: 'top' | 'bottom' | 'left' | 'right';
	};

	let { label, side = 'top', size = 'icon', children, ...rest }: Props = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button {...mergeProps(props, rest)} {size} aria-label={label}>
				{@render children?.()}
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content {side}>{label}</Tooltip.Content>
</Tooltip.Root>
