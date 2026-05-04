import { http, BASE_URL } from './kyConfig';
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

export async function getProjects() {
	try {
		const data = await http.get<Project[]>(`projects`);
		return data.map(fixDates);
	} catch (error) {
		await handleError(error);
	}
}

export async function createProject(name: string) {
	try {
		const data = await http.post<Project>(`projects`, { json: { name } });
		return fixDates(data);
	} catch (error) {
		await handleError(error);
	}
}

export async function getProject(project_id: string) {
	try {
		const data = await http.get<Project>(`projects/${project_id}`);
		return fixDates(data);
	} catch (error) {
		await handleError(error);
	}
}

export async function updateProject(
	project_id: string,
	body: { name?: string; color?: VideoColor; channel_period?: number; start_period?: number }
) {
	try {
		const data = await http.patch<Project>(`projects/${project_id}`, { json: body });
		return fixDates(data);
	} catch (error) {
		await handleError(error);
	}
}

export async function deleteProject(project_id: string) {
	try {
		await http.delete(`projects/${project_id}`);
	} catch (error) {
		await handleError(error);
	}
}

export async function uploadSourceData(project_id: string, file: File) {
	try {
		const formData = new FormData();
		formData.append('file', file);
		await http.post(`projects/${project_id}/source_data`, { body: formData });
	} catch (error) {
		await handleError(error);
	}
}

export async function downloadSourceData(project_id: string) {
	try {
		return await http.blob(`projects/${project_id}/source_data`);
	} catch (error) {
		await handleError(error);
	}
}

export async function downloadEditorData(project_id: string) {
	try {
		return await http.blob(`projects/${project_id}/editor_data`);
	} catch (error) {
		await handleError(error);
	}
}

export function getWebFrameUrl(project: Project, frame_index: number) {
	if (!Number.isInteger(frame_index)) throw new Error('Frame index must be an integer');
	if (frame_index < 0) throw new Error('Frame index must be positive');
	if (frame_index >= project.frame_count) throw new Error('Frame index is out of range');
	return `${BASE_URL}projects/${project.id}/web_frames/${frame_index}`;
}

export async function downloadWebFrame(project: Project, frame_index: number) {
	try {
		return await http.blob(getWebFrameUrl(project, frame_index));
	} catch (error) {
		await handleError(error);
	}
}

export async function createProjectVersion(project_id: string, body: CreateProjectVersionBody) {
	try {
		const data = await http.post<ProjectVersion>(`projects/${project_id}/versions`, {
			json: body
		});
		return fixDates(data);
	} catch (error) {
		await handleError(error);
	}
}

export async function copyProjectVersion(version: ProjectVersion, body: CreateProjectVersionBody) {
	try {
		const data = await http.post<ProjectVersion>(
			`projects/${version.project_id}/versions/${version.id}/copy`,
			{ json: body }
		);
		return data;
	} catch (error) {
		await handleError(error);
	}
}

export async function getVersionData(version: ProjectVersion, as_attachment: boolean = false) {
	try {
		const url = new URL(`projects/${version.project_id}/versions/${version.id}/data`, BASE_URL);
		if (as_attachment) url.searchParams.append('as_attachment', 'true');
		const data = await http.get<VersionManaged<TrackType[]>>(url.pathname + url.search);
		return data;
	} catch (error) {
		await handleError(error);
	}
}

export async function updateVersionData(version: ProjectVersion, data: BlobPart) {
	try {
		const blob = new Blob([data], { type: 'application/json' });
		const formData = new FormData();
		formData.append('data', blob, 'data.json');
		return await http.patch(`projects/${version.project_id}/versions/${version.id}`, {
			body: formData
		});
	} catch (error) {
		await handleError(error);
	}
}

export async function deleteVersion(version: ProjectVersion) {
	try {
		await http.delete(`projects/${version.project_id}/versions/${version.id}`);
	} catch (error) {
		await handleError(error);
	}
}

export async function enqueueTask(version: ProjectVersion, body: EnqueueTaskBody) {
	try {
		return await http.post<ServerTask>(
			`projects/${version.project_id}/versions/${version.id}/enqueue`,
			{
				json: body
			}
		);
	} catch (error) {
		await handleError(error);
	}
}

export async function cancelTask(version: ProjectVersion) {
	try {
		return await http.post<ServerTask>(
			`projects/${version.project_id}/versions/${version.id}/cancel`
		);
	} catch (error) {
		await handleError(error);
	}
}
