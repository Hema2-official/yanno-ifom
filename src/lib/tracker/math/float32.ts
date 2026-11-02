/**
 * float32 arithmetic of the reference's libraries, emulated with Math.fround: the fused multiply-add,
 * and the exponential functions of PyTorch 1.10 on the CPU (x86, AVX2), as the golden tables
 * (tools/golden_tables.py torch_float32) show them:
 * - torch.sigmoid and F.softmax run PyTorch's vectorized kernels, which call SLEEF's expf_u10; with that
 *   function emulated, both match the golden tables bit for bit;
 * - torch.exp runs through MKL's vsExp, which cannot be reproduced. The correctly rounded value stands
 *   in for it; it differs from MKL's by one ULP for about 1% of inputs.
 */

const f = Math.fround;
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** The float32 next to the float32 x, in the given direction. */
function nextFloat32(x: number, direction: 1 | -1): number {
	if (x === 0) {
		u32[0] = 1;
		return direction * f32[0];
	}
	f32[0] = x;
	u32[0] = x > 0 === direction > 0 ? u32[0] + 1 : u32[0] - 1;
	return f32[0];
}

/**
 * The float32 result of the fused multiply-add a * b + c of float32 values, rounded once. The product
 * of two float32 values is exact in double; the sum is corrected with its exact error (TwoSum) where
 * rounding it twice could differ, which is only when it lies halfway between two float32 values.
 */
export function fmaFloat32(a: number, b: number, c: number): number {
	const p = a * b;
	const s = p + c;
	const bb = s - p;
	const error = p - (s - bb) + (c - bb);
	const r = f(s);
	if (r === s || error === 0) return r;
	const other = nextFloat32(r, r < s ? 1 : -1);
	if ((r + other) / 2 !== s) return r;
	return error > 0 ? Math.max(r, other) : Math.min(r, other);
}

/** To the nearest integer, ties to even (cvRound, and the default rounding of x86's conversions). */
export function roundHalfEven(x: number): number {
	const floor = Math.floor(x);
	const fraction = x - floor;
	if (fraction > 0.5) return floor + 1;
	if (fraction < 0.5) return floor;
	return floor % 2 === 0 ? floor : floor + 1;
}

const R_LN2 = f(1.442695040888963407359924681001892137426645954152985934135449406931);
const L2U = f(0.693145751953125);
const L2L = f(1.428606765330187045e-6);
const P0 = f(0.000198527617612853646278381),
	P1 = f(0.00139304355252534151077271),
	P2 = f(0.00833336077630519866943359);
const P3 = f(0.0416664853692054748535156),
	P4 = f(0.166666671633720397949219);

/**
 * SLEEF's expf_u10 (xexpf in sleefsimdsp.c) as PyTorch's vectorized kernels call it (Vectorized<float>::exp,
 * AVX2 with FMA): q = rint(d / ln 2), the reduced argument in two FMA steps, a degree-6 polynomial, and
 * the result scaled by 2^q in two halves.
 */
export function sleefExp(d: number): number {
	if (d !== d) return d;
	if (d < -104) return 0;
	if (d > 100) return Infinity;
	const q = roundHalfEven(f(d * R_LN2));
	let s = fmaFloat32(q, -L2U, d);
	s = fmaFloat32(q, -L2L, s);
	let u = fmaFloat32(P0, s, P1);
	u = fmaFloat32(u, s, P2);
	u = fmaFloat32(u, s, P3);
	u = fmaFloat32(u, s, P4);
	u = fmaFloat32(u, s, 0.5);
	u = f(1 + fmaFloat32(f(s * s), u, s));
	const half = q >> 1;
	return f(f(u * 2 ** half) * 2 ** (q - half));
}

/** torch.sigmoid on the CPU: 1 / (1 + exp(0 - x)), each step in float32, with SLEEF's exp. */
export function torchSigmoid(x: number): number {
	return f(1 / f(sleefExp(f(0 - x)) + 1));
}

/** A float32's position in the order of the float32 values, 0 and -0 at 0. */
function rank(x: number): number {
	f32[0] = x;
	return x < 0 ? -(u32[0] & 0x7fffffff) : u32[0] & 0x7fffffff;
}

function atRank(r: number): number {
	u32[0] = r < 0 ? (0x80000000 | -r) >>> 0 : r;
	return f32[0];
}

/** The smallest float32 where test holds, for a test false below it and true from it on, starting near x. */
function firstFloat32(x: number, test: (x: number) => boolean): number {
	let low = rank(x),
		high = low,
		step = 1;
	while (test(atRank(low))) {
		high = low;
		low -= step;
		step *= 2;
	}
	while (!test(atRank(high))) {
		low = high;
		high += step;
		step *= 2;
	}
	while (high - low > 1) {
		const middle = Math.floor((low + high) / 2);
		if (test(atRank(middle))) high = middle;
		else low = middle;
	}
	return atRank(high);
}

/**
 * The smallest float32 x for which torch.sigmoid(x) > c, with c compared as the float32 PyTorch makes of
 * a Python float: a logit is above the confidence exactly when it is at least this value. Found by
 * bisecting around logit(c) with the emulated sigmoid.
 */
export function sigmoidThreshold(c: number): number {
	const limit = f(c);
	return firstFloat32(f(Math.log(c / (1 - c))), (x) => torchSigmoid(x) > limit);
}

/** The smallest float32 x for which torch.sigmoid(x) >= c, so that x below it means sigmoid < c. */
export function sigmoidAtLeastThreshold(c: number): number {
	const limit = f(c);
	return firstFloat32(f(Math.log(c / (1 - c))), (x) => torchSigmoid(x) >= limit);
}

/**
 * F.softmax over the last dimension of size two, as PyTorch's vectorized kernel computes it: the
 * exponentials of the logits minus their maximum, their sum, its reciprocal, and the products. Writes
 * both probabilities to out[at], out[at + 1].
 */
export function torchSoftmax2(a: number, b: number, out: Float32Array, at: number): void {
	const max = a >= b || b !== b ? a : b;
	const ea = sleefExp(f(a - max)),
		eb = sleefExp(f(b - max));
	const inverse = f(1 / f(ea + eb));
	out[at] = f(ea * inverse);
	out[at + 1] = f(eb * inverse);
}

/**
 * torch.exp on the CPU. PyTorch runs it through MKL's vsExp; the correctly rounded value stands in for
 * it (the double exponential rounded to float32) and differs from MKL's by one ULP for about 1% of inputs.
 */
export function torchExp(x: number): number {
	return f(Math.exp(x));
}
