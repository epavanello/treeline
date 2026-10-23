<script lang="ts">
  import { app } from '$lib/app.svelte';
  import CommitList from '$lib/components/CommitList.svelte';
  import CompareBar from '$lib/components/CompareBar.svelte';
  import DetailsPanel from '$lib/components/DetailsPanel.svelte';
  import { ROW } from '$lib/components/GraphSvg.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import WorktreeStrip from '$lib/components/WorktreeStrip.svelte';
  import * as Resizable from '$lib/components/ui/resizable';

  let scroller = $state<HTMLElement>();
  let findInput = $state<HTMLInputElement>();

  void app.init();
  app.scrollTo = (hash) => scrollTo(hash);

  function scrollTo(hash: string) {
    const i = app.data?.commits.findIndex((c) => c.hash === hash) ?? -1;
    if (i < 0 || !scroller) return;
    const top = (i + 1) * ROW; // +1 for the sticky header
    if (top < scroller.scrollTop + ROW || top > scroller.scrollTop + scroller.clientHeight - ROW)
      scroller.scrollTo({ top: top - scroller.clientHeight / 2 });
  }

  /** Enter in the find box: jump to the next (Shift: previous) match. */
  function nextMatch(back: boolean) {
    const commits = app.data?.commits.filter((c) => app.matches.has(c.hash)) ?? [];
    if (!commits.length) return;
    const at = commits.findIndex((c) => c.hash === app.selected?.hash);
    const next = commits[(at + (back ? -1 : 1) + commits.length) % commits.length];
    void app.select(next);
    scrollTo(next.hash);
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      findInput?.focus();
      findInput?.select();
    } else if (e.key === 'Escape' && document.activeElement !== findInput) {
      app.closeDetails();
    } else if (
      (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
      app.selected &&
      document.activeElement !== findInput
    ) {
      e.preventDefault();
      const commits = app.data?.commits ?? [];
      const i =
        commits.findIndex((c) => c.hash === app.selected!.hash) + (e.key === 'ArrowDown' ? 1 : -1);
      if (commits[i]) {
        void app.select(commits[i]);
        scrollTo(commits[i].hash);
      }
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="flex h-full flex-col">
  <Toolbar bind:findInput onFindEnter={nextMatch} />
  <CompareBar />
  <WorktreeStrip />
  {#if app.error}
    <div class="border-b px-3 py-2 text-xs text-destructive">{app.error}</div>
  {/if}
  {#if !app.repo && app.repos.length === 0}
    <div class="p-6 text-sm text-muted-foreground">No Git repository found in this workspace.</div>
  {:else}
    <Resizable.PaneGroup direction="vertical" class="min-h-0 flex-1">
      <Resizable.Pane order={1}>
        <CommitList bind:scroller />
      </Resizable.Pane>
      {#if app.selected || app.branchDiff}
        <Resizable.Handle />
        <Resizable.Pane order={2} defaultSize={40} minSize={15}>
          <DetailsPanel />
        </Resizable.Pane>
      {/if}
    </Resizable.PaneGroup>
  {/if}
</div>
