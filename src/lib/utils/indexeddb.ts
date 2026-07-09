import Dexie, { type Table } from 'dexie';
import type { VideoConfig, VideoMetadata } from '$lib/types/api.type';

export type DBProject = {
	id?: number;
	name: string;
	video_config: VideoConfig;
	video_metadata?: VideoMetadata;
	annotation: Blob; // gzip compressed json
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
}

export const localProjectsDb = new LocalProjectsDB();
