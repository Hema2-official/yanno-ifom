import axios from './axiosConfig';
import type {
	InheritanceParams,
	Project,
	ProjectVersion,
	SegmentationParams,
	TrackingParams,
	VideoColor
} from '$lib/types/api.type';
import { handleError } from './errors';
import type { TrackType, VersionManaged } from '$lib/types/annotation.type';

export async function getProjects() {
	try {
		const response = await axios.get<Project[]>(`projects`);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function createProject(name: string) {
	try {
		const response = await axios.post<Project>(`projects`, { name });
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function getProject(project_id: string) {
	try {
		const response = await axios.get<Project>(`projects/${project_id}`);
		return response.data;
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
		return response.data;
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
		const response = await axios.get<Blob>(`projects/${project_id}/source_data`);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function downloadEditorData(project_id: string) {
	try {
		const response = await axios.get<Blob>(`projects/${project_id}/editor_data`);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function createProjectVersion(
	project_id: string,
	name: string,
	parameters: SegmentationParams | TrackingParams | InheritanceParams,
	source_version_id?: string
) {
	try {
		const response = await axios.post<ProjectVersion>(`projects/${project_id}/versions`, {
			name,
			source_version_id,
			parameters
		});
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function copyProjectVersion(project_id: string, version_id: string) {
	try {
		const response = await axios.post<ProjectVersion>(
			`projects/${project_id}/versions/${version_id}/copy`
		);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}

export async function getVersionData(
	project_id: string,
	version_id: string,
	as_attachment: boolean = false
) {
	try {
		const response = await axios.get<Blob>(
			`projects/${project_id}/versions/${version_id}/data`,
			{ params: { as_attachment } }
		);

		// Use Response.json() to read and parse the blob
		return (await new Response(response.data).json()) as VersionManaged<TrackType[]>;
	} catch (error) {
		handleError(error);
	}
}

export async function updateVersionData(project_id: string, version_id: string, data: BlobPart) {
	try {
		const blob = new Blob([data], { type: 'application/json' });
		const formData = new FormData();
		formData.append('data', blob, 'data.json');
		const response = await axios.patch(
			`projects/${project_id}/versions/${version_id}`,
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

export async function deleteVersion(project_id: string, version_id: string) {
	try {
		await axios.delete(`projects/${project_id}/versions/${version_id}`);
	} catch (error) {
		handleError(error);
	}
}
