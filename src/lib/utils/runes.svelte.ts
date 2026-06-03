/**
 * Wrap a value in a Svelte state for deep reactivity.
 * @param value The value to wrap
 * @returns A Svelte state containing the value
 */
export function toState<T>(value: T) {
	const stateValue = $state(value);
	return stateValue;
}
