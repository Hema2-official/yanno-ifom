/**
 * pycocotools' compressed form of the runs (rleToString / rleFrString in maskApi.c): every run as a
 * variable-length signed number in 5-bit groups, one ASCII character (48 + group, bit 0x20 for "more")
 * per group, and from the fourth run on as the difference to the run two before.
 */

const latin1 = new TextDecoder('latin1');
let byteScratch = new Uint8Array(4096);

/** The runs of a compressed counts string. Holds for runs below 2^29 (images below 2^29 pixels). */
export function decodeCounts(s: string): Uint32Array {
	const counts = new Uint32Array(s.length);
	const n = s.length;
	let m = 0,
		p = 0;
	while (p < n) {
		let x = 0,
			k = 0,
			more = 1;
		while (more) {
			const c = s.charCodeAt(p) - 48;
			x |= (c & 0x1f) << (5 * k);
			more = c & 0x20;
			p++;
			k++;
			if (!more && c & 0x10) x |= -1 << (5 * k);
		}
		if (m > 2) x += counts[m - 2];
		counts[m++] = x;
	}
	return counts.slice(0, m);
}

/** The compressed counts string of the runs. */
export function encodeCounts(runs: Uint32Array): string {
	if (runs.length * 7 > byteScratch.length) byteScratch = new Uint8Array(runs.length * 7);
	let p = 0;
	for (let i = 0; i < runs.length; i++) {
		let x = (i > 2 ? runs[i] - runs[i - 2] : runs[i]) | 0;
		let more = true;
		while (more) {
			let c = x & 0x1f;
			x >>= 5;
			more = c & 0x10 ? x !== -1 : x !== 0;
			if (more) c |= 0x20;
			byteScratch[p++] = c + 48;
		}
	}
	return latin1.decode(byteScratch.subarray(0, p));
}
