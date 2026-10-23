/**
 * Commit graph layout. Commits arrive newest-first; each one is placed in a
 * lane (column) and every row gets the edges that connect it to the row above.
 *
 * Lanes keep their index for their whole life (no compaction), which keeps
 * lines straight and stable as more commits are loaded.
 */
import { UNCOMMITTED, type Commit } from '@treeline/shared';

export interface Edge {
  /** Lane at the row above. */
  from: number;
  /** Lane at this row. */
  to: number;
  color: number;
  dashed: boolean;
}

export interface Row {
  lane: number;
  color: number;
  /** Edges from the row above into this row. */
  up: Edge[];
}

export interface Layout {
  rows: Row[];
  /** Edges continuing below the last row (more commits not loaded yet). */
  tail: Edge[];
  width: number;
}

interface Lane {
  hash: string;
  color: number;
  /** Where (at the previous row) this lane's lines start from, and how they are drawn. */
  sources: { lane: number; color: number; dashed: boolean }[];
}

export function layout(commits: Commit[]): Layout {
  const lanes: (Lane | null)[] = [];
  const rows: Row[] = [];
  let colors = 0;
  let width = 0;

  const free = () => {
    const i = lanes.indexOf(null);
    return i < 0 ? lanes.length : i;
  };

  /** Edges from the current lane state into a row whose commit is `hash` placed at `lane`. */
  const edgesInto = (hash: string | null, lane: number) =>
    lanes.flatMap((l, j) =>
      l
        ? l.sources.map((s) => ({
            from: s.lane,
            to: l.hash === hash ? lane : j,
            color: s.color,
            dashed: s.dashed
          }))
        : []
    );

  for (const c of commits) {
    let lane = lanes.findIndex((l) => l?.hash === c.hash);
    let color: number;
    if (lane < 0) {
      lane = free();
      color = colors++;
    } else {
      color = lanes[lane]!.color;
    }

    const up = edgesInto(c.hash, lane);
    rows.push({ lane, color, up });

    // This commit consumes every lane that was waiting for it.
    for (let j = 0; j < lanes.length; j++) {
      const l = lanes[j];
      if (l?.hash === c.hash) lanes[j] = null;
      else if (l)
        l.sources = [{ lane: j, color: l.color, dashed: l.sources.every((s) => s.dashed) }];
    }

    const dashed = c.hash === UNCOMMITTED;
    c.parents.forEach((parent, k) => {
      const existing = lanes.findIndex((l) => l?.hash === parent);
      if (existing >= 0 && k === 0 && lane < existing) {
        // First parent already expected further right: pull that line left into
        // this lane, so the older history keeps the leftmost column.
        const moved = lanes[existing]!;
        lanes[existing] = null;
        lanes[lane] = { ...moved, sources: [{ lane, color, dashed }, ...moved.sources] };
      } else if (existing >= 0) {
        // Parent already expected by another line: join it. A first-parent join
        // is drawn in this branch's colour, a merge-parent join in the parent's.
        const target = lanes[existing]!;
        target.sources.push({ lane, color: k === 0 ? color : target.color, dashed });
      } else {
        const target = k === 0 ? lane : free();
        const laneColor = k === 0 ? color : colors++;
        lanes[target] = {
          hash: parent,
          color: laneColor,
          sources: [{ lane, color: laneColor, dashed }]
        };
      }
    });

    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    width = Math.max(width, lane + 1, lanes.length);
  }

  return { rows, tail: edgesInto(null, -1), width };
}
