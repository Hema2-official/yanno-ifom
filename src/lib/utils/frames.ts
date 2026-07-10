import type { Project } from '$lib/types/api.type';

/**
 * Calculates the number of primary frames in a video.
 */
export function getPrimaryFrameCount(project: Project): number {
	if (!project.video_config || project.video_config.channel_period <= 0) return 0;
	const frameCount = project.video_metadata?.frame_count ?? 0;
	if (frameCount <= project.video_config.start_period) return 0;
	return Math.ceil(
		(frameCount - project.video_config.start_period) / project.video_config.channel_period
	);
}

/**
 * Checks if a frame index marks a primary frame.
 */
export function isPrimaryFrame(project: Project, index: number): boolean {
	if (!project.video_config || project.video_config.channel_period <= 0) return false;
	return (
		index >= project.video_config.start_period &&
		(index - project.video_config.start_period) % project.video_config.channel_period === 0
	);
}
