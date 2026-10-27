<script lang="ts">
  import {
    DEFAULT_VIEW,
    isUncommitted,
    type Column,
    type Commit,
    type Worktree
  } from '@treeline/shared';
  import { LoaderCircle } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { menuItems, worktreeItems } from '$lib/menus';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import GraphSvg, { graphWidth, laneColor, ROW } from './GraphSvg.svelte';
  import RefBadge from './RefBadge.svelte';

  let { scroller = $bindable() }: { scroller?: HTMLElement } = $props();

  const commits = $derived(app.data?.commits ?? []);
  /** Branch and tag details by `kind:name`, for the badges' hover cards. */
  const summaries = $derived(
    new Map(
      [...(app.data?.heads ?? []), ...(app.data?.remoteHeads ?? []), ...(app.data?.tags ?? [])].map(
        (r) => [`${r.ref.kind}:${r.ref.name}`, r]
      )
    )
  );
  /**
   * Worktrees on a detached HEAD, by commit: no branch badge marks them, so the folder gets one (a
   * branch checked out in a worktree shows it on its own badge).
   */
  const detachedAt = $derived.by(() => {
    const at = new Map<string, Worktree[]>();
    // A worktree's Uncommitted Changes row carries its folder badge: not its commit too
    const withRow = new Set(commits.flatMap((c) => (c.worktree ? [c.worktree] : [])));
    for (const w of app.showWorktrees ? (app.data?.worktrees ?? []) : [])
      if (!w.branch && !w.prunable && !withRow.has(w.path))
        at.set(w.head, [...(at.get(w.head) ?? []), w]);
    return at;
  });
  /** The worktree an Uncommitted Changes row belongs to (another worktree's). */
  const worktreeOf = (path: string | undefined) =>
    path ? app.data?.worktrees.filter((w) => w.path === path) : undefined;
  const gw = $derived(graphWidth(app.graph.width));
  // Graph and Description are always there; Description takes whatever the others leave
  const graphW = $derived(app.view.widths.graph ?? Math.min(gw, 320));
  const shown = $derived(
    (['date', 'author', 'commit'] as const).filter((col) => app.view.columns[col])
  );
  const cols = $derived(
    [`${graphW}px`, 'minmax(0,1fr)', ...shown.map((col) => `${app.view.widths[col]}px`)].join(' ')
  );
  const HEADERS: Record<Column, string> = { date: 'Date', author: 'Author', commit: 'Commit' };
  const MIN = { graph: 24, date: 60, author: 50, commit: 40 };

  /**
   * Drag a column edge: the graph's right edge, or the left edge of a right-hand column (which
   * grows leftwards). The width is saved when the drag ends.
   */
  function resize(e: PointerEvent, col: 'graph' | Column) {
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const from = col === 'graph' ? graphW : app.view.widths[col];
    const sign = col === 'graph' ? 1 : -1;
    const move = (m: PointerEvent) =>
      (app.view.widths[col] = Math.max(MIN[col], Math.round(from + (m.clientX - startX) * sign)));
    handle.addEventListener('pointermove', move);
    handle.addEventListener(
      'pointerup',
      () => {
        handle.removeEventListener('pointermove', move);
        app.setView({});
      },
      { once: true }
    );
  }
  /** Double-click a handle: back to the default width (the graph fits its lanes again). */
  function reset(col: 'graph' | Column) {
    if (col === 'graph') app.view.widths.graph = null;
    else app.view.widths[col] = DEFAULT_VIEW.widths[col];
    app.setView({});
  }

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
    <div class="relative flex items-center px-2">
      Graph{@render handle('graph', 'right')}
    </div>
    <div class="flex items-center px-2">Description</div>
    {#each shown as col (col)}
      <div class="relative flex items-center px-2">
        {@render handle(col, 'left')}{HEADERS[col]}
      </div>
    {/each}
  </div>

  {#if app.working}
    <!-- A reload you asked for: say what it's doing over the list it will replace -->
    <div class="pointer-events-none sticky top-7 z-20 flex h-0 justify-center">
      <span
        class="flex h-7 items-center gap-1.5 rounded-full border bg-popover px-3 text-xs text-popover-foreground shadow-md"
      >
        <LoaderCircle class="size-3.5 animate-spin" />
        {app.working.text}
      </span>
    </div>
  {/if}

  {#if !app.data && !app.error}
    <!-- First load: the shape of what's coming, rather than an empty page -->
    <div aria-busy="true" aria-label="Loading the history">
      {#each Array.from({ length: 16 }, (_, i) => i) as i (i)}
        <div class="flex items-center gap-3 px-3" style="height: {ROW}px">
          <span
            class="size-2.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/25"
            style="margin-left: {(i % 3) * 14}px"
          ></span>
          <span
            class="h-2.5 animate-pulse rounded-sm bg-muted-foreground/15"
            style="width: {25 + ((i * 37) % 40)}%"
          ></span>
          <span class="ml-auto h-2.5 w-28 animate-pulse rounded-sm bg-muted-foreground/10"></span>
          <span class="h-2.5 w-20 animate-pulse rounded-sm bg-muted-foreground/10"></span>
        </div>
      {/each}
    </div>
  {/if}

  {#snippet handle(col: 'graph' | Column, side: 'left' | 'right')}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class={cn(
        'absolute inset-y-1 z-10 w-1.5 cursor-col-resize rounded-full hover:bg-ring/60',
        side === 'right' ? '-right-0.75' : '-left-0.75'
      )}
      title="Drag to resize · Double-click to reset"
      onpointerdown={(e) => resize(e, col)}
      ondblclick={() => reset(col)}
    ></span>
  {/snippet}

  <ActionMenu>
    {#snippet children(open)}
      <div class={cn('relative transition-opacity', app.working && 'opacity-40')}>
        <!-- Drawn over the rows: clicks go through to them -->
        <div
          class="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          style="width: {graphW}px"
        >
          <GraphSvg graph={app.graph} {commits} head={app.data?.head ?? null} />
        </div>
        {#each commits as c, i (c.hash)}
          {@const row = app.graph.rows[i]}
          {@const isSelected = app.selected?.hash === c.hash || app.compareWith?.hash === c.hash}
          {@const isMatch = app.matches.has(c.hash)}
          <!-- A branch and its upstream on the same commit share one badge -->
          {@const upstreams = c.refs.filter((r) =>
            c.refs.some((h) => h.kind === 'head' && h.upstream?.name === r.name)
          )}
          <!-- svelte-ignore a11y_click_events_have_key_events (keyboard nav is global, see App.svelte) -->
          <div
            role="row"
            tabindex="-1"
            data-hash={c.hash}
            class={cn(
              'grid cursor-default text-[13px] hover:bg-accent data-menu-open:bg-accent',
              c.side === 'same' && 'text-muted-foreground',
              isSelected && 'bg-selection text-selection-foreground hover:bg-selection',
              app.find && !isMatch && 'opacity-45',
              isUncommitted(c) && 'italic'
            )}
            style="grid-template-columns: {cols}; height: {ROW}px; {c.side
              ? `box-shadow: inset 3px 0 0 var(--${c.side})`
              : ''}"
            title={c.side === 'ahead'
              ? `Only on ${app.data?.currentBranch ?? 'HEAD'}`
              : c.side === 'behind'
                ? `Only on ${app.data?.compare?.base}`
                : c.side === 'same'
                  ? `Its changes are on both ${app.data?.currentBranch ?? 'HEAD'} and ${app.data?.compare?.base}, under different commits (rebased or cherry-picked)`
                  : undefined}
            onclick={(e) => click(e, c)}
            oncontextmenu={(e) => open(e, menuItems({ kind: 'commit', commit: c }))}
          >
            <div></div>
            <!-- Badges shrink (truncating their names) before they can spill into the Date column -->
            <div class="flex min-w-0 items-center gap-1 overflow-hidden px-2">
              {#each c.refs.filter((r) => r.kind !== 'remote' || !upstreams.includes(r)) as ref (ref.kind + ref.name)}
                {@const remote = upstreams.find((r) => r.name === ref.upstream?.name)}
                <span
                  class="contents"
                  role="presentation"
                  oncontextmenu={(e) => open(e, menuItems({ kind: 'ref', ref, commit: c }))}
                >
                  <RefBadge
                    {ref}
                    {remote}
                    card={summaries.get(`${ref.kind}:${ref.name}`)}
                    onremotemenu={(e, r) => open(e, menuItems({ kind: 'ref', ref: r, commit: c }))}
                    color={laneColor(row.color)}
                    current={ref.kind === 'head' && ref.name === app.data?.currentBranch}
                    busy={app.isRunning(ref.name, ref.worktree, remote?.name)}
                    status={ref.worktree
                      ? app.data?.worktrees.find((w) => w.path === ref.worktree)?.status
                      : undefined}
                  />
                </span>
              {/each}
              {#each worktreeOf(c.worktree) ?? detachedAt.get(c.hash) ?? [] as w (w.path)}
                {@const folder = w.path.split(/[\\/]/).pop()!}
                <span
                  class="contents"
                  role="presentation"
                  oncontextmenu={(e) => open(e, worktreeItems(w))}
                >
                  <RefBadge
                    ref={{ kind: 'head', name: folder, worktree: w.path }}
                    card={{
                      ref: { kind: 'head', name: folder },
                      hash: w.head,
                      date: w.headDate ?? 0,
                      subject: w.headSubject ?? ''
                    }}
                    detached
                    color={laneColor(row.color)}
                    current={w.current}
                    busy={app.isRunning(w.path)}
                    status={w.status}
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
            {#if app.view.columns.date}
              <div class="truncate px-2 leading-6 text-muted-foreground">{date(c.date)}</div>
            {/if}
            {#if app.view.columns.author}
              <div class="flex items-center gap-1.5 px-2 text-muted-foreground" title={c.email}>
                {#if c.email}<AuthorAvatar name={c.author} email={c.email} />{/if}
                <span class="truncate leading-6">{c.author}</span>
              </div>
            {/if}
            {#if app.view.columns.commit}
              <div class="flex items-center px-2 font-mono text-xs text-muted-foreground">
                {#if app.isRunning(c.hash)}
                  <LoaderCircle class="size-3 animate-spin" />
                {:else}
                  <span class="truncate">{isUncommitted(c) ? '*' : c.hash.slice(0, 8)}</span>
                {/if}
              </div>
            {/if}
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
