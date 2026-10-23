<script lang="ts">
  import type { WorktreeStatus } from '@treeline/shared';

  /** Compact local status of a worktree: ●changes or ✓, then ↑ahead ↓behind its upstream. */
  let { status }: { status: WorktreeStatus } = $props();
</script>

<span class="flex shrink-0 gap-1 font-mono text-[11px]">
  {#if status.changes}
    <span class="text-dirty" title="{status.changes} uncommitted changes">●{status.changes}</span>
  {:else}
    <span class="opacity-70" title="No uncommitted changes">✓</span>
  {/if}
  {#if status.ahead || status.behind}
    <span title="Ahead / behind {status.upstream}">↑{status.ahead}↓{status.behind}</span>
  {/if}
</span>
