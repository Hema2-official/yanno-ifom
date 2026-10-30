/**
 * Annotation records as the backend stores them (cell-tracking-backend common/annot_types.py TrackType),
 * with the keys in its order, so that JSON.stringify gives the backend's serialization.
 */

export interface SegmentationRle {
	size: [number, number];
	counts: string;
}

export interface TrackType {
	Frame: number;
	ObjectID: string;
	SegmentationRLE: SegmentationRle;
	TrackID: number | null;
	Interpolated: boolean;
	Class: string | null;
	AncestorID: number | null;
}

export function trackType(
	frame: number,
	objectId: string,
	h: number,
	w: number,
	counts: string,
	trackId: number | null,
	interpolated: boolean,
	className: string | null,
	ancestorId: number | null
): TrackType {
	return {
		Frame: frame,
		ObjectID: objectId,
		SegmentationRLE: { size: [h, w], counts },
		TrackID: trackId,
		Interpolated: interpolated,
		Class: className,
		AncestorID: ancestorId
	};
}

/** Python's "{:04d}".format(n): at least four digits, zero-padded. */
export function pad4(n: number): string {
	return String(n).padStart(4, '0');
}
