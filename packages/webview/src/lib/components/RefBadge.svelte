<script lang="ts">
  import type { Ref, WorktreeStatus } from '@treeline/shared';
  import { Archive, Cloud, FolderGit2, GitBranch, LoaderCircle, Tag } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import WorktreeState, { describeStatus } from './WorktreeState.svelte';

  let {
    ref,
    color,
    current,
    status,
    busy = false
  }: {
    ref: Ref;
    color: string;
    current: boolean;
    /** Local status of the worktree this branch is checked out in, if any. */
    status?: WorktreeStatus | null;
    /** An action is running on it: a spinner replaces the icon. */
    busy?: boolean;
  } = $props();

  const Icon = $derived(
    ref.worktree
      ? FolderGit2
      : { head: GitBranch, remote: Cloud, tag: Tag, stash: Archive }[ref.kind]
  );
</script>

<span
  class={cn(
    'inline-flex h-[18px] max-w-56 min-w-10 cursor-context-menu items-center gap-1 rounded-sm border px-1.5 text-xs leading-none transition-colors',
    // Its lane colour, filled more on hover and while its context menu is open
    '[border-color:var(--c)] [background:color-mix(in_srgb,var(--c)_18%,transparent)]',
    'hover:[background:color-mix(in_srgb,var(--c)_35%,transparent)] data-menu-open:[background:color-mix(in_srgb,var(--c)_35%,transparent)]',
    current && 'font-semibold'
  )}
  style="--c: {color}"
  title={ref.worktree
    ? `${ref.name} is checked out in the worktree ${ref.worktree}${status ? `\n${describeStatus(status)}` : ''}`
    : ref.name}
>
  {#if busy}
    <LoaderCircle class="size-3 shrink-0 animate-spin" />
  {:else}
    <Icon class="size-3 shrink-0" />
  {/if}
  <span class="truncate">{ref.name}</span>
  {#if status}
    <WorktreeState {status} />
  {/if}
</span>
