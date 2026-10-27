import Dexie, { type Table } from 'dexie';
import type { VideoConfig, VideoMetadata } from '$lib/types/api.type';

export type DBProject = {
	id?: number;
	name: string;
	video_config: VideoConfig;
	video_metadata?: VideoMetadata;
	annotation: Blob; // gzip compressed json
	/** The original video, which the fluorescence report measures. */
	video: Blob;
};

export type DBFrame = {
	projectId: number;
	frameId: number;
	image: Blob;
};

class LocalProjectsDB extends Dexie {
	projects!: Table<DBProject, number>;
	frames!: Table<DBFrame, [number, number]>;

	constructor() {
		super('LocalProjectsDB');
		this.version(1).stores({
			projects: '++id',
			frames: '[projectId+frameId]'
		});
	}

	/** Deletes a project together with its frames. */
	deleteProject(projectId: number) {
		return this.transaction('rw', this.projects, this.frames, async () => {
			await this.frames
				.where('[projectId+frameId]')
				.between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
				.delete();
			await this.projects.delete(projectId);
		});
	}
}

export const localProjectsDb = new LocalProjectsDB();

export async function readLocalFrame(projectId: number, imageIndex: number): Promise<Blob> {
	const frame = await localProjectsDb.frames.get([projectId, imageIndex]);
	if (!frame) throw new Error(`Image ${imageIndex} of local project ${projectId} isn't stored`);
	return frame.image;
}

export async function compressJson(value: unknown): Promise<Blob> {
	const stream = new Blob([JSON.stringify(value)])
		.stream()
		.pipeThrough(new CompressionStream('gzip'));
	return new Response(stream).blob();
}

export async function decompressJson<T>(blob: Blob): Promise<T> {
	const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
	return new Response(stream).json();
}
