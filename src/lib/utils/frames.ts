import type { Project } from '$lib/types/api.type';

/**
 * Calculates the number of primary frames in a video.
 */
export function getPrimaryFrameCount(project: Project): number {
	if (project.channel_period <= 0) return 0;
	if (project.frame_count <= project.start_period) return 0;
	return Math.ceil((project.frame_count - project.start_period) / project.channel_period);
}

/**
 * Checks if a frame index marks a primary frame.
 */
export function isPrimaryFrame(project: Project, index: number): boolean {
	if (project.channel_period <= 0) return false;
	return (
		index >= project.start_period &&
		(index - project.start_period) % project.channel_period === 0
	);
}
