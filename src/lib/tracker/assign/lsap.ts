/**
 * scipy.optimize.linear_sum_assignment: the shortest augmenting path method of Crouse (2016), ported
 * from scipy's rectangular_lsap.cpp with the same operation order and the same tie-breaking, so that it
 * returns the same assignment, ties included.
 */

export class AssignmentError extends Error {}

export interface Assignment {
	/** the assigned row of each pair, ascending */
	readonly rows: Int32Array;
	/** the column assigned to rows[k] */
	readonly columns: Int32Array;
}

// work arrays, grown on demand and reused by every call
let u = new Float64Array(64);
let v = new Float64Array(64);
let shortestPathCosts = new Float64Array(64);
let path = new Int32Array(64);
let col4row = new Int32Array(64);
let row4col = new Int32Array(64);
let remaining = new Int32Array(64);
let sr = new Uint8Array(64);
let sc = new Uint8Array(64);
let transposed = new Float64Array(64 * 64);

function ensure(n: number): void {
	if (n <= u.length) return;
	const size = Math.max(n, u.length * 2);
	u = new Float64Array(size);
	v = new Float64Array(size);
	shortestPathCosts = new Float64Array(size);
	path = new Int32Array(size);
	col4row = new Int32Array(size);
	row4col = new Int32Array(size);
	remaining = new Int32Array(size);
	sr = new Uint8Array(size);
	sc = new Uint8Array(size);
}

/** augmenting_path of rectangular_lsap.cpp: the sink column, or -1 if the cost matrix is infeasible. */
function augmentingPath(
	nr: number,
	nc: number,
	cost: Float64Array,
	start: number,
	minValue: { value: number }
): number {
	let minVal = 0;
	let numRemaining = nc;
	// filled in reverse order, so that a constant cost matrix gives the identity
	for (let it = 0; it < nc; it++) remaining[it] = nc - it - 1;
	sr.fill(0, 0, nr);
	sc.fill(0, 0, nc);
	shortestPathCosts.fill(Infinity, 0, nc);

	let i = start;
	let sink = -1;
	while (sink === -1) {
		let index = -1;
		let lowest = Infinity;
		sr[i] = 1;
		for (let it = 0; it < numRemaining; it++) {
			const j = remaining[it];
			const r = minVal + cost[i * nc + j] - u[i] - v[j];
			if (r < shortestPathCosts[j]) {
				path[j] = i;
				shortestPathCosts[j] = r;
			}
			// of equal costs, prefer a column that ends the path
			if (
				shortestPathCosts[j] < lowest ||
				(shortestPathCosts[j] === lowest && row4col[j] === -1)
			) {
				lowest = shortestPathCosts[j];
				index = it;
			}
		}
		minVal = lowest;
		if (minVal === Infinity) return -1;
		const j = remaining[index];
		if (row4col[j] === -1) sink = j;
		else i = row4col[j];
		sc[j] = 1;
		remaining[index] = remaining[--numRemaining];
	}
	minValue.value = minVal;
	return sink;
}

/**
 * The assignment of minimum total cost for a rows x columns cost matrix in row-major order. Throws
 * AssignmentError for a matrix with NaN or -Infinity entries, or one with no feasible assignment.
 */
export function linearSumAssignment(
	costMatrix: Float64Array,
	rows: number,
	columns: number
): Assignment {
	if (rows === 0 || columns === 0) return { rows: new Int32Array(0), columns: new Int32Array(0) };
	// a tall matrix is solved transposed
	const transpose = columns < rows;
	let nr = rows,
		nc = columns;
	let cost = costMatrix;
	if (transpose) {
		if (rows * columns > transposed.length) transposed = new Float64Array(rows * columns);
		for (let i = 0; i < rows; i++)
			for (let j = 0; j < columns; j++)
				transposed[j * rows + i] = costMatrix[i * columns + j];
		cost = transposed;
		nr = columns;
		nc = rows;
	}
	for (let k = 0; k < nr * nc; k++) {
		if (cost[k] !== cost[k] || cost[k] === -Infinity)
			throw new AssignmentError('matrix contains invalid numeric entries');
	}

	ensure(Math.max(nr, nc));
	u.fill(0, 0, nr);
	v.fill(0, 0, nc);
	path.fill(-1, 0, nc);
	col4row.fill(-1, 0, nr);
	row4col.fill(-1, 0, nc);
	const minValue = { value: 0 };

	for (let curRow = 0; curRow < nr; curRow++) {
		const sink = augmentingPath(nr, nc, cost, curRow, minValue);
		if (sink < 0) throw new AssignmentError('cost matrix is infeasible');
		const minVal = minValue.value;

		// update the dual variables
		u[curRow] += minVal;
		for (let i = 0; i < nr; i++) {
			if (sr[i] && i !== curRow) u[i] += minVal - shortestPathCosts[col4row[i]];
		}
		for (let j = 0; j < nc; j++) {
			if (sc[j]) v[j] -= minVal - shortestPathCosts[j];
		}

		// augment the previous solution
		let j = sink;
		while (true) {
			const i = path[j];
			row4col[j] = i;
			const swapped = col4row[i];
			col4row[i] = j;
			j = swapped;
			if (i === curRow) break;
		}
	}

	const a = new Int32Array(nr),
		b = new Int32Array(nr);
	if (transpose) {
		// the pairs ordered by their row in the original matrix (argsort of col4row)
		const order = Array.from({ length: nr }, (_, k) => k).sort(
			(p, q) => col4row[p] - col4row[q]
		);
		for (let k = 0; k < nr; k++) {
			a[k] = col4row[order[k]];
			b[k] = order[k];
		}
	} else {
		for (let i = 0; i < nr; i++) {
			a[i] = i;
			b[i] = col4row[i];
		}
	}
	return { rows: a, columns: b };
}
