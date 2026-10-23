<script lang="ts">
  import { UNCOMMITTED, type Commit } from '@treeline/shared';
  import { app } from '$lib/app.svelte';
  import { menuItems } from '$lib/menus';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import GraphSvg, { graphWidth, laneColor, ROW } from './GraphSvg.svelte';
  import RefBadge from './RefBadge.svelte';

  let { scroller = $bindable() }: { scroller?: HTMLElement } = $props();

  const commits = $derived(app.data?.commits ?? []);
  const gw = $derived(graphWidth(app.graph.width));
  const cols = $derived(`${Math.min(gw, 320)}px minmax(0,1fr) 170px 140px 76px`);

  const date = (s: number) =>
    new Date(s * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function click(e: MouseEvent, c: Commit) {
    if (e.metaKey || e.ctrlKey) return void app.select(c, true);
    if (app.selected?.hash === c.hash && !app.compareWith) return app.closeDetails();
    void app.select(c);
  }

  // Infinite scroll: load the next page when the sentinel comes into view.
  let sentinel = $state<HTMLElement>();
  $effect(() => {
    if (!sentinel || !scroller) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && void app.loadMore(), {
      root: scroller,
      rootMargin: '400px'
    });
    io.observe(sentinel);
    return () => io.disconnect();
  });
</script>

<div bind:this={scroller} class="h-full overflow-auto" data-testid="commit-list">
  <div
    class="sticky top-0 z-10 grid border-b bg-background text-xs font-semibold text-muted-foreground"
    style="grid-template-columns: {cols}; height: {ROW}px"
  >
    <div class="flex items-center px-2">Graph</div>
    <div class="flex items-center px-2">Description</div>
    <div class="flex items-center px-2">Date</div>
    <div class="flex items-center px-2">Author</div>
    <div class="flex items-center px-2">Commit</div>
  </div>

  <ActionMenu>
    {#snippet children(open)}
      <div class="relative">
        <div class="absolute inset-y-0 left-0 overflow-hidden" style="width: {Math.min(gw, 320)}px">
          <GraphSvg graph={app.graph} {commits} head={app.data?.head ?? null} />
        </div>
        {#each commits as c, i (c.hash)}
          {@const row = app.graph.rows[i]}
          {@const isSelected = app.selected?.hash === c.hash || app.compareWith?.hash === c.hash}
          {@const isMatch = app.matches.has(c.hash)}
          <!-- svelte-ignore a11y_click_events_have_key_events (keyboard nav is global, see App.svelte) -->
          <div
            role="row"
            tabindex="-1"
            data-hash={c.hash}
            class={cn(
              'grid cursor-default text-[13px] hover:bg-accent',
              c.side === 'ahead' && 'bg-ahead/10',
              c.side === 'behind' && 'bg-behind/10',
              isSelected && 'bg-selection text-selection-foreground hover:bg-selection',
              app.find && !isMatch && 'opacity-45',
              c.hash === UNCOMMITTED && 'italic'
            )}
            style="grid-template-columns: {cols}; height: {ROW}px; {c.side
              ? `box-shadow: inset 3px 0 0 var(--${c.side})`
              : ''}"
            title={c.side === 'ahead'
              ? `Only on ${app.data?.currentBranch ?? 'HEAD'}`
              : c.side === 'behind'
                ? `Only on ${app.data?.compare?.base}`
                : undefined}
            onclick={(e) => click(e, c)}
            oncontextmenu={(e) => open(e, menuItems({ kind: 'commit', commit: c }))}
          >
            <div></div>
            <!-- Badges shrink (truncating their names) before they can spill into the Date column -->
            <div class="flex min-w-0 items-center gap-1 overflow-hidden px-2">
              {#each c.refs as ref (ref.kind + ref.name)}
                <span
                  class="contents"
                  role="presentation"
                  oncontextmenu={(e) => open(e, menuItems({ kind: 'ref', ref, commit: c }))}
                >
                  <RefBadge
                    {ref}
                    color={laneColor(row.color)}
                    current={ref.kind === 'head' && ref.name === app.data?.currentBranch}
                    status={ref.worktree
                      ? app.data?.worktrees.find((w) => w.path === ref.worktree)?.status
                      : undefined}
                  />
                </span>
              {/each}
              {#if c.hash === app.data?.compare?.mergeBase}
                <span
                  class="shrink-0 rounded-sm border border-dashed px-1 text-[11px] leading-4 text-muted-foreground"
                  title="{app.data?.currentBranch ?? 'HEAD'} forked from {app.data?.compare
                    ?.base} here"
                >
                  fork point
                </span>
              {/if}
              <span
                class={cn('min-w-24 flex-1 truncate', c.hash === app.data?.head && 'font-semibold')}
              >
                {c.subject}
              </span>
            </div>
            <div class="truncate px-2 leading-6 text-muted-foreground">{date(c.date)}</div>
            <div class="truncate px-2 leading-6 text-muted-foreground" title={c.email}>
              {c.author}
            </div>
            <div class="truncate px-2 font-mono text-xs leading-6 text-muted-foreground">
              {c.hash === UNCOMMITTED ? '*' : c.hash.slice(0, 8)}
            </div>
          </div>
        {/each}
      </div>
    {/snippet}
  </ActionMenu>

  <div bind:this={sentinel} class="py-3 text-center text-xs text-muted-foreground">
    {#if app.data?.hasMore}
      <button class="hover:underline" onclick={() => app.loadMore()}>
        {app.loading ? 'Loading…' : 'Load more commits'}
      </button>
    {:else if commits.length}
      {commits.length} commits
    {/if}
  </div>
</div>
