<script lang="ts">
  import { ago, type Commit, type RefSummary } from '@treeline/shared';
  import { FolderGit2, GitBranch, LoaderCircle, Plus, Tag } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { menuItems } from '$lib/menus';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import NavStrip from './NavStrip.svelte';
  import WorktreeState from './WorktreeState.svelte';
  import Tip from './Tip.svelte';

  /** The local branches or the tags, most recent first, as a row of chips. */
  let { kind }: { kind: 'heads' | 'tags' } = $props();

  // Repositories with hundreds of deploy tags: the most recent ones are what matters here
  const LIMIT = 100;
  const all = $derived(app.data?.[kind] ?? []);
  const items = $derived(all.slice(0, LIMIT));
  const shown = $derived(kind === 'heads' ? app.view.branches : app.view.tags);
  const STALE = 30 * 86400;

  /** "5m", "3h", "2d", "3w", "4mo", "1y": how long ago, for a chip. */
  function since(unix: number) {
    const s = Date.now() / 1000 - unix;
    const steps = [
      [365 * 86400, 'y'],
      [30 * 86400, 'mo'],
      [7 * 86400, 'w'],
      [86400, 'd'],
      [3600, 'h'],
      [60, 'm']
    ] as const;
    for (const [n, unit] of steps) if (s >= n) return `${Math.floor(s / n)}${unit}`;
    return 'now';
  }

  /** The loaded commit, or a stand-in carrying what the menus need. */
  const commitOf = (r: RefSummary): Commit =>
    app.data?.commits.find((c) => c.hash === r.hash) ?? {
      hash: r.hash,
      parents: [],
      author: '',
      email: '',
      date: r.date,
      subject: r.subject,
      refs: []
    };
</script>

{#if shown && items.length}
  <ActionMenu>
    {#snippet children(open)}
      <NavStrip label={kind === 'heads' ? 'Branches' : 'Tags'}>
        {#each items as r (r.ref.name)}
          {@const current = kind === 'heads' && r.ref.name === app.data?.currentBranch}
          {@const Icon = r.ref.worktree ? FolderGit2 : kind === 'heads' ? GitBranch : Tag}
          {#snippet details()}
            <div class="flex items-center gap-1.5">
              <Icon class="size-3.5 shrink-0" />
              <span class="font-semibold">{r.ref.name}</span>
              {#if current || r.ref.annotated || r.ref.worktree}
                <span class="rounded-sm border px-1 text-[10px] leading-4 text-muted-foreground">
                  {current ? 'checked out' : r.ref.worktree ? 'in a worktree' : 'annotated'}
                </span>
              {/if}
            </div>
            <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt class="text-muted-foreground">{kind === 'tags' ? 'Tagged' : 'Last commit'}</dt>
              <dd>
                <span class={cn(Date.now() / 1000 - r.date > STALE && 'text-dirty')}>
                  {ago(r.date)}
                </span>
                <span class="text-muted-foreground">
                  · {new Date(r.date * 1000).toLocaleDateString()}
                </span>
              </dd>
              <dt class="text-muted-foreground">Commit</dt>
              <dd>
                <span class="font-mono">{r.hash.slice(0, 8)}</span>
                <span class="line-clamp-2 block text-muted-foreground">{r.subject}</span>
              </dd>
              {#if kind === 'heads'}
                {@const up = r.ref.upstream}
                <dt class="text-muted-foreground">Upstream</dt>
                <dd>
                  {#if !up}
                    Not pushed yet
                  {:else if up.gone}
                    <span class="text-dirty">Deleted on the remote</span>
                  {:else}
                    {[up.ahead && `↑ ${up.ahead} to push`, up.behind && `↓ ${up.behind} to pull`]
                      .filter(Boolean)
                      .join(' · ') || 'In sync'}
                  {/if}
                  {#if up}
                    <span class="block font-mono text-[11px] text-muted-foreground">{up.name}</span>
                  {/if}
                </dd>
              {/if}
              {#if r.ref.worktree}
                <dt class="text-muted-foreground">Worktree</dt>
                <dd class="font-mono text-[11px] text-muted-foreground">{r.ref.worktree}</dd>
              {/if}
            </dl>
            <p class="border-t pt-1.5 text-[11px] text-muted-foreground">
              Click: show it in the graph · Right-click: {kind === 'heads'
                ? 'pull, push and more'
                : 'tag actions'}
            </p>
          {/snippet}
          <Tip content={details}>
            {#snippet children(trigger)}
              <button
                {...trigger}
                class={cn(
                  'flex h-6 max-w-64 shrink-0 items-center gap-1.5 rounded-sm border px-2 hover:bg-accent data-menu-open:bg-accent',
                  current && 'border-ring font-semibold'
                )}
                onclick={() => app.reveal(r.hash)}
                oncontextmenu={(e) =>
                  open(e, menuItems({ kind: 'ref', ref: r.ref, commit: commitOf(r) }))}
              >
                {#if app.isRunning(r.ref.name, r.ref.worktree)}
                  <LoaderCircle class="size-3.5 shrink-0 animate-spin" />
                {:else}
                  <Icon class="size-3.5 shrink-0" />
                {/if}
                <span class="truncate">{r.ref.name}</span>
                {#if kind === 'heads'}
                  {@const up = r.ref.upstream}
                  <WorktreeState
                    changes={false}
                    status={{
                      changes: 0,
                      ahead: up?.ahead ?? 0,
                      behind: up?.behind ?? 0,
                      upstream: up && !up.gone ? up.name : null
                    }}
                  />
                {/if}
                <span class="shrink-0 text-muted-foreground tabular-nums">{since(r.date)}</span>
              </button>
            {/snippet}
          </Tip>
        {/each}
        {#if all.length > LIMIT}
          <span class="shrink-0 px-1 text-muted-foreground">+{all.length - LIMIT} older</span>
        {/if}
        {#snippet action()}
          {#if kind === 'heads' && app.data?.head}
            <Button
              variant="ghost"
              size="icon-xs"
              icon={Plus}
              hint={{
                title: 'New branch',
                body: 'Asks for a name, creates the branch at the current commit and switches to it.',
                command: 'git checkout -b <name>'
              }}
              onclick={() =>
                app.repo && host.run(app.repo, { type: 'createBranch', hash: app.data!.head! })}
            />
          {/if}
        {/snippet}
      </NavStrip>
    {/snippet}
  </ActionMenu>
{/if}
