<script lang="ts">
  import type { Ref, WorktreeStatus } from '@treeline/shared';
  import { Archive, Cloud, FolderGit2, GitBranch, Tag } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import WorktreeState from './WorktreeState.svelte';

  let {
    ref,
    color,
    current,
    status
  }: {
    ref: Ref;
    color: string;
    current: boolean;
    /** Local status of the worktree this branch is checked out in, if any. */
    status?: WorktreeStatus | null;
  } = $props();

  const Icon = $derived(
    ref.worktree
      ? FolderGit2
      : { head: GitBranch, remote: Cloud, tag: Tag, stash: Archive }[ref.kind]
  );
</script>

<span
  class={cn(
    'inline-flex h-[18px] max-w-56 min-w-10 items-center gap-1 rounded-sm border px-1.5 text-xs leading-none',
    current && 'font-semibold'
  )}
  style="border-color: {color}; background: color-mix(in srgb, {color} 18%, transparent)"
  title={ref.worktree ? `${ref.name} — checked out in worktree ${ref.worktree}` : ref.name}
>
  <Icon class="size-3 shrink-0" />
  <span class="truncate">{ref.name}</span>
  {#if status}
    <WorktreeState {status} />
  {/if}
</span>
