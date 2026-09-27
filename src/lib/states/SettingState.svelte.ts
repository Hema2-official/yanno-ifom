import { useEventListener, watch } from 'runed';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { updatePreferences } from '$lib/api/users';
import type { MeResponse } from '$lib/types/api.type';
import { accountState } from './AccountState.svelte';

const STORAGE_PREFIX = 'settings.';
/** How long a change waits for further changes before it's uploaded. */
const UPLOAD_DELAY_MS = 1000;

export type SettingOptions<T> = {
	/** Stays on this device only instead of following the account. */
	local?: boolean;
	/** Accepts a stored or fetched value; by default any value of the initial value's type. */
	validate?: (value: unknown) => value is T;
};

type Registration = { initial: unknown; local: boolean; validate: (value: unknown) => boolean };

const sameTypeAs = (initial: unknown) => (value: unknown) =>
	value !== null &&
	typeof value === typeof initial &&
	Array.isArray(value) === Array.isArray(initial);

/**
 * Keeps every `SettingState`-declared state in localStorage.
 * If logged in, also synchronizes with account preferences.
 */
class SettingsStore {
	#registrations = new SvelteMap<string, Registration>();
	/** The overrides in force; missing key = the initial value. */
	#values = new SvelteMap<string, unknown>();
	/** The account's preferences as last seen, null while signed out. */
	#cloud: Record<string, unknown> | null = null;
	/** Keys changed here that the account doesn't have yet. */
	#dirty = new SvelteSet<string>();
	#timer: ReturnType<typeof setTimeout> | null = null;
	#uploading = false;

	constructor() {
		if (typeof window === 'undefined') return;
		$effect.root(() => {
			useEventListener(window, 'storage', this.#onStorage);
			useEventListener(window, 'online', () => this.#schedule(0));
			// Whatever is still waiting goes out with the page
			useEventListener(window, 'pagehide', () => void this.#flush(true));
			watch([() => accountState.currentAccount], ([account]) => this.#onAccount(account));
		});
	}

	register<T>(key: string, initial: T, options: SettingOptions<T>) {
		const registration: Registration = {
			initial,
			local: options.local ?? false,
			validate: options.validate ?? sameTypeAs(initial)
		};
		this.#registrations.set(key, registration); // a hot reload registers again

		const stored = this.#read(key);
		if (stored !== undefined && registration.validate(stored)) this.#values.set(key, stored);
		if (!registration.local && this.#cloud !== null) {
			this.#adopt(key, registration, this.#cloud, null);
			this.#schedule(0);
		}
	}

	get(key: string): unknown {
		return this.#values.has(key)
			? this.#values.get(key)
			: this.#registrations.get(key)?.initial;
	}

	set(key: string, value: unknown) {
		this.#values.set(key, value);
		this.#write(key, value);
		this.#markDirty(key);
	}

	/** Back to the initial value, and gone from the account. */
	reset(key: string) {
		this.#values.delete(key);
		localStorage.removeItem(STORAGE_PREFIX + key);
		this.#markDirty(key);
	}

	isDefault(key: string): boolean {
		return !this.#values.has(key);
	}

	#markDirty(key: string) {
		if (this.#cloud === null || this.#registrations.get(key)?.local) return;
		this.#dirty.add(key);
		this.#schedule(UPLOAD_DELAY_MS);
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

	// Another tab's change, which that tab uploads
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

	#onAccount(account: MeResponse | null | undefined) {
		if (account === undefined) return; // not known yet
		if (account === null) {
			this.#cloud = null;
			this.#dirty.clear();
			this.#cancel();
			return;
		}

		// Plain data: the account is state, so its preferences are proxies
		const cloud: Record<string, unknown> = $state.snapshot(account.preferences) ?? {};
		const previous = this.#cloud;
		for (const [key, registration] of this.#registrations) {
			if (!registration.local) this.#adopt(key, registration, cloud, previous);
		}
		this.#cloud = cloud;
		this.#schedule(0);
	}

	/**
	 * Takes the account's value of a key, unless a change of ours is still on
	 * its way up. A key the account lacks is filled in from this device, or
	 * reset here when the account used to have it: another device reset it.
	 */
	#adopt(
		key: string,
		registration: Registration,
		cloud: Record<string, unknown>,
		previous: Record<string, unknown> | null
	) {
		if (this.#dirty.has(key)) return;
		if (key in cloud) {
			const value = cloud[key];
			if (!registration.validate(value)) return;
			this.#values.set(key, value);
			this.#write(key, value);
		} else if (previous !== null && key in previous) {
			this.#values.delete(key);
			localStorage.removeItem(STORAGE_PREFIX + key);
		} else if (this.#values.has(key)) {
			this.#dirty.add(key);
		}
	}

	#schedule(delay: number) {
		this.#cancel();
		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.#flush();
		}, delay);
	}

	#cancel() {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}

	/** Uploads the dirty keys in one patch; a failure keeps them for the next change or `online`. */
	async #flush(unloading = false) {
		if (this.#cloud === null || this.#dirty.size === 0) return;
		if (this.#uploading && !unloading) return;

		const keys = [...this.#dirty];
		this.#dirty.clear();
		const patch = Object.fromEntries(
			keys.map((key) => [key, this.#values.has(key) ? this.#values.get(key) : null])
		);

		this.#uploading = true;
		let failed = false;
		try {
			const merged = await updatePreferences(
				patch,
				unloading ? { keepalive: true } : undefined
			);
			if (this.#cloud !== null) this.#cloud = merged;
		} catch (error) {
			for (const key of keys) this.#dirty.add(key);
			failed = true;
			console.error("Couldn't upload the settings", error);
		} finally {
			this.#uploading = false;
			// Changes made meanwhile go next
			if (!failed && !unloading && this.#dirty.size > 0) this.#schedule(UPLOAD_DELAY_MS);
		}
	}
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

	/** Back to the initial value, on every device of the account. */
	reset() {
		settingsStore.reset(this.key);
	}
}

export const settingsStore = new SettingsStore();
