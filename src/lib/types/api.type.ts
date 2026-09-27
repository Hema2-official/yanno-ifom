import type { TrackType, VersionManaged } from './annotation.type';

export type AuthResponse = {
	account_id: number;
};

export type MeResponse = {
	id: number;
	email: string;
	name: string;
	created_at: string;
	updated_at: string;
	preferences: Record<string, unknown>;
};

/** Another user, as the API lists them. */
export type UserSummary = {
	id: number;
	email: string;
	name: string;
};

export type ProjectRole = 'viewer' | 'editor' | 'owner';
/** Projects are shared with viewers and editors; the owner is never a member. */
export type MemberRole = Exclude<ProjectRole, 'owner'>;

export type ProjectMember = {
	account: UserSummary;
	role: MemberRole;
	created_at: Date;
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

export type Project = {
	id: string; // UUID
	name: string;
	owner: UserSummary;
	/** The current user's role in the project. */
	role: ProjectRole;
	video_config: VideoConfig;
	video_metadata: VideoMetadata;
	versions: ProjectVersion[];
	created_at: Date;
	updated_at: Date;
};

export type CreateProjectVersionBody = {
	name: string;
	data?: VersionManaged<TrackType[]>; // Optional import
};

export type CopyProjectVersionBody = Pick<CreateProjectVersionBody, 'name'>;

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

export type EditLock = {
	editing: boolean;
	holder: { name: string; you: boolean; since: number; last_save: number | null } | null;
	steal: { name: string; deadline: number; mine: boolean } | null;
};
