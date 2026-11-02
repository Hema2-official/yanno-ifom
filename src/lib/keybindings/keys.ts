import { isApple } from '$lib/utils/platform';

/**
 * Key chords as canonical strings, e.g. "Mod+Shift+z", "Escape", "Space", or "Shift".
 * `Mod` is ⌘ on Apple and Ctrl anywhere else.
 * Letters are lower case.
 */
export type KeyCombo = string;

const MODIFIERS = ['Mod', 'Alt', 'Shift'] as const;
type Modifier = (typeof MODIFIERS)[number];

export const isModifier = (part: string): part is Modifier =>
	(MODIFIERS as readonly string[]).includes(part);

/** Puts modifiers in a fixed order following MODIFIERS */
const orderModifiers = (modifiers: Set<Modifier>): string[] =>
	MODIFIERS.filter((modifier) => modifiers.has(modifier));

/** The name a KeyboardEvent's key goes by in a chord, or null if it can't be bound. */
export function normalizeKey(key: string): string | null {
	switch (key) {
		case 'Control':
			return isApple ? null : 'Mod';
		case 'Meta':
			return isApple ? 'Mod' : null;
		case 'Alt':
			return 'Alt';
		case 'Shift':
			return 'Shift';
		case ' ':
			return 'Space';
		case '+':
			return 'Plus';
		case 'Dead':
		case 'Unidentified':
			return null;
		default:
			return key.length === 1 ? key.toLowerCase() : key;
	}
}

const join = (modifiers: Set<Modifier>, key: string | null): KeyCombo =>
	[...orderModifiers(modifiers), ...(key === null ? [] : [key])].join('+');

/** The chord a keydown stands for, or null when it can't be bound. */
export function comboFromEvent(e: KeyboardEvent): KeyCombo | null {
	const key = normalizeKey(e.key);
	// The other platform modifier (the Windows key, or Ctrl on Apple) belongs to the OS
	if (key === null || (isApple ? e.ctrlKey : e.metaKey)) return null;

	const modifiers = new Set<Modifier>();
	if (isApple ? e.metaKey : e.ctrlKey) modifiers.add('Mod');
	if (e.altKey) modifiers.add('Alt');
	if (e.shiftKey) modifiers.add('Shift');
	if (isModifier(key)) {
		modifiers.add(key);
		return join(modifiers, null);
	}
	return join(modifiers, key);
}

/** A stored chord back in canonical form, or null if it isn't one. */
export function parseCombo(value: unknown): KeyCombo | null {
	if (typeof value !== 'string') return null;

	const parts = value.split('+');
	const modifiers = new Set<Modifier>();
	let key: string | null = null;
	for (const [index, part] of parts.entries()) {
		if (isModifier(part)) modifiers.add(part);
		else if (index === parts.length - 1 && part !== '') key = normalizeKey(part);
		else return null;
	}
	return modifiers.size === 0 && key === null ? null : join(modifiers, key);
}

export const comboParts = (combo: KeyCombo): string[] => combo.split('+');

export const isModifierOnly = (combo: KeyCombo): boolean => comboParts(combo).every(isModifier);

/** Whether a pointer event's modifiers are exactly those of a modifier-only chord. */
export function modifiersMatch(combo: KeyCombo, e: MouseEvent): boolean {
	if (!isModifierOnly(combo)) return false;
	const parts = comboParts(combo);
	return (
		parts.includes('Mod') === (isApple ? e.metaKey : e.ctrlKey) &&
		parts.includes('Alt') === e.altKey &&
		parts.includes('Shift') === e.shiftKey &&
		!(isApple ? e.ctrlKey : e.metaKey)
	);
}

const KEY_LABELS: Record<string, string> = {
	Mod: isApple ? '⌘' : 'Ctrl',
	Alt: isApple ? '⌥' : 'Alt',
	Shift: isApple ? '⇧' : 'Shift',
	Escape: 'Esc',
	Delete: 'Del',
	Backspace: '⌫',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	Plus: '+'
};

/** The chord's keys as the user sees them, one per key cap. */
export function formatCombo(combo: KeyCombo): string[] {
	return comboParts(combo).map(
		(part) => KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part)
	);
}

/** The chord on one line, for menus and the toolbar. */
export function comboLabel(combo: KeyCombo): string {
	return formatCombo(combo).join(isApple ? '' : '+');
}
