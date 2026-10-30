/** BoxOverlap of the library: the overlap area of two [minRow, minCol, maxRow, maxCol] boxes (max ends exclusive). */
export function boxOverlap(p: ArrayLike<number>, q: ArrayLike<number>): number {
	const rows = Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0]));
	const columns = Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));
	return rows * columns;
}
