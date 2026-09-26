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
	CreateProjectVersionBody,
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
import { editorState } from './EditorState.svelte';
import { editSession } from './EditSessionState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';
import { getFrameCount, getImageIndex } from '$lib/utils/frames';
import { extractError, toastError } from '$lib/api/errors';
import * as geotiff from 'geotiff';

export type ProgressCallback = (message: string, fraction?: number) => void;

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
	// Viewers never edit, editors only while their session holds the version's lock
	readOnly = $derived(!!this.cloudProject && !editSession.canEdit);

	getChannelFrameUrl(frameIndex: number, channelIndex: number): string | null {
		const imageIndex = getImageIndex(this.videoConfig, frameIndex, channelIndex);
		const imageCount = this.videoMetadata?.frame_count;
		if (imageCount !== undefined && imageIndex >= imageCount) return null;
		if (this.cloudProject) {
			return getWebFrameUrl(this.cloudProject, imageIndex);
		} else if (this.localProject?.id) {
			return getLocalFrameUrl(this.localProject.id, imageIndex);
		}
		return null; // no project loaded (e.g. while switching)
	}

	saveData(data: VersionManaged<TrackType[]>): Promise<void> {
		const { cloudVersion, localProject } = this;
		// The session that made the change saves it, even once it has let go of the lock
		const sessionId = editSession.sessionId;
		const save = this.saveQueue.then(() =>
			this.writeData(data, cloudVersion, localProject?.id, sessionId)
		);
		this.saveQueue = save.catch(() => {});
		return save;
	}

	/** Resolves once the pending saves are through. */
	idle(): Promise<void> {
		return this.saveQueue;
	}

	private async writeData(
		data: VersionManaged<TrackType[]>,
		version: ProjectVersion | null,
		localProjectId: number | undefined,
		sessionId: string | null
	) {
		try {
			this.isSaving = true;

			if (version) {
				await updateVersionData(version, $state.snapshot(data), {
					headers: sessionId ? { 'X-Edit-Session': sessionId } : undefined
				});
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
		void editSession.stop();
		this.cloudProject = null;
		this.cloudVersion = null;
		this.localProject = null;
		this.saveError = null;
		annotationState.load(null);
		annotationState.currentFrameIndex = 0;
		editorState.reset();
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

		// Editors hold the version's edit lock while they edit; the data comes after, so it's current
		if (project.role !== 'viewer') await editSession.start(version);

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
		onProgress?: ProgressCallback
	) {
		// Check annotation before doing anything else
		const imported: CreateProjectVersionBody | null = annotationFile && {
			name: annotationFile.name.replace(/\.json$/i, '') + ' (imported)',
			data: await readAnnotationFile(annotationFile)
		};

		onProgress?.('Uploading video...');
		const project = await createProject(name, videoFile, video_config, {
			onUploadProgress: ({ percent }) =>
				percent < 1
					? onProgress?.('Uploading video...', percent)
					: onProgress?.('Processing video...')
		});

		if (imported) {
			onProgress?.('Importing annotation...');
			// The project exists already: report the failed import, but keep the project
			await createProjectVersion(project.id, imported).catch((error: unknown) => {
				toastError('Annotation import failed', error);
			});
		}
		return project.id;
	}

	async createLocalProject(
		name: string,
		video_config: VideoConfig,
		videoFile: File,
		annotationFile: File | null,
		onProgress?: ProgressCallback
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
		onProgress?: ProgressCallback
	) {
		// Open TIFF and get image count
		const tiff = await geotiff.fromBlob(videoFile);
		const count = await tiff.getImageCount();

		// Report 0 progress
		onProgress?.('Converting video...', 0);

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
			onProgress?.(`Converting video... (${i + 1}/${count})`, (i + 1) / count);
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

export async function readAnnotationFile(file: File): Promise<VersionManaged<TrackType[]>> {
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
