import type { TrackType, VersionManaged } from '$lib/types/annotation.type';
import type { Check, TrackSummary } from '$lib/utils/reports';

/** What every page of the reports gets. */
export type ReportProps = {
	data: VersionManaged<TrackType[]>;
	tracks: TrackSummary[];
	checks: Check[];
	frameCount: number;
	/** The downloads' file name, without the extension. */
	name: string;
	/** Leaves the reports for the cells, selected, or for a frame. */
	show: (cells: TrackType[]) => void;
	showFrame: (frame: number) => void;
};
