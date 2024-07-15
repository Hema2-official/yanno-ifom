import type { EventHandler } from 'svelte/elements';

type SubmenuItemType = {
	label: string;
	onClick: EventHandler<MouseEvent>;
};

export type { SubmenuItemType };
