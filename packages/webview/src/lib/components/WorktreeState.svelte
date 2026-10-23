<script lang="ts" module>
  import type { WorktreeStatus } from '@treeline/shared';

  /** The same status in words, for tooltips. */
  export function describeStatus(s: WorktreeStatus) {
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const changes = s.changes
      ? `${plural(s.changes, 'uncommitted change')}`
      : 'No uncommitted changes';
    const sync = !s.upstream
      ? 'not pushed yet (no upstream branch)'
      : s.ahead || s.behind
        ? [
            s.ahead && `${plural(s.ahead, 'commit')} to push`,
            s.behind && `${plural(s.behind, 'commit')} to pull`
          ]
            .filter(Boolean)
            .join(', ') + ` (${s.upstream})`
        : `in sync with ${s.upstream}`;
    return `${changes}; ${sync}.`;
  }
</script>

<script lang="ts">
  import { Check, CloudDownload, CloudOff, CloudUpload, FilePen } from '@lucide/svelte';

  /**
   * A worktree's local status: a file-with-pen count of uncommitted changes (or ✓ clean), then ☁↑ commits to push and
   * ☁↓ commits to pull relative to its upstream, or a crossed cloud when it has none yet.
   */
  let {
    status: s,
    changes = true
  }: {
    status: WorktreeStatus;
    /** Show the uncommitted changes (off for a branch, which only has a sync state). */
    changes?: boolean;
  } = $props();

  // Digits sit on the baseline, so their ink is ~0.5px below the line's centre, where
  // flexbox centres the icons: nudge the icons down to line up with the numbers.
  const icon = 'size-3 translate-y-[0.5px]';
</script>

<span class="inline-flex shrink-0 items-center gap-1.5 text-[11px] leading-none tabular-nums">
  {#if !changes}
    <!-- Sync state only -->
  {:else if s.changes}
    <span class="inline-flex items-center gap-0.5 text-dirty">
      <FilePen class={icon} />{s.changes}
    </span>
  {:else}
    <span class="inline-flex opacity-60"><Check class={icon} /></span>
  {/if}
  {#if !s.upstream}
    <span class="inline-flex opacity-60">
      <CloudOff class={icon} />
    </span>
  {/if}
  {#if s.ahead}
    <span class="inline-flex items-center gap-0.5">
      <CloudUpload class={icon} />{s.ahead}
    </span>
  {/if}
  {#if s.behind}
    <span class="inline-flex items-center gap-0.5">
      <CloudDownload class={icon} />{s.behind}
    </span>
  {/if}
</span>
