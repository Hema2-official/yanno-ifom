import type { Component } from 'svelte';
import type { GroupProps, SettingsGroup } from '../group';
import AboutGroup, { group as about } from './AboutGroup.svelte';
import AnnotationGroup, { group as annotation } from './AnnotationGroup.svelte';
import AppearanceGroup, { group as appearance } from './AppearanceGroup.svelte';
import EditorGroup, { group as editor } from './EditorGroup.svelte';
import KeyboardGroup, { group as keyboard } from './KeyboardGroup.svelte';

/** The dialog's pages in order. */
export const groups: (SettingsGroup & { component: Component<GroupProps> })[] = [
	{ ...appearance, component: AppearanceGroup },
	{ ...annotation, component: AnnotationGroup },
	{ ...editor, component: EditorGroup },
	{ ...keyboard, component: KeyboardGroup },
	{ ...about, component: AboutGroup }
];
