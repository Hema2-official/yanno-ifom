/**
 * cv2.normalize(x, None, 0, 255, NORM_MINMAX, dtype=CV_8U) as one lookup table per value range, with
 * OpenCV's arithmetic (core/src/norm.cpp normalize, core/src/convert_scale.simd.hpp cvt_32f):
 * - scale = 255 * (1 / (smax - smin)) and shift = 0 - smin * scale, in double (scale 0 for a
 *   constant image);
 * - convertTo then takes both as float32 and computes, per pixel, the fused multiply-add
 *   v * scale + shift in float32 (v_fma, as the AVX2 path does), rounded half to even and saturated.
 * When scale is 1 and shift 0 (within DBL_EPSILON), convertTo converts without scaling.
 */
import { fmaFloat32, roundHalfEven } from '../math/float32';

function saturateUint8(x: number): number {
	return x < 0 ? 0 : x > 255 ? 255 : x;
}

/**
 * The normalized value of every v in smin..smax (entry v - smin), for an image whose smallest value
 * is smin and largest smax, written into `out` (at least smax - smin + 1 entries), which is returned.
 */
export function normalizationTable(
	smin: number,
	smax: number,
	out: Uint8Array = new Uint8Array(smax - smin + 1)
): Uint8Array {
	const scale = 255 * (smax - smin > Number.EPSILON ? 1 / (smax - smin) : 0);
	const shift = 0 - smin * scale;
	const n = smax - smin + 1;
	if (Math.abs(scale - 1) < Number.EPSILON && Math.abs(shift) < Number.EPSILON) {
		for (let k = 0; k < n; k++) out[k] = saturateUint8(smin + k);
		return out;
	}
	const alpha = Math.fround(scale),
		beta = Math.fround(shift);
	for (let k = 0; k < n; k++)
		out[k] = saturateUint8(roundHalfEven(fmaFloat32(smin + k, alpha, beta)));
	return out;
}
