export type LoginResponse = {
	account_id: number;
};

export type MeResponse = {
	id: number;
	email: string;
	created_at: string;
	updated_at: string;
};

const stepOrder = ['segmentation', 'tracking', 'inheritance'] as const;
export type VersionStep = (typeof stepOrder)[number];

export function getNextStep(step?: VersionStep): VersionStep | null {
	if (!step) return stepOrder[0];
	const currentIndex = stepOrder.indexOf(step);
	return currentIndex < stepOrder.length - 1 ? stepOrder[currentIndex + 1] : null;
}

export type ProjectVersion = {
	id: string; // UUID
	project_id: string; // UUID
	source_version_id?: string; // UUID
	name: string;
	step?: VersionStep;
	ready: boolean;
	created_at: string;
	updated_at: string;
};

export enum ProjectStatus {
	pending = 'pending',
	uploading = 'uploading',
	ready = 'ready'
}

export enum VideoColor {
	GRAYSCALE = 'GRAYSCALE',
	RGB = 'RGB'
}

export type Project = {
	id: string; // UUID
	name: string;
	status: ProjectStatus;
	source_data: string;
	editor_data: string;
	color: VideoColor;
	channel_period: number;
	start_period: number;
	versions: ProjectVersion[];
	created_at: string;
	updated_at: string;
};

export type APIError = {
	detail: string;
};

export type CredentialsError = {
	detail: {
		email_field_message?: string;
		password_field_message?: string;
	};
};

export enum InheritanceMethod {
	EUCLIDEAN = 'EUCLIDEAN'
}

export type SegmentationParams = {
	model_name: string;
	score_threshold: number;
};

export type TrackingParams = {
	model_name: string;
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

export const defaultSegmentationParams: SegmentationParams = {
	model_name: 'model_larger_set_aug1.pth',
	score_threshold: 0.4
};

export const defaultTrackingParams: TrackingParams = {
	model_name: 'IFOMYeast_KernelTracker_[DLV3p,RN50]_FBtr7_LargeDatsetAugm_Adv2.pth',
	remove_faulty_objects: true,
	min_object_pixel_number: 100,
	max_overlap_ratio: 0.5,
	segmentation_confidence: 0.2,
	min_required_similarity: 0.2,
	max_time_kernel_shift: undefined
};
