<script lang="ts">
  import { ago, type Worktree } from '@treeline/shared';
  import { FolderGit2, LoaderCircle, Plus, TriangleAlert } from '@lucide/svelte';
  import { mergeProps } from 'svelte-toolbelt';
  import { app } from '$lib/app.svelte';
  import { worktreeItems } from '$lib/menus';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import NavStrip from './NavStrip.svelte';
  import Tip from './Tip.svelte';
  import WorktreeState from './WorktreeState.svelte';

  /** Every worktree of the repository (the main one included), one chip each. */
  const worktrees = $derived(app.data?.worktrees ?? []);
  const folder = (path: string) => path.split(/[\\/]/).pop();

  const STALE = 30 * 86400;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

{#if app.view.worktrees && app.data}
  <ActionMenu>
    {#snippet children(open)}
      <NavStrip label="Worktrees" count={worktrees.length} empty="No worktrees">
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
            <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt class="text-muted-foreground">Branch</dt>
              <dd class="font-mono">{w.branch ?? `detached at ${w.head.slice(0, 8)}`}</dd>
              {#if w.headDate}
                <dt class="text-muted-foreground">Last commit</dt>
                <dd>
                  <span class={cn(stale && 'text-dirty')}>{ago(w.headDate)}</span>
                  <span class="text-muted-foreground">
                    · {new Date(w.headDate * 1000).toLocaleDateString()}
                  </span>
                  <span class="line-clamp-2 block text-muted-foreground">{w.headSubject}</span>
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
            onclick={() =>
              app.repo &&
              host.run(app.repo, { type: 'newWorktree', base: app.data?.compare?.base })}
          />
        {/snippet}
      </NavStrip>
    {/snippet}
  </ActionMenu>
{/if}
