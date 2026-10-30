/**
 * Bit-packed masks in column-major order: pixel i (= x * h + y) is bit i % 32 of word i >> 5. This is
 * the layout in which the tracking kernel's GPU threshold pass returns a local track's channels.
 */

let runScratch = new Uint32Array(1024);

/** The pycocotools runs of the h * w pixels starting at bit offset `first` of `words` (a multiple of 32). */
export function encodeBits(words: Uint32Array, h: number, w: number, first = 0): Uint32Array {
	const n = h * w;
	const firstWord = first >>> 5;
	const lastWord = (first + n + 31) >>> 5;
	let count = 0,
		start = 0,
		value = 0;
	for (let word = firstWord; word < lastWord; word++) {
		// the bits that differ from the current value mark run ends; whole words of the same value are skipped
		let bits = words[word];
		if (bits === (value ? 0xffffffff : 0)) continue;
		let differ = (value ? ~bits : bits) >>> 0;
		while (differ !== 0) {
			const bit = 31 - Math.clz32(differ & -differ);
			const position = (word - firstWord) * 32 + bit;
			if (position >= n) break;
			if (count + 1 >= runScratch.length) {
				const grown = new Uint32Array(runScratch.length * 2);
				grown.set(runScratch);
				runScratch = grown;
			}
			runScratch[count++] = position - start;
			start = position;
			value ^= 1;
			// from here on, look for bits that differ from the new value
			const above = bit === 31 ? 0 : (0xffffffff << (bit + 1)) >>> 0;
			bits = words[word];
			differ = ((value ? ~bits : bits) & above) >>> 0;
		}
	}
	if (count + 1 >= runScratch.length) {
		const grown = new Uint32Array(runScratch.length * 2);
		grown.set(runScratch);
		runScratch = grown;
	}
	runScratch[count++] = n - start;
	return runScratch.slice(0, count);
}

/** The bit-packed mask of the runs, written at bit offset `first` (a multiple of 32) of `words`. */
export function writeBits(runs: Uint32Array, words: Uint32Array, first = 0): void {
	let pos = first;
	for (let k = 0; k < runs.length; k++) {
		const length = runs[k];
		if (k & 1) {
			for (let i = pos; i < pos + length; i++) words[i >>> 5] |= 1 << (i & 31);
		}
		pos += length;
	}
}
