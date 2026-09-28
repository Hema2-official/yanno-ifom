import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { actionIds, actions, type ActionId, type ActionScope } from '$lib/keybindings/actions';
import {
	comboFromEvent,
	comboLabel,
	comboParts,
	isModifierOnly,
	modifiersMatch,
	normalizeKey,
	parseCombo,
	type KeyCombo
} from '$lib/keybindings/keys';
import { isApple } from '$lib/utils/platform';
import { SettingState } from './SettingState.svelte';

// Shortcuts and the paste command must not steal keystrokes from text fields
export const isTypingTarget = (e: Event) =>
	e.target instanceof HTMLElement &&
	(e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));

// Dialogs own the keyboard entirely; open menus only take Escape
const isOpen = (roles: string) =>
	document.querySelector(`[data-state="open"]:is(${roles})`) !== null;
export const isDialogOpen = () => isOpen('[role="dialog"], [role="alertdialog"]');
const isMenuOpen = () => isOpen('[role="menu"]');

const sameCombos = (a: KeyCombo[], b: KeyCombo[]) =>
	a.length === b.length && a.every((combo, index) => combo === b[index]);

class KeybindingState {
	/** The actions bound differently from their defaults, by id. */
	#stored = new SettingState<Record<string, unknown>>('keybindings', {});
	#scopes = new SvelteSet<ActionScope>(['global']);
	/** The hold actions currently down, with the chord that pressed each. */
	#held = new SvelteMap<ActionId, KeyCombo>();

	/** Every action's chords: the stored ones that parse, or the defaults. */
	bindings: Record<ActionId, KeyCombo[]> = $derived.by(() => {
		const stored = this.#stored.current;
		const entries = actionIds.map((id) => {
			const raw: unknown = stored[id];
			const combos = Array.isArray(raw)
				? raw.map(parseCombo).filter((combo): combo is KeyCombo => combo !== null)
				: actions[id].defaults;
			return [id, combos] as const;
		});
		return Object.fromEntries(entries) as Record<ActionId, KeyCombo[]>;
	});

	/** Each chord's actions, in precedence order. */
	#byCombo: Map<KeyCombo, { id: ActionId }[]> = $derived(
		Map.groupBy(
			actionIds.flatMap((id) => this.bindings[id].map((combo) => ({ id, combo }))),
			(binding) => binding.combo
		)
	);

	hasCustomizations: boolean = $derived(actionIds.some((id) => this.isCustomized(id)));

	isCustomized(id: ActionId): boolean {
		return !sameCombos(this.bindings[id], actions[id].defaults);
	}

	setBindings(id: ActionId, combos: KeyCombo[]) {
		const unique = [...new Set(combos)];
		const stored = { ...this.#stored.current };
		if (sameCombos(unique, actions[id].defaults)) delete stored[id];
		else stored[id] = unique;
		this.#stored.current = stored;
	}

	reset(id: ActionId) {
		this.setBindings(id, actions[id].defaults);
	}

	resetAll() {
		this.#stored.reset();
	}

	/**
	 * The other actions sharing a chord, in precedence order. Hold actions
	 * sharing a key all apply, so two of them don't count as a collision.
	 */
	collisions(id: ActionId, combo: KeyCombo): ActionId[] {
		const kind = actions[id].kind;
		return (this.#byCombo.get(combo) ?? [])
			.map((binding) => binding.id)
			.filter(
				(other) => other !== id && (kind === 'press' || actions[other].kind === 'press')
			);
	}

	/** The first chord as text for menus and the toolbar; empty when unbound. */
	label(id: ActionId): string {
		const [first] = this.bindings[id];
		return first === undefined ? '' : comboLabel(first);
	}

	/** Whether a hold action's keys are down. */
	isHeld(id: ActionId): boolean {
		return this.#held.has(id);
	}

	/**
	 * Whether a hold action applies to a pointer event: by the event's own
	 * modifiers when the chord is modifiers only (a key pressed before the
	 * window had focus never reached `isHeld`), by the keys held otherwise.
	 */
	isActive(id: ActionId, e: MouseEvent): boolean {
		return this.bindings[id].some((combo) =>
			isModifierOnly(combo) ? modifiersMatch(combo, e) : this.#held.get(id) === combo
		);
	}

	/** Makes a scope's actions available until the returned cleanup runs (see `KeybindingScope`). */
	activate(scope: ActionScope): () => void {
		this.#scopes.add(scope);
		return () => {
			this.#scopes.delete(scope);
			this.releaseAll();
		};
	}

	// The window's key events arrive through `KeybindingListener`

	handleKeyDown = (e: KeyboardEvent) => {
		if (e.isComposing) return;
		const combo = comboFromEvent(e);
		if (combo === null || isTypingTarget(e) || isDialogOpen()) return;
		if (combo === 'Escape' && isMenuOpen()) return;

		let handled = false;
		let ran = false;
		for (const { id } of this.#byCombo.get(combo) ?? []) {
			const action = actions[id];
			if (!this.#scopes.has(action.scope)) continue;
			if (action.kind === 'hold') {
				this.#held.set(id, combo);
				handled = true;
			} else if (!ran && (action.enabled?.() ?? true)) {
				action.run();
				ran = handled = true;
			}
		}
		if (handled) e.preventDefault();
	};

	// A released key ends the holds it took part in. Releasing ⌘ ends every
	// other hold too, since macOS reports no other key's release while ⌘ is down
	handleKeyUp = (e: KeyboardEvent) => {
		const key = normalizeKey(e.key);
		if (key === null) return;
		const endsOthers = isApple && e.key === 'Meta';
		for (const [id, combo] of [...this.#held]) {
			if (comboParts(combo).includes(key) || (endsOthers && !isModifierOnly(combo))) {
				this.#held.delete(id);
				e.preventDefault();
			}
		}
	};

	/** Ends every hold, for when key releases can't be seen (window blurred or hidden). */
	releaseAll = () => {
		this.#held.clear();
	};
}

export const keybindings = new KeybindingState();
