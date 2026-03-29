import axios from './axiosConfig';
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
		const response = await axios.get<Project[]>(`projects`);
		return response.data.map(fixDates);
	} catch (error) {
		handleError(error);
	}
}

export async function createProject(name: string) {
	try {
		const response = await axios.post<Project>(`projects`, { name });
		return fixDates(response.data);
	} catch (error) {
		handleError(error);
	}
}

export async function getProject(project_id: string) {
	try {
		const response = await axios.get<Project>(`projects/${project_id}`);
		return fixDates(response.data);
	} catch (error) {
		handleError(error);
	}
}

export async function updateProject(
	project_id: string,
	body: { name?: string; color?: VideoColor; channel_period?: number; start_period?: number }
) {
	try {
		const response = await axios.patch<Project>(`projects/${project_id}`, body);
		return fixDates(response.data);
	} catch (error) {
		handleError(error);
	}
}

export async function deleteProject(project_id: string) {
	try {
		await axios.delete(`projects/${project_id}`);
	} catch (error) {
		handleError(error);
	}
}

export async function uploadSourceData(project_id: string, file: File) {
	try {
		const formData = new FormData();
		formData.append('file', file);
		await axios.postForm(`projects/${project_id}/source_data`, formData);
	} catch (error) {
		handleError(error);
	}
}

export async function downloadSourceData(project_id: string) {
	try {
		const response = await axios.get<Blob>(`projects/${project_id}/source_data`, {
			responseType: 'blob'
		});
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function downloadEditorData(project_id: string) {
	try {
		const response = await axios.get<Blob>(`projects/${project_id}/editor_data`, {
			responseType: 'blob'
		});
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export function getWebFrameUrl(project: Project, frame_index: number) {
	if (!Number.isInteger(frame_index)) throw new Error('Frame index must be an integer');
	if (frame_index < 0) throw new Error('Frame index must be positive');
	if (frame_index >= project.frame_count) throw new Error('Frame index is out of range');
	return axios.getUri({ url: `/projects/${project.id}/web_frames/${frame_index}` });
}

export async function downloadWebFrame(project: Project, frame_index: number) {
	try {
		const response = await axios.get<Blob>(getWebFrameUrl(project, frame_index), {
			responseType: 'blob'
		});
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function createProjectVersion(project_id: string, body: CreateProjectVersionBody) {
	try {
		const response = await axios.post<ProjectVersion>(`projects/${project_id}/versions`, body);
		return fixDates(response.data);
	} catch (error) {
		handleError(error);
	}
}

export async function copyProjectVersion(version: ProjectVersion, body: CreateProjectVersionBody) {
	try {
		const response = await axios.post<ProjectVersion>(
			`projects/${version.project_id}/versions/${version.id}/copy`,
			body
		);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function getVersionData(version: ProjectVersion, as_attachment: boolean = false) {
	try {
		const response = await axios.get<VersionManaged<TrackType[]>>(
			`projects/${version.project_id}/versions/${version.id}/data`,
			{ params: { as_attachment } }
		);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function updateVersionData(version: ProjectVersion, data: BlobPart) {
	try {
		const blob = new Blob([data], { type: 'application/json' });
		const formData = new FormData();
		formData.append('data', blob, 'data.json');
		const response = await axios.patch(
			`projects/${version.project_id}/versions/${version.id}`,
			formData,
			{
				headers: {
					'Content-Type': 'multipart/form-data'
				}
			}
		);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function deleteVersion(version: ProjectVersion) {
	try {
		await axios.delete(`projects/${version.project_id}/versions/${version.id}`);
	} catch (error) {
		handleError(error);
	}
}

export async function enqueueTask(version: ProjectVersion, body: EnqueueTaskBody) {
	try {
		const response = await axios.post<ServerTask>(
			`projects/${version.project_id}/versions/${version.id}/enqueue`,
			body
		);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function cancelTask(version: ProjectVersion) {
	try {
		const response = await axios.post<ServerTask>(
			`projects/${version.project_id}/versions/${version.id}/cancel`
		);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}
