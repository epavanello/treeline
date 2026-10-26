<script lang="ts">
  import { ago, type Worktree } from '@treeline/shared';
  import { FolderGit2, LoaderCircle, Plus, Trash2, TriangleAlert } from '@lucide/svelte';
  import { mergeProps } from 'svelte-toolbelt';
  import { app } from '$lib/app.svelte';
  import {
    CLEANUP,
    DEFAULT_WORKTREE_FILTER,
    owner,
    removable,
    STALE,
    worktreeMatches,
    type WorktreeFilter
  } from '$lib/filters';
  import { worktreeItems } from '$lib/menus';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import AuthorStack from './AuthorStack.svelte';
  import FilterMenu from './FilterMenu.svelte';
  import { CARD_LIST } from './RefCard.svelte';
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
      worktreeMatches(w, f, app.worktreeDetails[w.path]?.compare, app.filterContext)
    )
  );
  const active = $derived(
    (Object.keys(f) as (keyof WorktreeFilter)[]).some((k) => f[k] !== DEFAULT_WORKTREE_FILTER[k])
  );
  const cleanup = $derived(CLEANUP.worktrees.includes(f.state) ? worktrees.filter(removable) : []);
  const base = $derived(app.data?.compare?.base ?? 'the base');
  const folder = (path: string) => path.split(/[\\/]/).pop();

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
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
          <!-- The card shown on hover: what this worktree is, how old and how dirty -->
          {#snippet details()}
            {@const s = w.status}
            {@const stale = !!w.headDate && Date.now() / 1000 - w.headDate > STALE}
            {@const d = app.worktreeDetails[w.path]}
            <div class="flex items-center gap-1.5">
              <FolderGit2 class="size-3.5 shrink-0" />
              <span class="font-semibold">{folder(w.path)}</span>
              {#if w.current || w.main || w.locked}
                <span class="rounded-sm border px-1 text-[10px] leading-4 text-muted-foreground">
                  {w.current ? 'in this graph' : w.main ? 'main worktree' : 'locked'}
                </span>
              {/if}
            </div>
            <dl class={CARD_LIST}>
              <dt class="text-muted-foreground">Branch</dt>
              <dd class="font-mono">{w.branch ?? `detached at ${w.head.slice(0, 8)}`}</dd>
              {#if w.branch && app.branchDetails[w.branch]}
                {@const bd = app.branchDetails[w.branch]}
                {@const o = owner(bd)}
                {#if o}
                  {@const total = bd.authors.reduce((n, a) => n + a.commits, 0)}
                  <dt class="text-muted-foreground">Owner</dt>
                  <dd class="flex items-center gap-1.5">
                    <AuthorStack authors={bd.authors} />
                    {o.name}
                    <span class="text-muted-foreground tabular-nums">
                      {o.commits} of {total} commits ({Math.round((100 * o.commits) / total)}%)
                    </span>
                  </dd>
                {/if}
              {/if}
              {#if w.headDate}
                <dt class="text-muted-foreground">Last commit</dt>
                <dd>
                  <span class={cn(stale && 'text-dirty')}>{ago(w.headDate)}</span>
                  <span class="text-[11px] text-muted-foreground italic">
                    {new Date(w.headDate * 1000).toLocaleDateString()}
                  </span>
                  <span class="mt-0.5 line-clamp-2 block">
                    <span class="font-mono text-[11px] text-muted-foreground"
                      >{w.head.slice(0, 8)}</span
                    >
                    {w.headSubject}
                  </span>
                </dd>
              {/if}
              <dt class="text-muted-foreground">Changes</dt>
              <dd>
                {#if w.prunable}
                  <span class="text-destructive">Folder missing: right-click to prune</span>
                {:else if s?.changes}
                  <span class="text-dirty">{plural(s.changes, 'uncommitted change')}</span>
                  <span class="block text-muted-foreground">Click the chip to see them</span>
                {:else}
                  Clean
                {/if}
              </dd>
              {#if !w.prunable}
                <dt class="text-muted-foreground">vs {app.data?.compare?.base ?? 'base'}</dt>
                <dd>
                  {#if !d}
                    <span class="flex items-center gap-1 text-muted-foreground">
                      <LoaderCircle class="size-3 animate-spin" /> comparing…
                    </span>
                  {:else if d.compare}
                    {@const c = d.compare}
                    {[
                      c.ahead && `↑ ${plural(c.ahead, 'commit')} ahead`,
                      c.behind && `↓ ${c.behind} behind`,
                      c.same && `≡ ${c.same} copies`
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Same as the base'}
                    {#if c.mergeBaseDate}
                      <span class="block text-muted-foreground">
                        forked {ago(c.mergeBaseDate)}
                      </span>
                    {/if}
                  {:else}
                    <span class="text-muted-foreground">No base to compare with</span>
                  {/if}
                </dd>
                {#if d?.compare?.rewritten}
                  {@const c = d.compare}
                  <dd
                    class="col-span-2 rounded-sm border border-dirty/40 bg-dirty/10 px-1.5 py-1 text-dirty"
                  >
                    <span class="flex items-center gap-1 font-semibold">
                      <TriangleAlert class="size-3.5" /> Rewritten history
                    </span>
                    {c.same} of its commits are copies of commits on {c.base}, and the two histories {c.mergeBaseDate
                      ? `only meet ${ago(c.mergeBaseDate)}`
                      : 'never meet'}: one side was rewritten (filter-repo, a forced rebase). The
                    ahead and behind counts are mostly noise: rather than merging, start a fresh
                    branch from {c.base}
                    and bring the changes over.
                  </dd>
                {/if}
              {/if}
              {#if s}
                <dt class="text-muted-foreground">Upstream</dt>
                <dd>
                  {#if !s.upstream}
                    Not pushed yet
                  {:else}
                    {[
                      s.ahead && `↑ ${plural(s.ahead, 'commit')} to push`,
                      s.behind && `↓ ${plural(s.behind, 'commit')} to pull`
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'In sync'}
                    <span class="block font-mono text-[11px] text-muted-foreground">
                      {s.upstream}
                    </span>
                  {/if}
                </dd>
              {/if}
              <dt class="text-muted-foreground">Folder</dt>
              <dd class="font-mono text-[11px] text-muted-foreground">{w.path}</dd>
            </dl>
            <p class="border-t pt-1.5 text-[11px] text-muted-foreground">
              Click: its uncommitted changes · Double-click: open in a new window · Right-click:
              more
            </p>
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
                  'flex h-6 max-w-80 shrink-0 items-center gap-1.5 rounded-sm border px-2 hover:bg-accent data-menu-open:bg-accent',
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
                <span class="truncate text-muted-foreground">
                  {w.branch ?? `detached ${w.head.slice(0, 7)}`}
                </span>
                {#if w.prunable}
                  <span class="text-destructive">missing</span>
                {:else if w.status}
                  <WorktreeState status={w.status} />
                {/if}
                {#if w.branch && owner(app.branchDetails[w.branch])}
                  {@const o = owner(app.branchDetails[w.branch])!}
                  <AuthorAvatar name={o.name} email={o.email} />
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
