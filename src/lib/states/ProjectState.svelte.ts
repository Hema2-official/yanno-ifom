import { getProject, getVersionData, getWebFrameUrl, updateVersionData } from '$lib/api/projects';
import type { TrackType, VersionManaged } from '$lib/types/annotation.type';
import type { Project, ProjectVersion, VideoColor } from '$lib/types/api.type';
import { localProjectsDb, type DBProject } from '$lib/utils/indexeddb';
import { WebPConverter } from '$lib/utils/webp';
import { ensureFrameServiceWorkerReady, getLocalFrameUrl } from '$lib/workers/frameServiceWorker';
import { annotationState } from './AnnotationState.svelte';
import * as geotiff from 'geotiff';

class ProjectState {
	cloudProject: Project | null = $state(null);
	cloudVersion: ProjectVersion | null = $state(null);

	localProject: DBProject | null = $state(null);

	isSaving = $state(false);

	// Derived values for ease of use
	name: string | undefined = $derived(this.cloudProject?.name ?? this.localProject?.name);
	versionName: string | undefined = $derived(this.cloudVersion?.name);
	color: VideoColor | undefined = $derived(this.cloudProject?.color ?? this.localProject?.color);
	channelPeriod: number | undefined = $derived(
		this.cloudProject?.channel_period ?? this.localProject?.channelPeriod
	);
	startPeriod: number | undefined = $derived(
		this.cloudProject?.start_period ?? this.localProject?.startPeriod
	);
	currentFrameUrl = $derived(this.getFrameUrl(annotationState.currentFrameId));

	getFrameUrl(frameId: number): string {
		if (this.cloudProject) {
			return getWebFrameUrl(this.cloudProject, frameId);
		} else if (this.localProject?.id) {
			return getLocalFrameUrl(this.localProject.id, frameId);
		}
		throw new Error('No project loaded');
	}

	async saveData(data: VersionManaged<TrackType[]>) {
		if (!(this.cloudProject && this.cloudVersion) || !this.localProject?.id)
			throw new Error('No project loaded');

		try {
			this.isSaving = true;

			if (this.cloudProject) {
				await updateVersionData(this.cloudVersion, $state.snapshot(data));
			} else {
				const cs = new Blob([JSON.stringify(data)])
					.stream()
					.pipeThrough(new CompressionStream('gzip'));
				await localProjectsDb.projects.update(this.localProject.id, {
					annotation: await new Response(cs).blob()
				});
			}
		} finally {
			this.isSaving = false;
		}
	}

	#clearStates() {
		this.cloudProject = null;
		this.cloudVersion = null;
		this.localProject = null;
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
		color: VideoColor,
		channelPeriod: number,
		startPeriod: number,
		videoFile: File,
		annotationFile: File,
		onProgress?: (message: string) => void
	) {
		// Compress the annotation
		onProgress?.('Saving annotation...');
		const cs = annotationFile.stream().pipeThrough(new CompressionStream('gzip'));
		const annotation = await new Response(cs).blob();

		// Save project to indexeddb and get auto-incremented ID
		const projectId = await localProjectsDb.projects.add({
			name,
			color,
			channelPeriod,
			startPeriod,
			annotation
		});

		// Open TIFF and get image count
		const tiff = await geotiff.fromBlob(videoFile);
		const count = await tiff.getImageCount();

		// Report 0 progress
		onProgress?.(`Converting video...`);

		const webpConverter = new WebPConverter();

		for (let i = 0; i < count; i++) {
			// Convert to WebP blob
			const webpImageBlob = await webpConverter.tiffImageToWebP(await tiff.getImage(i));

			// Store frame blob in IndexedDB
			await localProjectsDb.frames.add({
				projectId,
				frameId: i,
				image: webpImageBlob
			});

			// Update progress
			onProgress?.(`Converting video... (${i + 1}/${count})`);
		}
	}

	async listLocalProjects(): Promise<DBProject[]> {
		return await localProjectsDb.projects.toArray();
	}
}

export const projectState = new ProjectState();
