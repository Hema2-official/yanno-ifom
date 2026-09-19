import {
	createProject,
	createProjectVersion,
	getProject,
	getVersionData,
	getWebFrameUrl,
	updateVersionData
} from '$lib/api/projects';
import {
	annotationDataSchema,
	type TrackType,
	type VersionManaged
} from '$lib/types/annotation.type';
import type {
	Project,
	ProjectVersion,
	VideoChannelMetadata,
	VideoConfig,
	VideoMetadata
} from '$lib/types/api.type';
import {
	compressJson,
	decompressJson,
	localProjectsDb,
	type DBProject
} from '$lib/utils/indexeddb';
import { WebPConverter } from '$lib/utils/webp';
import { ensureFrameServiceWorkerReady, getLocalFrameUrl } from '$lib/workers/frameServiceWorker';
import { annotationState, stateBefore } from './AnnotationState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';
import { getFrameCount, getImageIndex } from '$lib/utils/frames';
import { extractError } from '$lib/api/errors';
import { toast } from 'svelte-sonner';
import * as geotiff from 'geotiff';

class ProjectState {
	cloudProject: Project | null = $state(null);
	cloudVersion: ProjectVersion | null = $state(null);

	localProject: DBProject | null = $state(null);

	isSaving = $state(false);
	saveError: string | null = $state(null);

	private saveQueue: Promise<void> = Promise.resolve();

	// Derived values for ease of use
	name: string | undefined = $derived(this.cloudProject?.name ?? this.localProject?.name);
	versionName: string | undefined = $derived(this.cloudVersion?.name);
	videoConfig: VideoConfig | undefined = $derived(
		this.cloudProject?.video_config ?? this.localProject?.video_config
	);
	videoMetadata: VideoMetadata | undefined = $derived(
		this.cloudProject?.video_metadata ?? this.localProject?.video_metadata
	);
	frameCount = $derived(getFrameCount(this.videoConfig, this.videoMetadata));

	getChannelFrameUrl(frameIndex: number, channelIndex: number): string | null {
		const imageIndex = getImageIndex(this.videoConfig, frameIndex, channelIndex);
		const imageCount = this.videoMetadata?.frame_count;
		if (imageCount !== undefined && imageIndex >= imageCount) return null;
		if (this.cloudProject) {
			return getWebFrameUrl(this.cloudProject, imageIndex);
		} else if (this.localProject?.id) {
			return getLocalFrameUrl(this.localProject.id, imageIndex);
		}
		throw new Error('No project loaded');
	}

	saveData(data: VersionManaged<TrackType[]>): Promise<void> {
		const { cloudVersion, localProject } = this;
		const save = this.saveQueue.then(() =>
			this.writeData(data, cloudVersion, localProject?.id)
		);
		this.saveQueue = save.catch(() => {});
		return save;
	}

	private async writeData(
		data: VersionManaged<TrackType[]>,
		version: ProjectVersion | null,
		localProjectId: number | undefined
	) {
		try {
			this.isSaving = true;

			if (version) {
				await updateVersionData(version, $state.snapshot(data));
			} else if (localProjectId) {
				await localProjectsDb.projects.update(localProjectId, {
					annotation: await compressJson(data)
				});
			} else {
				throw new Error('No project loaded');
			}

			this.saveError = null;
		} catch (error) {
			this.saveError = extractError(error);
			throw error;
		} finally {
			this.isSaving = false;
		}
	}

