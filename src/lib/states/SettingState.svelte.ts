import { useEventListener } from 'runed';
import { SvelteMap } from 'svelte/reactivity';

const STORAGE_PREFIX = 'settings.';

export type SettingOptions<T> = {
	/** Accepts a stored value; by default any value of the initial value's type. */
	validate?: (value: unknown) => value is T;
};

type Registration = { initial: unknown; validate: (value: unknown) => boolean };

const sameTypeAs = (initial: unknown) => (value: unknown) =>
	value !== null &&
	typeof value === typeof initial &&
	Array.isArray(value) === Array.isArray(initial);

/** A `validate` for settings that take one of a few strings. */
export const oneOf =
	<T extends string>(values: readonly T[]) =>
	(value: unknown): value is T =>
		values.includes(value as T);

/** Keeps every `SettingState`-declared state in localStorage. */
class SettingsStore {
	#registrations = new SvelteMap<string, Registration>();
	/** The overrides in force; missing key = the initial value. */
	#values = new SvelteMap<string, unknown>();

	constructor() {
		if (typeof window === 'undefined') return;
		$effect.root(() => {
			useEventListener(window, 'storage', this.#onStorage);
		});
	}

	register<T>(key: string, initial: T, options: SettingOptions<T>) {
		const registration: Registration = {
			initial,
			validate: options.validate ?? sameTypeAs(initial)
		};
		this.#registrations.set(key, registration); // a hot reload registers again

		const stored = this.#read(key);
		if (stored !== undefined && registration.validate(stored)) this.#values.set(key, stored);
	}

	get(key: string): unknown {
		return this.#values.has(key)
			? this.#values.get(key)
			: this.#registrations.get(key)?.initial;
	}

	set(key: string, value: unknown) {
		this.#values.set(key, value);
		this.#write(key, value);
	}

	/** Back to the initial value. */
	reset(key: string) {
		this.#values.delete(key);
		localStorage.removeItem(STORAGE_PREFIX + key);
	}

	isDefault(key: string): boolean {
		return !this.#values.has(key);
	}

	#read(key: string): unknown {
		try {
			const json = localStorage.getItem(STORAGE_PREFIX + key);
			return json === null ? undefined : JSON.parse(json);
		} catch {
			return undefined;
		}
	}

	#write(key: string, value: unknown) {
		try {
			localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
		} catch (error) {
			console.error(`Couldn't store the setting "${key}"`, error);
		}
	}

	// Another tab's change
	#onStorage = (event: StorageEvent) => {
		if (!event.key?.startsWith(STORAGE_PREFIX)) return;
		const key = event.key.slice(STORAGE_PREFIX.length);
		const registration = this.#registrations.get(key);
		if (!registration) return;
		if (event.newValue === null) {
			this.#values.delete(key);
			return;
		}
		try {
			const value: unknown = JSON.parse(event.newValue);
			if (registration.validate(value)) this.#values.set(key, value);
		} catch {
			// Not a value of ours
		}
	};
}

export class SettingState<T> {
	readonly key: string;

	constructor(key: string, initial: T, options: SettingOptions<T> = {}) {
		this.key = key;
		settingsStore.register(key, initial, options);
	}

	get current(): T {
		return settingsStore.get(this.key) as T;
	}

	set current(value: T) {
		settingsStore.set(this.key, value);
	}

	/** Whether it was never set, or was reset. */
	get isDefault(): boolean {
		return settingsStore.isDefault(this.key);
	}

	/** Back to the initial value. */
	reset() {
		settingsStore.reset(this.key);
	}
}

export const settingsStore = new SettingsStore();
