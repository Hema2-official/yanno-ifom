import {
	annotationDataSchema,
	type TrackType,
	type VersionManaged
} from '$lib/types/annotation.type';
import type { VideoChannelMetadata, VideoConfig, VideoMetadata } from '$lib/types/api.type';
import {
	compressJson,
	decompressJson,
	localProjectsDb,
	readLocalFrame,
	type DBProject
} from '$lib/utils/indexeddb';
import { channelRanges, WebPConverter } from '$lib/utils/webp';
import { annotationState, stateBefore } from './AnnotationState.svelte';
import { editorState } from './EditorState.svelte';
import { frameCache } from './FrameCache.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';
import { zoomState } from './zoom.svelte';
import { getFrameCount, getImageIndex } from '$lib/utils/frames';
import { extractError } from '$lib/api/errors';
import * as geotiff from 'geotiff';

export type ProgressCallback = (message: string, fraction?: number) => void;

class ProjectState {
	localProject: DBProject | null = $state(null);

	saveError: string | null = $state(null);

	private saveQueue: Promise<void> = Promise.resolve();

	// Derived values for ease of use
	name: string | undefined = $derived(this.localProject?.name);
	videoConfig: VideoConfig | undefined = $derived(this.localProject?.video_config);
	videoMetadata: VideoMetadata | undefined = $derived(this.localProject?.video_metadata);
	frameCount = $derived(getFrameCount(this.videoConfig, this.videoMetadata));
	/** The loaded project, as the loader keys it for `frameCache` and `videoDisplayState`; null between projects. */
	key: string | null = $derived(this.localProject ? `local:${this.localProject.id}` : null);

	/** A frame's channel as an image of the video, as `frameCache` takes it; null past the end. */
	imageIndex(frameIndex: number, channelIndex: number): number | null {
		if (frameIndex < 0 || frameIndex >= this.frameCount) return null;
		const imageIndex = getImageIndex(this.videoConfig, frameIndex, channelIndex);
		const imageCount = this.videoMetadata?.frame_count;
		return imageCount !== undefined && imageIndex >= imageCount ? null : imageIndex;
	}

	#video: { key: string; tiff: Promise<geotiff.GeoTIFF> } | null = null;

	/** The original video at its own depth, read from the stored file. */
	openVideo(): Promise<geotiff.GeoTIFF> {
		const { key, localProject } = this;
		if (key === null || !localProject) return Promise.reject(new Error('No project is open'));
		if (this.#video?.key !== key) {
			const tiff = geotiff.fromBlob(localProject.video);
			// A failed opening is tried again next time
			tiff.catch(() => {
				if (this.#video?.tiff === tiff) this.#video = null;
			});
			this.#video = { key, tiff };
		}
		return this.#video.tiff;
	}

	saveData(data: VersionManaged<TrackType[]>): Promise<void> {
		const localProjectId = this.localProject?.id;
		const save = this.saveQueue.then(() => this.writeData(data, localProjectId));
		this.saveQueue = save.catch(() => {});
		return save;
	}

	/** Resolves once the pending saves are through. */
	idle(): Promise<void> {
		return this.saveQueue;
	}

	private async writeData(data: VersionManaged<TrackType[]>, localProjectId: number | undefined) {
		try {
			if (!localProjectId) throw new Error('No project loaded');
			await localProjectsDb.projects.update(localProjectId, {
				annotation: await compressJson(data)
			});
			this.saveError = null;
		} catch (error) {
			this.saveError = extractError(error);
			throw error;
		}
	}

	#clearStates() {
		this.localProject = null;
		this.#video = null;
		this.saveError = null;
		annotationState.load(null);
		annotationState.currentFrameIndex = 0;
		editorState.reset();
		videoDisplayState.reset();
		zoomState.scalePercent = zoomState.minScale;
	}

	async loadLocalProject(localProjectId: number, signal?: AbortSignal) {
		this.#clearStates();

		// Load project from indexeddb
		const project = await localProjectsDb.projects.get(localProjectId);
		signal?.throwIfAborted();
		if (!project) throw new Error("Couldn't find project");
		this.localProject = project;
		const key = `local:${localProjectId}`;
		frameCache.open(key, (imageIndex) => readLocalFrame(localProjectId, imageIndex));
		videoDisplayState.open(key);

		const annotation = await decompressJson<VersionManaged<TrackType[]>>(project.annotation);
		signal?.throwIfAborted();
		annotationState.load(annotation);
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
		const projectId = await localProjectsDb.projects.add({
			name,
			video_config,
			annotation,
			video: videoFile
		});

		try {
			await this.#storeLocalFrames(projectId, video_config, videoFile, onProgress);
		} catch (error) {
			// Don't leave a half-converted project behind
			await localProjectsDb.deleteProject(projectId);
			throw error;
		}
		// The browser holds the only copy, which it would otherwise clear when short of space
		void navigator.storage?.persist();
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

		// Deeper videos are stretched from each channel's own range
		onProgress?.('Reading video...', 0);
		const ranges = await channelRanges(tiff, video_config.channel_period, (done) =>
			onProgress?.(`Reading video... (${done}/${count})`, done / count)
		);

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
				statisticsCallback: (stats) => processStats(i % video_config.channel_period, stats),
				range: ranges?.[i % video_config.channel_period]
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
