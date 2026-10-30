export const versionStepOrder = ['segmentation', 'tracking', 'inheritance'] as const;
export type VersionStep = (typeof versionStepOrder)[number];

export function getNextStep(step?: VersionStep | null): VersionStep | null {
	if (!step) return versionStepOrder[0];
	const currentIndex = versionStepOrder.indexOf(step);
	return currentIndex < versionStepOrder.length - 1 ? versionStepOrder[currentIndex + 1] : null;
}

export enum VideoColor {
	GRAYSCALE = 'GRAYSCALE',
	RGB = 'RGB'
}

export type VideoConfig = {
	color: VideoColor;
	start_period: number;
	channel_period: number;
};

export const defaultVideoConfig: VideoConfig = {
	color: VideoColor.GRAYSCALE,
	start_period: 0,
	channel_period: 1
};

export type VideoComponentMetadata = {
	min_value: number;
	max_value: number;
};

export type VideoChannelMetadata = {
	r: VideoComponentMetadata;
	g: VideoComponentMetadata;
	b: VideoComponentMetadata;
};

export type VideoMetadata = {
	frame_count: number;
	width: number;
	height: number;
	channels: VideoChannelMetadata[];
};

export enum InheritanceMethod {
	EUCLIDEAN = 'EUCLIDEAN'
}

// The networks are the ones served with the app, so the parameters name no model
export type SegmentationParams = {
	score_threshold: number;
};

export type TrackingParams = {
	remove_faulty_objects: boolean;
	min_object_pixel_number: number;
	max_overlap_ratio: number;
	segmentation_confidence: number;
	min_required_similarity: number;
	max_time_kernel_shift?: number;
};

export type InheritanceParams = {
	method: InheritanceMethod;
	max_centroid_distance: number;
};

export type AnyStepParams = SegmentationParams | TrackingParams | InheritanceParams;

export const defaultSegmentationParams: SegmentationParams = {
	score_threshold: 0.4
};

export const defaultTrackingParams: TrackingParams = {
	remove_faulty_objects: true,
	min_object_pixel_number: 100,
	max_overlap_ratio: 0.5,
	segmentation_confidence: 0.2,
	min_required_similarity: 0.2,
	max_time_kernel_shift: undefined
};

export const defaultInheritanceParams: InheritanceParams = {
	method: InheritanceMethod.EUCLIDEAN,
	// The tracker's own default
	max_centroid_distance: 60
};

export type StepParams = {
	segmentation: SegmentationParams;
	tracking: TrackingParams;
	inheritance: InheritanceParams;
};

export const defaultStepParams: StepParams = {
	segmentation: defaultSegmentationParams,
	tracking: defaultTrackingParams,
	inheritance: defaultInheritanceParams
};
