<script lang="ts">
  import { since, type RefSummary, type Worktree } from '@treeline/shared';
  import {
    FolderGit2,
    GitCommitHorizontal,
    LoaderCircle,
    Plus,
    Recycle,
    Trash2,
    TriangleAlert
  } from '@lucide/svelte';
  import { mergeProps } from 'svelte-toolbelt';
  import { app } from '$lib/app.svelte';
  import {
    CLEANUP,
    DEFAULT_WORKTREE_FILTER,
    isDisposable,
    owner,
    pullsOf,
    removable,
    worktreeMatches,
    type WorktreeFilter
  } from '$lib/filters';
  import { worktreeItems } from '$lib/menus';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import BranchState from './BranchState.svelte';
  import FilterMenu from './FilterMenu.svelte';
  import PullBadge from './PullBadge.svelte';
  import RefCard from './RefCard.svelte';
  import NavStrip from './NavStrip.svelte';
  import Tip from './Tip.svelte';
  import WorktreeState from './WorktreeState.svelte';

  /**
   * Every worktree of the repository, one chip each, filtered from the title: the main one and the
   * one this graph shows first, then the others by their latest commit, like the branches. (git
   * lists them main first, then by folder name: `data.worktrees` keeps that order, which the
   * actions rely on.)
   */
  const all = $derived(
    [...(app.data?.worktrees ?? [])].sort(
      (a, b) =>
        +b.main - +a.main || +b.current - +a.current || (b.headDate ?? 0) - (a.headDate ?? 0)
    )
  );
  const f = $derived(app.worktreeFilter);
  const worktrees = $derived(
    all.filter((w) =>
      worktreeMatches(w, f, app.worktreeDetails[w.path] ?? undefined, app.filterContext)
    )
  );
  const active = $derived(
    (Object.keys(f) as (keyof WorktreeFilter)[]).some((k) => f[k] !== DEFAULT_WORKTREE_FILTER[k])
  );
  const cleanup = $derived(CLEANUP.worktrees.includes(f.state) ? worktrees.filter(removable) : []);
  const base = $derived(app.data?.compare?.base ?? 'the base');
  const folder = (path: string) => path.split(/[\\/]/).pop();
  /** The branch it has checked out, as the branch row knows it (a stand-in when detached). */
  const summaryOf = (w: Worktree): RefSummary =>
    app.data?.heads.find((h) => h.ref.name === w.branch) ?? {
      ref: { kind: 'head', name: w.branch ?? `detached ${w.head.slice(0, 8)}` },
      hash: w.head,
      date: w.headDate ?? 0,
      subject: w.headSubject ?? ''
    };
</script>

