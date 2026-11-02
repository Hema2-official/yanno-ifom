import { BASE_URL, http } from './kyConfig';
import type { Options } from 'ky';
import type {
	CopyProjectVersionBody,
	CreateProjectVersionBody,
	EnqueueTaskBody,
	MemberRole,
	Project,
	ProjectMember,
	ProjectVersion,
	ServerTask,
	VideoConfig
} from '$lib/types/api.type';
import { handleError } from './errors';
import { postFormData, type UploadOptions } from './upload';
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
		const data = await http.get<Project[]>(`api/v0/projects/`, options);
		return data.map(fixDates);
	} catch (error) {
		throw await handleError(error);
	}
}

/** Other users' projects shared with the current one. */
export async function getSharedProjects(options?: Options) {
	try {
		const data = await http.get<Project[]>(`api/v0/projects/shared`, options);
		return data.map(fixDates);
	} catch (error) {
		throw await handleError(error);
	}
}

/** Creates a project with a video. */
export async function createProject(
	name: string,
	file: File,
	videoConfig: VideoConfig,
	options?: UploadOptions
) {
	try {
		const formData = new FormData();
		formData.append('name', name);
		formData.append('file', file);
		formData.append('color', videoConfig.color);
		formData.append('start_period', String(videoConfig.start_period));
		formData.append('channel_period', String(videoConfig.channel_period));
		// Posted with XHR instead of ky so the upload can report progress
		const data = await postFormData<Project>(`api/v0/projects/`, formData, options);
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

export async function updateProject(projectId: string, body: { name: string }, options?: Options) {
	try {
		const data = await http.patch<Project>(`api/v0/projects/${projectId}`, {
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

export async function downloadVideo(project_id: string, options?: Options) {
	try {
		return await http.blob(`api/v0/projects/${project_id}/video`, options);
	} catch (error) {
		throw await handleError(error);
	}
}

/** Where the original video is, for reading it in ranges. */
export const videoUrl = (projectId: string) => `${BASE_URL}api/v0/projects/${projectId}/video`;

export async function downloadWebFrame(projectId: string, imageIndex: number, options?: Options) {
	try {
		return await http.blob(`api/v0/projects/${projectId}/web_frames/${imageIndex}`, options);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function createProjectVersion(
	projectId: string,
	body: CreateProjectVersionBody,
	options?: Options
) {
	try {
		const data = await http.post<ProjectVersion>(`api/v0/projects/${projectId}/versions`, {
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
	body: CopyProjectVersionBody,
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

/** The users a project is shared with (without its owner). */
export async function getMembers(projectId: string, options?: Options) {
	try {
		const data = await http.get<ProjectMember[]>(
			`api/v0/projects/${projectId}/members`,
			options
		);
		return data.map(fixDates);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function addMember(
	projectId: string,
	body: { account_id: number; role: MemberRole },
	options?: Options
) {
	try {
		const data = await http.post<ProjectMember>(`api/v0/projects/${projectId}/members`, {
			...options,
			json: body
		});
		return fixDates(data);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function updateMember(
	projectId: string,
	accountId: number,
	role: MemberRole,
	options?: Options
) {
	try {
		const data = await http.patch<ProjectMember>(
			`api/v0/projects/${projectId}/members/${accountId}`,
			{ ...options, json: { role } }
		);
		return fixDates(data);
	} catch (error) {
		throw await handleError(error);
	}
}

/** Stops sharing a project with a user; members can remove themselves to leave. */
export async function removeMember(projectId: string, accountId: number, options?: Options) {
	try {
		await http.delete(`api/v0/projects/${projectId}/members/${accountId}`, options);
	} catch (error) {
		throw await handleError(error);
	}
}
