<script lang="ts">
  import type { Ref, WorktreeStatus } from '@treeline/shared';
  import { Archive, Cloud, FolderGit2, GitBranch, LoaderCircle, Tag } from '@lucide/svelte';
  import type { RefSummary } from '@treeline/shared';
  import { cn } from '$lib/utils';
  import RefCard from './RefCard.svelte';
  import Tip from './Tip.svelte';
  import WorktreeState, { describeStatus } from './WorktreeState.svelte';

  let {
    ref,
    color,
    current,
    status,
    busy = false,
    remote,
    onremotemenu,
    card
  }: {
    ref: Ref;
    color: string;
    current: boolean;
    /** Local status of the worktree this branch is checked out in, if any. */
    status?: WorktreeStatus | null;
    /** An action is running on it: a spinner replaces the icon. */
    busy?: boolean;
    /** Its upstream, when it points to the same commit: shown as a segment of this badge. */
    remote?: Ref;
    /** Right-click on that segment: the remote branch's menu. */
    onremotemenu?: (e: MouseEvent, remote: Ref) => void;
    /** Its details, for the hover card (branches and tags). */
    card?: RefSummary;
  } = $props();

  const Icon = $derived(
    ref.worktree
      ? FolderGit2
      : { head: GitBranch, remote: Cloud, tag: Tag, stash: Archive }[ref.kind]
  );
</script>

<!-- Branches and tags show the same card as everywhere else (RefCard); stashes a plain title -->
{#snippet details()}
  {#if card}<RefCard r={card} footer="Right-click: its actions" />{/if}
{/snippet}
<Tip content={card ? details : undefined}>
  {#snippet children(trigger)}
    <span
      {...trigger}
      class={cn(
        'inline-flex h-[18px] max-w-56 min-w-10 cursor-context-menu items-center gap-1 rounded-sm border px-1.5 text-xs leading-none transition-colors',
        // Its lane colour, filled more on hover and while its context menu is open
        '[border-color:var(--c)] [background:color-mix(in_srgb,var(--c)_18%,transparent)]',
        'hover:[background:color-mix(in_srgb,var(--c)_35%,transparent)] data-menu-open:[background:color-mix(in_srgb,var(--c)_35%,transparent)]',
        current && 'font-semibold'
      )}
      style="--c: {color}"
      title={card
        ? undefined
        : ref.worktree
          ? `${ref.name} is checked out in the worktree ${ref.worktree}${status ? `\n${describeStatus(status)}` : ''}`
          : remote
            ? `${ref.name}, in sync with ${remote.name}`
            : ref.name}
    >
      {#if busy}
        <LoaderCircle class="size-3 shrink-0 animate-spin" />
      {:else}
        <Icon class="size-3 shrink-0" />
      {/if}
      <span class="truncate">{ref.name}</span>
      {#if remote}
        <span
          class="flex shrink-0 items-center gap-0.5 rounded-sm border-l border-current/30 pl-1 opacity-80 data-menu-open:bg-current/15"
          role="presentation"
          title="{remote.name}: same commit · right-click for the remote branch's actions"
          oncontextmenu={(e) => onremotemenu?.(e, remote)}
        >
          <Cloud class="size-3" />{remote.remote}
        </span>
      {/if}
      {#if status}
        <WorktreeState {status} />
      {/if}
    </span>
  {/snippet}
</Tip>
