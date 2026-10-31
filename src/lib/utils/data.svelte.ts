/**
 * Returns the minimum value in an array.
 * Replacement for Math.min(...) to get around spread operator limitations.
 *
 * @param arr the array to find the minimum of
 */
export function getMin<T extends number | bigint>(arr: ArrayLike<T>): T {
	if (arr.length === 0) return Infinity as T;
	let min = arr[0];
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] < min) min = arr[i];
	}
	return min;
}

/**
 * Returns the maximum value in an array.
 * Replacement for Math.max(...) to get around spread operator limitations.
 *
 * @param arr the array to find the maximum of
 */
export function getMax<T extends number | bigint>(arr: ArrayLike<T>): T {
	if (arr.length === 0) return -Infinity as T;
	let max = arr[0];
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] > max) max = arr[i];
	}
	return max;
}
