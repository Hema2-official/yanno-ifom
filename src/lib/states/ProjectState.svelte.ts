import { getProject, getVersionData, getWebFrameUrl, updateVersionData } from '$lib/api/projects';
import type { TrackType, VersionManaged } from '$lib/types/annotation.type';
import type {
	Project,
	ProjectVersion,
	VideoChannelMetadata,
	VideoConfig,
	VideoMetadata
} from '$lib/types/api.type';
import { localProjectsDb, type DBProject } from '$lib/utils/indexeddb';
import { WebPConverter } from '$lib/utils/webp';
import { ensureFrameServiceWorkerReady, getLocalFrameUrl } from '$lib/workers/frameServiceWorker';
import { annotationState } from './AnnotationState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';
import { getFrameCount, getImageIndex } from '$lib/utils/frames';
import { extractError } from '$lib/api/errors';
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
		const save = this.saveQueue.then(() => this.writeData(data));
		this.saveQueue = save.catch(() => {});
		return save;
	}

	private async writeData(data: VersionManaged<TrackType[]>) {
		try {
			this.isSaving = true;

			if (this.cloudProject && this.cloudVersion) {
				await updateVersionData(this.cloudVersion, $state.snapshot(data));
			} else if (this.localProject?.id) {
				const cs = new Blob([JSON.stringify(data)])
					.stream()
					.pipeThrough(new CompressionStream('gzip'));
				await localProjectsDb.projects.update(this.localProject.id, {
					annotation: await new Response(cs).blob()
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
		annotationState.data = versionData;
	}

	async loadLocalProject(localProjectId: number) {
		this.#clearStates();

		// Wait for the local frame service worker to initialize
		await ensureFrameServiceWorkerReady();

		// Load project from indexeddb
		const project = await localProjectsDb.projects.get(localProjectId);
		if (!project) throw new Error("Couldn't find project");
		this.localProject = project;

		// Decompress annotation json
		const ds = project.annotation.stream().pipeThrough(new DecompressionStream('gzip'));
		annotationState.data = await new Response(ds).json();
	}

	async prepareLocalProject(
		name: string,
		video_config: VideoConfig,
		videoFile: File,
		annotationFile: File,
		onProgress?: (message: string) => void
	) {
		// Compress the annotation
		onProgress?.('Saving annotation...');
		const cs = annotationFile.stream().pipeThrough(new CompressionStream('gzip'));
		const annotation = await new Response(cs).blob();

		// Save project to indexeddb and get auto-incremented ID
		const dbProject = { name, video_config: video_config, annotation };
		const projectId = await localProjectsDb.projects.add(dbProject);

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
}

export const projectState = new ProjectState();
