import type { Delta } from 'jsondiffpatch';
import { z } from 'zod';

export const rleSchema = z.object({
	size: z.tuple([z.number(), z.number()]),
	counts: z.string()
});

export const trackSchema = z.object({
	Frame: z.int().nonnegative(),
	ObjectID: z.string(),
	SegmentationRLE: rleSchema,
	TrackID: z.int().nullable(),
	Interpolated: z.boolean(),
	Class: z.unknown().optional(),
	AncestorID: z.int().nullable().optional()
});

export const changeSchema = z.object({
	time: z.string().optional(), // ISO 8601
	msg: z.string().optional(),
	reverse: z.custom<Exclude<Delta, undefined>>(
		(value) => typeof value === 'object' && value !== null
	)
});

// Unknown fields the backend may add are kept intact
export const annotationDataSchema = z.object({
	current: z.array(trackSchema.loose()),
	changes: z.array(changeSchema).default([])
});

export type RLEType = z.infer<typeof rleSchema>;
export type TrackType = z.infer<typeof trackSchema>;
export type ChangeType = z.infer<typeof changeSchema>;
export type VersionManaged<T> = { current: T; changes: ChangeType[] };
