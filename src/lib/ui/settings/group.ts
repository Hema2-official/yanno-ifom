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

/** A search over a table of row labels (with their keywords): the keys of the matching rows. */
export const searchRows =
	<Row extends string>(rows: Record<Row, string>) =>
	(query: string) =>
		(Object.keys(rows) as Row[]).filter((row) => matches(query, rows[row]));
