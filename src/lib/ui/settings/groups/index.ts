import type { Component } from 'svelte';
import type { GroupProps, SettingsGroup } from '../group';
import AppearanceGroup, { group as appearance } from './AppearanceGroup.svelte';
import KeyboardGroup, { group as keyboard } from './KeyboardGroup.svelte';

/** The dialog's pages in order. */
export const groups: (SettingsGroup & { component: Component<GroupProps> })[] = [
	{ ...appearance, component: AppearanceGroup },
	{ ...keyboard, component: KeyboardGroup }
];
