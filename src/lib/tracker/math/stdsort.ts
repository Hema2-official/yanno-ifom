/**
 * libstdc++'s std::sort, std::nth_element and std::partial_sort (bits/stl_algo.h, bits/stl_heap.h),
 * step for step, on an array of items ordered by their keys, largest first (NaN before everything):
 * the comparator of PyTorch's CPU sort and topk. These sorts are not stable, so which of two equal keys
 * comes first depends on every step of the algorithms; they are ported exactly to give PyTorch's order
 * of ties.
 */

const THRESHOLD = 16; // _S_threshold

let keys: ArrayLike<number> = [];
let items: Int32Array = new Int32Array(0);

/** comp(a, b): item a goes before item b. */
function before(a: number, b: number): boolean {
	const x = keys[a],
		y = keys[b];
	return x > y || (x !== x && y === y);
}

function swap(i: number, j: number): void {
	const t = items[i];
	items[i] = items[j];
	items[j] = t;
}

function lg(n: number): number {
	return 31 - Math.clz32(n);
}

function moveMedianToFirst(result: number, a: number, b: number, c: number): void {
	const A = items[a],
		B = items[b],
		C = items[c];
	if (before(A, B)) {
		if (before(B, C)) swap(result, b);
		else if (before(A, C)) swap(result, c);
		else swap(result, a);
	} else if (before(A, C)) swap(result, a);
	else if (before(B, C)) swap(result, c);
	else swap(result, b);
}

function unguardedPartition(first: number, last: number, pivot: number): number {
	const p = items[pivot]; // the pivot lies outside [first, last) and does not move
	for (;;) {
		while (before(items[first], p)) first++;
		last--;
		while (before(p, items[last])) last--;
		if (!(first < last)) return first;
		swap(first, last);
		first++;
	}
}

function unguardedPartitionPivot(first: number, last: number): number {
	const mid = first + ((last - first) >> 1);
	moveMedianToFirst(first, first + 1, mid, last - 1);
	return unguardedPartition(first + 1, last, first);
}

function unguardedLinearInsert(last: number): void {
	const value = items[last];
	let next = last - 1;
	while (before(value, items[next])) {
		items[last] = items[next];
		last = next;
		next--;
	}
	items[last] = value;
}

function insertionSort(first: number, last: number): void {
	if (first === last) return;
	for (let i = first + 1; i !== last; i++) {
		if (before(items[i], items[first])) {
			const value = items[i];
			items.copyWithin(first + 1, first, i);
			items[first] = value;
		} else {
			unguardedLinearInsert(i);
		}
	}
}

function finalInsertionSort(first: number, last: number): void {
	if (last - first > THRESHOLD) {
		insertionSort(first, first + THRESHOLD);
		for (let i = first + THRESHOLD; i !== last; i++) unguardedLinearInsert(i);
	} else {
		insertionSort(first, last);
	}
}

function pushHeap(first: number, hole: number, top: number, value: number): void {
	let parent = Math.trunc((hole - 1) / 2);
	while (hole > top && before(items[first + parent], value)) {
		items[first + hole] = items[first + parent];
		hole = parent;
		parent = Math.trunc((hole - 1) / 2);
	}
	items[first + hole] = value;
}

function adjustHeap(first: number, hole: number, length: number, value: number): void {
	const top = hole;
	let second = hole;
	while (second < Math.trunc((length - 1) / 2)) {
		second = 2 * (second + 1);
		if (before(items[first + second], items[first + second - 1])) second--;
		items[first + hole] = items[first + second];
		hole = second;
	}
	if ((length & 1) === 0 && second === Math.trunc((length - 2) / 2)) {
		second = 2 * (second + 1);
		items[first + hole] = items[first + second - 1];
		hole = second - 1;
	}
	pushHeap(first, hole, top, value);
}

function makeHeap(first: number, last: number): void {
	const length = last - first;
	if (length < 2) return;
	for (let parent = Math.trunc((length - 2) / 2); ; parent--) {
		adjustHeap(first, parent, length, items[first + parent]);
		if (parent === 0) return;
	}
}

function popHeap(first: number, last: number, result: number): void {
	const value = items[result];
	items[result] = items[first];
	adjustHeap(first, 0, last - first, value);
}

function heapSelect(first: number, middle: number, last: number): void {
	makeHeap(first, middle);
	for (let i = middle; i < last; i++)
		if (before(items[i], items[first])) popHeap(first, middle, i);
}

function sortHeap(first: number, last: number): void {
	while (last - first > 1) {
		last--;
		popHeap(first, last, last);
	}
}

function introsortLoop(first: number, last: number, depth: number): void {
	while (last - first > THRESHOLD) {
		if (depth === 0) {
			heapSelect(first, last, last);
			sortHeap(first, last);
			return;
		}
		depth--;
		const cut = unguardedPartitionPivot(first, last);
		introsortLoop(cut, last, depth);
		last = cut;
	}
}

function introselect(first: number, nth: number, last: number, depth: number): void {
	while (last - first > 3) {
		if (depth === 0) {
			heapSelect(first, nth + 1, last);
			swap(first, nth);
			return;
		}
		depth--;
		const cut = unguardedPartitionPivot(first, last);
		if (cut <= nth) first = cut;
		else last = cut;
	}
	insertionSort(first, last);
}

/** std::sort of order[first..last), by key descending. */
export function stdSort(
	order: Int32Array,
	key: ArrayLike<number>,
	first = 0,
	last = order.length
): void {
	if (first === last) return;
	keys = key;
	items = order;
	introsortLoop(first, last, lg(last - first) * 2);
	finalInsertionSort(first, last);
}

/** std::nth_element of order[first..last) at nth, by key descending. */
export function stdNthElement(
	order: Int32Array,
	key: ArrayLike<number>,
	first: number,
	nth: number,
	last: number
): void {
	if (first === last || nth === last) return;
	keys = key;
	items = order;
	introselect(first, nth, last, lg(last - first) * 2);
}

/** std::partial_sort of order[first..last) up to middle, by key descending. */
export function stdPartialSort(
	order: Int32Array,
	key: ArrayLike<number>,
	first: number,
	middle: number,
	last: number
): void {
	keys = key;
	items = order;
	heapSelect(first, middle, last);
	sortHeap(first, middle);
}

/** The indices 0..n-1 in out[0..n). */
function iota(n: number, out: Int32Array): Int32Array {
	for (let i = 0; i < n; i++) out[i] = i;
	return out;
}

/**
 * torch.sort(key[0..n), descending=True) on the CPU (not stable: std::sort): the order of the indices,
 * written to out[0..n), which is returned.
 */
export function torchSortDescending(
	key: ArrayLike<number>,
	n: number,
	out: Int32Array = new Int32Array(n)
): Int32Array {
	stdSort(iota(n, out), key, 0, n);
	return out;
}

/**
 * The indices of torch.topk(key[0..n), k) on the CPU (largest, sorted), in out[0..k). out needs n
 * entries, as PyTorch's queue does. For k * 64 <= n PyTorch partially sorts; otherwise it moves the k-th
 * largest into place and sorts the k - 1 before it.
 */
export function torchTopk(
	key: ArrayLike<number>,
	n: number,
	k: number,
	out: Int32Array = new Int32Array(n)
): Int32Array {
	iota(n, out);
	if (k * 64 <= n) {
		stdPartialSort(out, key, 0, k, n);
	} else {
		stdNthElement(out, key, 0, k - 1, n);
		stdSort(out, key, 0, k - 1);
	}
	return out;
}
