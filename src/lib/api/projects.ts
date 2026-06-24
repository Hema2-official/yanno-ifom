import { http, BASE_URL } from './kyConfig';
import type { Options } from 'ky';
import type {
	CreateProjectVersionBody,
	EnqueueTaskBody,
	Project,
	ProjectVersion,
	ServerTask,
	VideoColor
} from '$lib/types/api.type';
import { handleError } from './errors';
import type { TrackType, VersionManaged } from '$lib/types/annotation.type';

function fixDates<T extends { created_at?: string | Date; updated_at?: string | Date }>(raw: T): T {
	return {
		...raw,
		created_at: raw.created_at ? new Date(raw.created_at) : undefined,
		updated_at: raw.updated_at ? new Date(raw.updated_at) : undefined
	};
}

export async function getProjects(options?: Options) {
	try {
		const data = await http.get<Project[]>(`api/v0/projects`, options);
		return data.map(fixDates);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function createProject(name: string, options?: Options) {
	try {
		const data = await http.post<Project>(`api/v0/projects`, { ...options, json: { name } });
		return fixDates(data);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function getProject(project_id: string, options?: Options) {
	try {
		const data = await http.get<Project>(`api/v0/projects/${project_id}`, options);
		return fixDates(data);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function updateProject(
	project_id: string,
	body: { name?: string; color?: VideoColor; channel_period?: number; start_period?: number },
	options?: Options
) {
	try {
		const data = await http.patch<Project>(`api/v0/projects/${project_id}`, {
			...options,
			json: body
		});
		return fixDates(data);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function deleteProject(project_id: string, options?: Options) {
	try {
		await http.delete(`api/v0/projects/${project_id}`, options);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function uploadVideo(project_id: string, file: File, options?: Options) {
	try {
		const formData = new FormData();
		formData.append('file', file);
		await http.post(`api/v0/projects/${project_id}/video`, {
			...options,
			body: formData
		});
	} catch (error) {
		throw await handleError(error);
	}
}

export async function downloadVideo(project_id: string, options?: Options) {
	try {
		return await http.blob(`api/v0/projects/${project_id}/video`, options);
	} catch (error) {
		throw await handleError(error);
	}
}

export function getWebFrameUrl(project: Project, frame_index: number) {
	if (!Number.isInteger(frame_index)) throw new Error('Frame index must be an integer');
	if (frame_index < 0) throw new Error('Frame index must be positive');
	if (frame_index >= project.frame_count) throw new Error('Frame index is out of range');
	return `${BASE_URL}api/v0/projects/${project.id}/web_frames/${frame_index}`;
}

export async function downloadWebFrame(project: Project, frame_index: number, options?: Options) {
	try {
		return await http.blob(getWebFrameUrl(project, frame_index), options);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function createProjectVersion(
	project_id: string,
	body: CreateProjectVersionBody,
	options?: Options
) {
	try {
		const data = await http.post<ProjectVersion>(`api/v0/projects/${project_id}/versions`, {
			...options,
			json: body
		});
		return fixDates(data);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function copyProjectVersion(
	version: ProjectVersion,
	body: CreateProjectVersionBody,
	options?: Options
) {
	try {
		const data = await http.post<ProjectVersion>(
			`api/v0/projects/${version.project_id}/versions/${version.id}/copy`,
			{ ...options, json: body }
		);
		return data;
	} catch (error) {
		throw await handleError(error);
	}
}

export async function getVersionData(version: ProjectVersion, options?: Options) {
	try {
		return await http.get<VersionManaged<TrackType[]>>(
			`api/v0/projects/${version.project_id}/versions/${version.id}/data`,
			options
		);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function updateVersionData(
	version: ProjectVersion,
	data: VersionManaged<TrackType[]>,
	options?: Options
) {
	try {
		await http.patch(`api/v0/projects/${version.project_id}/versions/${version.id}/data`, {
			...options,
			json: data
		});
	} catch (error) {
		throw await handleError(error);
	}
}

export async function deleteVersion(version: ProjectVersion, options?: Options) {
	try {
		await http.delete(`api/v0/projects/${version.project_id}/versions/${version.id}`, options);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function enqueueTask(
	version: ProjectVersion,
	body: EnqueueTaskBody,
	options?: Options
) {
	try {
		return await http.post<ServerTask>(
			`api/v0/projects/${version.project_id}/versions/${version.id}/enqueue`,
			{ ...options, json: body }
		);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function getTaskStatus(version: ProjectVersion, options?: Options) {
	try {
		return await http.get<ServerTask>(
			`api/v0/projects/${version.project_id}/versions/${version.id}/status`,
			options
		);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function cancelTask(version: ProjectVersion, options?: Options) {
	try {
		return await http.post<ServerTask>(
			`api/v0/projects/${version.project_id}/versions/${version.id}/cancel`,
			options
		);
	} catch (error) {
		throw await handleError(error);
	}
}
