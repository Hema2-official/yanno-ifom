import type { ChangeType } from '$lib/types/annotation.type';

/** The first word of the message: "Add", "Perform", "Undo", ... */
const verbOf = (change: ChangeType) => change.msg?.split(' ', 1)[0];

/** Neither a processing step's result nor an undo. */
export function isManualEdit(change: ChangeType): boolean {
	const verb = verbOf(change);
	return verb !== 'Perform' && verb !== 'Undo';
}

/** The manual edits made since the last processing step, null without one. */
export function editsSinceLastRun(changes: ChangeType[]): number | null {
	const lastRun = changes.findLastIndex((change) => verbOf(change) === 'Perform');
	return lastRun < 0 ? null : changes.slice(lastRun + 1).filter(isManualEdit).length;
}

/** A count per label, e.g. for a bar each. */
type Tally = { label: string; count: number }[];

function tally(labels: string[]): Tally {
	const groups = Map.groupBy(labels, (label) => label);
	return Array.from(groups, ([label, group]) => ({ label, count: group.length }));
}

/** Manual edits per local calendar day, oldest first. */
export function editsPerDay(changes: ChangeType[]): Tally {
	const pad = (n: number) => String(n).padStart(2, '0');
	const days = changes.filter(isManualEdit).flatMap((change) => {
		const time = new Date(change.time ?? NaN);
		if (Number.isNaN(time.getTime())) return [];
		return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
	});
	return tally(days).sort((a, b) => a.label.localeCompare(b.label));
}

/** Manual edits by their verb, the most frequent first. */
export function editsByKind(changes: ChangeType[]): Tally {
	const kinds = changes.filter(isManualEdit).map((change) => verbOf(change) || 'Other');
	return tally(kinds).sort((a, b) => b.count - a.count);
}
