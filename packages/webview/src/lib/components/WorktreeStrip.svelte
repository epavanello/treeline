<script lang="ts">
  import type { Worktree } from '@treeline/shared';
  import { FolderGit2, Plus, TriangleAlert } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { worktreeItems } from '$lib/menus';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import WorktreeState from './WorktreeState.svelte';

  /** Every worktree of the repository, one chip each. Shown when there is more than the main one. */
  const worktrees = $derived(app.data?.worktrees ?? []);
  const folder = (path: string) => path.split(/[\\/]/).pop();

  /** Click: jump to the commit the worktree is on (when it's loaded). */
  function reveal(w: Worktree) {
    const commit = app.data?.commits.find((c) => c.hash === w.head);
    if (!commit) return;
    void app.select(commit);
    app.scrollTo(commit.hash);
  }
</script>

{#if worktrees.length > 1}
  <ActionMenu>
    {#snippet children(open)}
      <div
        class="flex min-h-8 shrink-0 items-center gap-1.5 overflow-x-auto border-b px-2 py-1 text-xs"
        data-testid="worktrees"
      >
        <span class="mr-1 text-muted-foreground">Worktrees</span>
        {#each worktrees as w (w.path)}
          <button
            class={cn(
              'flex h-6 max-w-80 shrink-0 items-center gap-1.5 rounded-sm border px-2 hover:bg-accent',
              w.current && 'border-ring'
            )}
            title="{w.path}{w.current
              ? ' (shown in the graph)'
              : ''}&#10;Click: jump to its commit · Double-click: open in a new window · Right-click: more"
            onclick={() => reveal(w)}
            ondblclick={() => !w.current && !w.prunable && host.openFolder(w.path)}
            oncontextmenu={(e) => open(e, worktreeItems(w))}
          >
            {#if w.prunable}
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
        {/each}
        <Button
          variant="ghost"
          size="icon-xs"
          icon={Plus}
          title="New worktree from HEAD…"
          onclick={() => app.repo && host.run(app.repo, { type: 'addWorktree', target: 'HEAD' })}
        />
      </div>
    {/snippet}
  </ActionMenu>
{/if}
