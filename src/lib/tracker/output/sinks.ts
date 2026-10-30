import type { TrackType } from './records';

/**
 * Collects the tracking step's records, which arrive frame by frame, in the order of the backend's
 * version list: every original record in frame order, then the interpolated ones by (TrackID, Frame).
 */
export class BackendOrder {
	private readonly originals: TrackType[] = [];
	private readonly interpolated: TrackType[] = [];

	readonly add = (_frame: number, records: readonly TrackType[]): void => {
		for (const record of records)
			(record.Interpolated ? this.interpolated : this.originals).push(record);
	};

	records(): TrackType[] {
		const interpolated = [...this.interpolated].sort(
			(a, b) => a.TrackID! - b.TrackID! || a.Frame - b.Frame
		);
		return this.originals.concat(interpolated);
	}
}

/** A sink that serializes every record as one JSON line (the experimental copy's .jsonl output). */
export function jsonLines(
	write: (line: string) => void
): (frame: number, records: readonly TrackType[]) => void {
	return (_frame, records) => {
		for (const record of records) write(JSON.stringify(record) + '\n');
	};
}
