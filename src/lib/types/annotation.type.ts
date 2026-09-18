import type { Delta } from 'jsondiffpatch';
import { z } from 'zod';

export const rleSchema = z.object({
	size: z.tuple([z.number(), z.number()]),
	counts: z.string()
});

export const boundingBoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const trackSchema = z.object({
	Frame: z.int().nonnegative(),
	ObjectID: z.string(),
	SegmentationRLE: rleSchema,
	LocalTrackRLE: z.array(rleSchema).nullable(),
	Centroid: z.tuple([z.number(), z.number()]).nullable(),
	SegBbox: boundingBoxSchema.nullable(),
	TrackBbox: boundingBoxSchema.nullable(),
	PrevID: z.string().nullable(),
	NextID: z.string().nullable(),
	TrackID: z.int().nullable(),
	Interpolated: z.boolean()
});

export const changeSchema = z.object({
	time: z.string().optional(), // ISO 8601
	msg: z.string().optional(),
	reverse: z.custom<Exclude<Delta, undefined>>(
		(value) => typeof value === 'object' && value !== null
	)
});

// The backend adds fields we don't use (Class, AncestorID); keep them intact
export const annotationDataSchema = z.object({
	current: z.array(trackSchema.loose()),
	changes: z.array(changeSchema).default([])
});

export type RLEType = z.infer<typeof rleSchema>;
export type BoundingBoxType = z.infer<typeof boundingBoxSchema>;
export type TrackType = z.infer<typeof trackSchema>;
export type ChangeType = z.infer<typeof changeSchema>;
export type VersionManaged<T> = { current: T; changes: ChangeType[] };
