<script lang="ts">
  import type { Action } from '@treeline/shared';
  import { ArrowDown, ArrowUp, Crosshair, FileDiff, GitBranch } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import MultiFilter from './MultiFilter.svelte';

  /** HEAD vs a base branch: the "how far am I from main" bar under the toolbar. */
  const c = $derived(app.data?.compare ?? null);
  const head = $derived(app.data?.currentBranch ?? 'HEAD');
  const run = (action: Action) => app.repo && host.run(app.repo, action);
  const toggle = 'aria-pressed:bg-selection aria-pressed:text-selection-foreground';
</script>

{#if app.data?.head}
  <div
    class="flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1 text-xs"
    data-testid="compare-bar"
  >
    <span class="flex items-center gap-1 font-semibold">
      <GitBranch class="size-3.5" />{head}
    </span>
    {#if c}
      <span
        class="flex items-center gap-0.5 text-ahead"
        title="{c.ahead} commits on {head} that {c.base} doesn't have (marked green)"
      >
        <ArrowUp class="size-3.5" />{c.ahead} ahead
      </span>
      <span
        class="flex items-center gap-0.5 text-behind"
        title="{c.behind} commits on {c.base} that {head} doesn't have (marked blue)"
      >
        <ArrowDown class="size-3.5" />{c.behind} behind
      </span>
    {/if}
    <span class="flex items-center gap-1.5">
      <span class="text-muted-foreground">vs</span>
      <MultiFilter
        single
        items={app.data.branches}
        selected={c ? [c.base] : []}
        noun="branches"
        allLabel="Pick a base branch"
        onchange={([b]) => app.setBase(b ?? null)}
      />
    </span>

    {#if c}
      <div class="ml-auto flex items-center gap-1">
        {#if c.behind}
          <Button
            variant="ghost"
            size="xs"
            title="Rebase {head} onto {c.base} (git rebase {c.base})"
            onclick={() => run({ type: 'rebase', target: c.base })}
          >
            Rebase
          </Button>
          <Button
            variant="ghost"
            size="xs"
            title="Merge {c.base} into {head} (git merge {c.base})"
            onclick={() => run({ type: 'merge', target: c.base })}
          >
            Merge
          </Button>
        {/if}
        <Button
          variant="ghost"
          size="xs"
          class={toggle}
          icon={Crosshair}
          aria-pressed={app.focus}
          title="Show only the commits that differ between {head} and {c.base}"
          disabled={!c.ahead && !c.behind && !app.focus}
          onclick={() => app.toggleFocus()}
        >
          Only ↑↓
        </Button>
        <Button
          variant="outline"
          size="xs"
          class={toggle}
          icon={FileDiff}
          aria-pressed={!!app.branchDiff}
          title="Every file changed since {head} forked from {c.base}, uncommitted changes included. Diffs open on the real files, so Go to Definition works."
          disabled={!c.mergeBase}
          onclick={() => (app.branchDiff ? app.closeDetails() : app.openBranchDiff())}
        >
          Diff
        </Button>
      </div>
    {/if}
  </div>
{/if}
