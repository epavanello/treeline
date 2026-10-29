<script lang="ts">
  import type { Ref, WorktreeStatus } from '@treeline/shared';
  import {
    Archive,
    Cloud,
    CloudOff,
    FolderGit2,
    GitBranch,
    LoaderCircle,
    Tag
  } from '@lucide/svelte';
  import type { RefSummary } from '@treeline/shared';
  import { app } from '$lib/app.svelte';
  import { owner, pullsOf } from '$lib/filters';
  import { cn } from '$lib/utils';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import { PULL_STATE } from './PullBadge.svelte';
  import RefCard from './RefCard.svelte';
  import RefName from './RefName.svelte';
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
    card,
    detached = false
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
    /** A detached worktree's folder, not a branch: no cloud, no owner. */
    detached?: boolean;
  } = $props();

  const Icon = $derived(
    ref.worktree
      ? FolderGit2
      : { head: GitBranch, remote: Cloud, tag: Tag, stash: Archive }[ref.kind]
  );
  // Like the branch chips: whose it is, and a cloud for where it lives
  const o = $derived(
    ref.kind === 'head' || ref.kind === 'remote' ? owner(app.branchDetails[ref.name]) : null
  );
  const up = $derived(ref.kind === 'head' ? ref.upstream : undefined);
  /** Its open pull request, as the branch chips show it (the card has the rest). */
  const pr = $derived.by(() => {
    const row = ref.kind === 'head' || ref.kind === 'remote' ? app.rowOf.get(ref.name) : undefined;
    const p = row && pullsOf(row, app.filterContext.pulls)[0];
    return p && (p.state === 'open' || p.state === 'draft') ? p : undefined;
  });
  /** With one remote, its name says nothing the cloud doesn't. */
  const manyRemotes = $derived((app.data?.remotes.length ?? 0) > 1);
</script>

<!-- Branches and tags show the same card as everywhere else (RefCard); stashes a plain title -->
{#snippet details()}
  {#if card}
    <RefCard
      r={card}
      worktree={app.data?.worktrees.find((w) => w.path === ref.worktree)}
      footer="Right-click: its actions"
    />
  {/if}
{/snippet}
<Tip content={card ? details : undefined}>
  {#snippet children(trigger)}
    <span
      {...trigger}
      class={cn(
        // Squeezed (a narrow column, several badges), what doesn't fit is cut at its edge: the cloud,
        // the avatar and the worktree state never shrink, so they would spill over the next badge
        'inline-flex h-[18px] max-w-56 min-w-10 cursor-context-menu items-center gap-1 overflow-hidden rounded-sm border px-1.5 text-xs leading-none transition-colors',
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
      <span class="truncate"><RefName {ref} /></span>
      {#if remote}
        <span
          class="flex shrink-0 items-center gap-0.5 rounded-sm border-l border-current/30 pl-1 opacity-80 data-menu-open:bg-current/15"
          role="presentation"
          title="{remote.name}: same commit · right-click for the remote branch's actions"
          oncontextmenu={(e) => onremotemenu?.(e, remote)}
        >
          <Cloud class="size-3 fill-current" />{#if manyRemotes}{remote.remote}{/if}
        </span>
      {:else if ref.kind === 'head' && !detached}
        {#if !up || up.gone}
          <span
            class={cn('inline-flex shrink-0', up?.gone ? 'text-dirty' : 'opacity-50')}
            title={up ? `${up.name} was deleted on the remote` : 'Never pushed'}
          >
            <CloudOff class="size-3" />
          </span>
        {:else}
          <!-- Its upstream is elsewhere in the graph (or remote branches are hidden) -->
          <span
            class="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums opacity-80"
            title="{up.name}{up.ahead || up.behind
              ? `: ${[up.ahead && `${up.ahead} to push`, up.behind && `${up.behind} to pull`].filter(Boolean).join(', ')}`
              : ', in sync'}"
          >
            <Cloud
              class="size-3 fill-current"
            />{#if up.ahead}↑{up.ahead}{/if}{#if up.behind}↓{up.behind}{/if}
          </span>
        {/if}
      {/if}
      {#if pr}
        {@const s = PULL_STATE[pr.state]}
        <s.icon class="size-3 shrink-0 {s.class}" />
      {/if}
      {#if o}
        <AuthorAvatar name={o.name} email={o.email} class="size-3.5" />
      {/if}
      {#if status}
        <!-- Its changes only: the cloud already says where it stands with its remote -->
        <WorktreeState {status} sync={false} />
      {/if}
    </span>
  {/snippet}
</Tip>
