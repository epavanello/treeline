<script lang="ts" module>
  export const ROW = 24;
  export const LANE = 14;
  const PAD = 10;
  export const graphWidth = (lanes: number) => Math.max(4, lanes) * LANE + PAD;
  export const laneX = (lane: number) => PAD / 2 + lane * LANE + LANE / 2;
  const PALETTE = [
    '#3794ff',
    '#e5508f',
    '#3fb950',
    '#e3a33a',
    '#a371f7',
    '#f85149',
    '#39c5cf',
    '#db61a2',
    '#8bc34a',
    '#f0883e',
    '#7c6cf2',
    '#d4b62b'
  ];
  export const laneColor = (c: number) => PALETTE[c % PALETTE.length];
</script>

<script lang="ts">
  import { isUncommitted, type Commit } from '@treeline/shared';
  import type { Edge, Layout } from '$lib/graph';

  let { graph, commits, head }: { graph: Layout; commits: Commit[]; head: string | null } =
    $props();

  const y = (row: number) => row * ROW + ROW / 2;

  function path(e: Edge, row: number) {
    const x1 = laneX(e.from);
    const x2 = laneX(e.to);
    const y1 = y(row - 1);
    const y2 = y(row);
    if (x1 === x2) return `M${x1},${y1}V${y2}`;
    // Curve in the half-row nearest the commit that changes lanes
    const d = ROW * 0.8;
    return `M${x1},${y1}C${x1},${y1 + d} ${x2},${y2 - d} ${x2},${y2}`;
  }

  const n = $derived(graph.rows.length);
</script>

<svg
  class="pointer-events-none absolute top-0 left-0"
  width={graphWidth(graph.width)}
  height={n * ROW}
  aria-hidden="true"
>
  {#each graph.rows as row, i (i)}
    {#each row.up as e, k (k)}
      <path
        d={path(e, i)}
        fill="none"
        stroke={laneColor(e.color)}
        stroke-width="2"
        stroke-dasharray={e.dashed ? '3 3' : undefined}
      />
    {/each}
  {/each}
  {#each graph.tail as e, k (k)}
    <path
      d={`M${laneX(e.from)},${y(n - 1)}V${n * ROW}`}
      fill="none"
      stroke={laneColor(e.color)}
      stroke-width="2"
    />
  {/each}
  {#each graph.rows as row, i (i)}
    {@const c = commits[i]}
    {@const hollow = isUncommitted(c) || c.hash === head || !!c.stashBase}
    {#if c.stashBase}
      <rect
        x={laneX(row.lane) - 4}
        y={y(i) - 4}
        width="8"
        height="8"
        fill="var(--background)"
        stroke={laneColor(row.color)}
        stroke-width="2"
      />
    {:else}
      <circle
        cx={laneX(row.lane)}
        cy={y(i)}
        r="4"
        fill={hollow ? 'var(--background)' : laneColor(row.color)}
        stroke={laneColor(row.color)}
        stroke-width="2"
        stroke-dasharray={isUncommitted(c) ? '2 2' : undefined}
      />
    {/if}
  {/each}
</svg>
