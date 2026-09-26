import type { Component } from 'svelte';

/**
 * A page of the settings dialog, declared by its component's module script.
 * `search` names the rows a query matches; the component shows the same rows.
 */
export type SettingsGroup = {
	id: string;
	label: string;
	icon: Component;
	search: (query: string) => readonly unknown[];
};

export type GroupProps = { query: string };

export const matches = (query: string, ...texts: (string | undefined)[]) =>
	texts.join(' ').toLowerCase().includes(query);
