export type AuthResponse = {
	account_id: number;
};

export type MeResponse = {
	id: number;
	email: string;
	created_at: string;
	updated_at: string;
};

export const versionStepOrder = ['segmentation', 'tracking', 'inheritance'] as const;
export type VersionStep = (typeof versionStepOrder)[number];

export function getNextStep(step?: VersionStep | null): VersionStep | null {
	if (!step) return versionStepOrder[0];
	const currentIndex = versionStepOrder.indexOf(step);
	return currentIndex < versionStepOrder.length - 1 ? versionStepOrder[currentIndex + 1] : null;
}

export function getAutoName(step: VersionStep, source_name: string | undefined) {
	switch (step) {
		case 'segmentation':
			return 'Segmentation';
		case 'tracking':
			return `${source_name} (tracked)`;
		case 'inheritance':
			return `${source_name} (inheritance predicted)`;
	}
}

export type ProjectVersion = {
	id: string; // UUID
	project_id: string; // UUID
	name: string;
	step: VersionStep | null;
	ready: boolean;
	created_at: Date;
	updated_at: Date;
};

export enum VideoColor {
	GRAYSCALE = 'GRAYSCALE',
	RGB = 'RGB'
}

export type Project = {
	id: string; // UUID
	name: string;
	ready: boolean;
	frame_count: number;
	color: VideoColor;
	channel_period: number;
	start_period: number;
	versions: ProjectVersion[];
	created_at: Date;
	updated_at: Date;
};

export type CreateProjectVersionBody = {
	name: string;
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

export type AnyStepParams = SegmentationParams | TrackingParams | InheritanceParams;

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

export type ServerTask = {
	uuid: string; // UUID
	step: VersionStep;
	parameters: SegmentationParams | TrackingParams | InheritanceParams;
	created_at: string; // datetime
	status_message: string;
	finished: boolean;
	cancelled: boolean;
	error?: string;
};

export type EnqueueTaskBody = {
	step: VersionStep;
	parameters: SegmentationParams | TrackingParams | InheritanceParams;
};