{#snippet menu()}
  <FilterMenu
    value={f}
    onchange={(patch) => app.setWorktreeFilter(patch)}
    onreset={() => app.setWorktreeFilter(DEFAULT_WORKTREE_FILTER)}
    groups={[
      {
        key: 'owner',
        label: 'Whose',
        options: [
          { value: 'anyone', label: "Anyone's" },
          {
            value: 'mine',
            label: 'Mine',
            hint: 'Worktrees whose branch is yours: you wrote most of what it has that the base lacks.',
            disabled: !app.data?.user
          }
        ]
      },
      {
        key: 'state',
        label: 'State',
        options: [
          { value: 'any', label: 'Any' },
          {
            value: 'changes',
            label: 'With uncommitted changes',
            hint: 'Work in progress: files changed, staged or new.'
          },
          {
            value: 'clean',
            label: 'Clean',
            hint: 'Nothing uncommitted: removing the folder loses nothing, its branch stays. Lists them with a button to remove them all.'
          },
          {
            value: 'disposable',
            label: 'Nothing to lose',
            hint: 'Clean, and either detached on a commit a branch or tag already has (temporary checkouts), or on a merged branch: removing them loses no work. Lists them with a button to remove them all.'
          },
          {
            value: 'merged',
            label: `Merged into ${base}`,
            hint: `Every commit it has is on ${base}, merged or rebased in. Lists them with a button to remove them all (and their branches, if you like).`
          },
          {
            value: 'stale',
            label: 'No commits for 30 days',
            hint: 'Lists them with a button to remove them all.'
          }
        ]
      }
    ]}
  />
{/snippet}

{#if app.view.worktrees && app.data}
  <ActionMenu>
    {#snippet children(open)}
      <NavStrip
        label="Worktrees"
        count={all.length}
        shown={worktrees.length}
        empty={all.length ? 'No worktrees match the filter' : 'No worktrees'}
        filter={{
          menu,
          active,
          loading: f.owner === 'mine' ? app.loadingBranchDetails : false,
          hint: {
            title: 'Filter the worktrees',
            body: 'Yours, ones with work in progress, clean ones, merged ones or ones left alone for a month: and, for the last three, a button to remove them all.',
            note: active ? 'Filtered: click to change or reset.' : undefined
          }
        }}
      >
        {#if cleanup.length}
          <Button
            variant="outline"
            size="xs"
            class="h-6 shrink-0 gap-1 border-destructive/50 px-2 text-xs font-normal text-destructive hover:text-destructive"
            icon={Trash2}
            loading={app.isRunning('removeWorktrees')}
            hint={{
              title: `Remove these ${cleanup.length} worktrees`,
              body: 'Asks once, saying what would be lost (uncommitted changes), and offers to delete their branches too: here only, or on the remote as well.',
              note:
                worktrees.length > cleanup.length
                  ? 'The main worktree and the one this graph shows stay.'
                  : undefined,
              command: 'git worktree remove <folder>'
            }}
            onclick={() => app.run({ type: 'removeWorktrees', paths: cleanup.map((w) => w.path) })}
          >
            Remove {cleanup.length}
          </Button>
        {/if}
        {#each worktrees as w (w.path)}
          {@const r = summaryOf(w)}
          {@const pr =
            w.branch && app.rowOf.get(w.branch)
              ? pullsOf(app.rowOf.get(w.branch)!, app.filterContext.pulls)[0]
              : undefined}
          <!-- The card shown on hover: its branch's card, plus its folder and uncommitted files -->
          {#snippet details()}
            <RefCard
              {r}
              worktree={w}
              footer="Click: show it in the graph, with its uncommitted changes and their diffs · Double-click: open in a new window · Right-click: more"
            />
          {/snippet}
          <Tip content={details}>
            {#snippet children(trigger)}
              <button
                {...mergeProps(trigger, {
                  // The card's comparison and file list load as soon as the pointer arrives
                  onpointerenter: () => !w.prunable && app.loadWorktreeDetails(w.path),
                  onfocus: () => !w.prunable && app.loadWorktreeDetails(w.path),
                  onclick: () => app.openWorktree(w),
                  ondblclick: () => !w.current && !w.prunable && host.openFolder(w.path),
                  oncontextmenu: (e: MouseEvent) => open(e, worktreeItems(w))
                })}
                class={cn(
                  'flex h-6 max-w-[28rem] shrink-0 items-center gap-1.5 rounded-sm border px-2 hover:bg-accent data-menu-open:bg-accent',
                  w.current && 'border-ring',
                  app.worktreeDetails[w.path]?.compare?.rewritten && 'border-dirty'
                )}
              >
                {#if app.isRunning(w.path, w.branch, w.prunable ? 'pruneWorktrees' : null)}
                  <LoaderCircle class="size-3.5 shrink-0 animate-spin" />
                {:else if app.worktreeDetails[w.path]?.compare?.rewritten}
                  <TriangleAlert class="size-3.5 shrink-0 text-dirty" />
                {:else if w.prunable}
                  <TriangleAlert class="size-3.5 shrink-0 text-destructive" />
                {:else}
                  <FolderGit2 class="size-3.5 shrink-0" />
                {/if}
                <span class={cn('truncate', w.current && 'font-semibold')}>{folder(w.path)}</span>
                {#if w.branch}
                  <span class="truncate text-muted-foreground">{w.branch}</span>
                {:else}
                  <!-- Detached: on a commit, not a branch (the card has the hash, to copy) -->
                  <GitCommitHorizontal class="size-3.5 shrink-0 text-muted-foreground" />
                {/if}
                {#if w.prunable}
                  <span class="text-destructive">missing</span>
                {:else if w.status}
                  <WorktreeState status={w.status} sync={false} />
                {/if}
                <!-- What its branch's chip shows: ↑↓ vs the base, the cloud, its pull request -->
                <BranchState
                  {r}
                  vs={app.worktreeDetails[w.path]?.compare}
                  cloud={!!w.branch && r.ref.name === w.branch}
                />
                {#if pr && (pr.state === 'open' || pr.state === 'draft')}<PullBadge {pr} />{/if}
                {#if w.branch && owner(app.branchDetails[w.branch])}
                  {@const o = owner(app.branchDetails[w.branch])!}
                  <AuthorAvatar name={o.name} email={o.email} />
                {/if}
                {#if isDisposable(w, app.worktreeDetails[w.path] ?? undefined, app.filterContext)}
                  <Recycle class="size-3.5 shrink-0 text-muted-foreground" />
                {/if}
                {#if w.headDate}
                  <span class="shrink-0 text-muted-foreground tabular-nums"
                    >{since(w.headDate)}</span
                  >
                {/if}
              </button>
            {/snippet}
          </Tip>
        {/each}
        {#snippet action()}
          <Button
            variant="ghost"
            size="icon-xs"
            icon={Plus}
            hint={{
              title: 'New worktree',
              body: `Pick a free local branch or a remote one to check out in a new folder, or start a new branch from ${app.data?.compare?.base ?? 'the default branch'} (fetched first) or from any other branch. The folder goes next to this repository; you can open it right after.`,
              command: 'git worktree add ../<repo>-<branch> <branch>'
            }}
            onclick={() => app.run({ type: 'newWorktree', base: app.data?.compare?.base })}
          />
        {/snippet}
      </NavStrip>
    {/snippet}
  </ActionMenu>
{/if}