	#clearStates() {
		this.cloudProject = null;
		this.cloudVersion = null;
		this.localProject = null;
		this.saveError = null;
		annotationState.load(null);
		annotationState.currentFrameIndex = 0;
		videoDisplayState.concurrentFrames = 1;
	}

	async loadCloudProject(projectId: string, versionId: string) {
		this.#clearStates();

		// Get project from server
		const project = await getProject(projectId);
		const version = project.versions.find((v) => v.id === versionId);
		if (!version) throw new Error("Couldn't find version in project");

		this.cloudProject = project;
		this.cloudVersion = version;

		// Check if it is ready
		if (!version.ready) throw new Error('Version is not ready');

		// Get version data from server
		const versionData = await getVersionData(version);
		annotationState.load(versionData);
	}

	async loadLocalProject(localProjectId: number) {
		this.#clearStates();

		// Wait for the local frame service worker to initialize
		await ensureFrameServiceWorkerReady();

		// Load project from indexeddb
		const project = await localProjectsDb.projects.get(localProjectId);
		if (!project) throw new Error("Couldn't find project");
		this.localProject = project;

		annotationState.load(await decompressJson(project.annotation));
	}

	async createCloudProject(
		name: string,
		video_config: VideoConfig,
		videoFile: File,
		annotationFile: File | null,
		onProgress?: (message: string) => void
	) {
		onProgress?.('Uploading video...');
		const project = await createProject(name, videoFile, video_config);

		if (annotationFile) {
			onProgress?.('Importing annotation...');
			// The project exists already: report the failed import, but keep the project
			await importAnnotation(project.id, annotationFile).catch((error: unknown) => {
				toast.error('Annotation import failed', { description: extractError(error) });
			});
		}
		return project.id;
	}

	async createLocalProject(
		name: string,
		video_config: VideoConfig,
		videoFile: File,
		annotationFile: File | null,
		onProgress?: (message: string) => void
	) {
		onProgress?.('Saving annotation...');
		const annotation = await compressJson(
			annotationFile ? await readAnnotationFile(annotationFile) : { current: [], changes: [] }
		);

		// Save project to indexeddb and get auto-incremented ID
		const projectId = await localProjectsDb.projects.add({ name, video_config, annotation });

		try {
			await this.#storeLocalFrames(projectId, video_config, videoFile, onProgress);
		} catch (error) {
			// Don't leave a half-converted project behind
			await localProjectsDb.deleteProject(projectId);
			throw error;
		}
		return projectId;
	}

	async #storeLocalFrames(
		projectId: number,
		video_config: VideoConfig,
		videoFile: File,
		onProgress?: (message: string) => void
	) {
		// Open TIFF and get image count
		const tiff = await geotiff.fromBlob(videoFile);
		const count = await tiff.getImageCount();

		// Report 0 progress
		onProgress?.(`Converting video...`);

		const webpConverter = new WebPConverter();

		const videoMetadata: VideoMetadata = {
			frame_count: count,
			width: 0,
			height: 0,
			channels: Array.from({ length: video_config.channel_period }, () => ({
				r: { min_value: 255, max_value: 0 },
				g: { min_value: 255, max_value: 0 },
				b: { min_value: 255, max_value: 0 }
			}))
		};

		function processStats(channelIndex: number, stats: VideoChannelMetadata) {
			for (const c of ['r', 'g', 'b'] as const) {
				if (stats[c].min_value < videoMetadata.channels[channelIndex][c].min_value)
					videoMetadata.channels[channelIndex][c].min_value = stats[c].min_value;
				if (stats[c].max_value > videoMetadata.channels[channelIndex][c].max_value)
					videoMetadata.channels[channelIndex][c].max_value = stats[c].max_value;
			}
		}

		for (let i = 0; i < count; i++) {
			const image = await tiff.getImage(i);
			if (i === 0) {
				videoMetadata.width = image.getWidth();
				videoMetadata.height = image.getHeight();
			}

			// Convert to WebP blob
			const webpImageBlob = await webpConverter.tiffImageToWebP(image, {
				statisticsCallback: (stats) => processStats(i % video_config.channel_period, stats)
			});

			// Store frame blob in IndexedDB
			const dbFrame = { projectId, frameId: i, image: webpImageBlob };
			await localProjectsDb.frames.add(dbFrame);

			// Update progress
			onProgress?.(`Converting video... (${i + 1}/${count})`);
		}

		// Save the computed video metadata
		await localProjectsDb.projects.update(projectId, { video_metadata: videoMetadata });
	}

	async listLocalProjects(): Promise<DBProject[]> {
		return await localProjectsDb.projects.toArray();
	}

	async renameLocalProject(localProjectId: number, name: string) {
		await localProjectsDb.projects.update(localProjectId, { name });
	}

	async deleteLocalProject(localProjectId: number) {
		await localProjectsDb.deleteProject(localProjectId);
	}
}

/** Creates a version named after the file and fills it with the file's annotation. */
async function importAnnotation(projectId: string, file: File) {
	const name = file.name.replace(/\.json$/i, '') + ' (imported)';
	const version = await createProjectVersion(projectId, { name });
	await updateVersionData(version, await readAnnotationFile(file));
}

async function readAnnotationFile(file: File): Promise<VersionManaged<TrackType[]>> {
	const parsed: unknown = JSON.parse(await file.text());
	const result = annotationDataSchema.safeParse(
		Array.isArray(parsed) ? { current: parsed, changes: [] } : parsed
	);
	if (!result.success) {
		const [{ path, message }] = result.error.issues;
		throw new Error(`Invalid annotation file at ${path.join('.') || 'root'}: ${message}`);
	}

	try {
		// The history must apply cleanly
		stateBefore(result.data, result.data.changes.length);
	} catch (error) {
		throw new Error(`Invalid change history: ${extractError(error)}`);
	}
	return result.data;
}

export const projectState = new ProjectState();
