<script lang="ts">
  import { ago, type Action, type Compare } from '@treeline/shared';
  import {
    ArrowDown,
    ArrowUp,
    ArrowUpToLine,
    Equal,
    FileDiff,
    GitBranch,
    GitMerge,
    TriangleAlert
  } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import MultiFilter from './MultiFilter.svelte';
  import Tip from './Tip.svelte';

  /** HEAD vs a base branch: the "how far am I from main" bar under the toolbar. */
  const c = $derived(app.data?.compare ?? null);
  const head = $derived(app.data?.currentBranch ?? 'HEAD');
  const run = (action: Action) => app.repo && host.run(app.repo, action);
  const toggle = 'aria-pressed:bg-selection aria-pressed:text-selection-foreground';
  const commits = (n: number) => `${n} commit${n === 1 ? '' : 's'}`;

  const sides = (c: Compare) => [
    {
      side: 'ahead' as const,
      count: c.ahead,
      icon: ArrowUp,
      color: 'text-ahead',
      label: `${c.ahead} ahead`,
      title: `${commits(c.ahead)} ahead`,
      body: `On ${head} but not on ${c.base}: what a pull request into ${c.base} would bring. Tinted green in the graph.`
    },
    {
      side: 'behind' as const,
      count: c.behind,
      icon: ArrowDown,
      color: 'text-behind',
      label: `${c.behind} behind`,
      title: `${commits(c.behind)} behind`,
      body: `On ${c.base} but not on ${head} yet. Tinted blue in the graph. Rebase or Merge to bring them in.`
    },
    {
      side: 'same' as const,
      count: c.same,
      icon: Equal,
      color: 'text-same',
      label: `${c.same} already in ${c.base}`,
      title: `${commits(c.same)} already in ${c.base}`,
      body: `Their changes are on ${c.base} under other commits: ${head} was rebased onto it, or merged with "Rebase and merge" or a cherry-pick. They're dimmed in the graph, together with their copies.${c.ahead ? '' : ` Nothing on ${head} is missing from ${c.base}: the branch is merged.`}`
    }
  ];
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
      <!-- The counters are filters too: show only those commits (any combination), click again for all -->
      {#each sides(c) as f (f.side)}
        {#if f.count || app.focus.includes(f.side)}
          <Button
            variant="ghost"
            size="xs"
            class="{toggle} {f.color}"
            icon={f.icon}
            aria-pressed={app.focus.includes(f.side)}
            hint={{
              title: f.title,
              body: f.body,
              note: app.focus.includes(f.side)
                ? 'Click to stop filtering on these.'
                : 'Click to show only these in the graph (with the fork point); combine with the others.'
            }}
            onclick={() => app.toggleFocus(f.side)}
          >
            {f.label}
          </Button>
        {/if}
      {/each}
      {#if c.rewritten}
        <Tip
          hint={{
            title: 'Rewritten history',
            body: `${commits(c.same)} of ${head} are copies of commits on ${c.base}, and the two histories ${c.mergeBaseDate ? `only meet ${ago(c.mergeBaseDate)}` : 'never meet'}: one side was rewritten (filter-repo, a forced rebase). Ahead and behind are mostly noise.`,
            warn: `Rather than merging, start a fresh branch from ${c.base} and bring your own changes over (the ↑ commits, and anything uncommitted).`
          }}
        >
          {#snippet children(trigger)}
            <span
              {...trigger}
              class="flex cursor-default items-center gap-1 rounded-sm border border-dirty/40 bg-dirty/10 px-1.5 leading-5 text-dirty"
            >
              <TriangleAlert class="size-3.5" /> Rewritten history
            </span>
          {/snippet}
        </Tip>
      {/if}
    {/if}
    <span class="flex items-center gap-1.5">
      <span class="text-muted-foreground">vs</span>
      <MultiFilter
        single
        items={app.data.branches}
        selected={c ? [c.base] : []}
        noun="branches"
        allLabel="Pick a base branch"
        hint={{
          title: 'Base branch',
          body: `What ${head} is compared with. By default the remote's default branch (origin/HEAD), then main or master. Right-click any branch or tag in the graph to compare with it.`
        }}
        onchange={([b]) => app.setBase(b ?? null)}
      />
    </span>

    {#if c}
      <div class="ml-auto flex items-center gap-1">
        {#if c.behind}
          <Button
            variant="ghost"
            size="xs"
            icon={ArrowUpToLine}
            hint={{
              title: `Rebase ${head} onto ${c.base}`,
              body: `Replays your ${commits(c.ahead)} on top of ${c.base}, so ${head} gets its ${commits(c.behind)} and a straight history.`,
              warn: `Rewrites your commits: if ${head} is already pushed you will need to force push. Conflicts pause the rebase.`,
              command: `git rebase ${c.base}`
            }}
            onclick={() => run({ type: 'rebase', target: c.base })}
          >
            Rebase
          </Button>
          <Button
            variant="ghost"
            size="xs"
            icon={GitMerge}
            hint={{
              title: `Merge ${c.base} into ${head}`,
              body: `Adds the ${commits(c.behind)} of ${c.base} to ${head} with a merge commit. Your commits stay as they are, so it's safe after pushing.`,
              warn: 'Conflicts stop the merge so you can resolve them.',
              command: `git merge --no-edit ${c.base}`
            }}
            onclick={() => run({ type: 'merge', target: c.base })}
          >
            Merge
          </Button>
        {/if}
        <Button
          variant="outline"
          size="xs"
          class={toggle}
          icon={FileDiff}
          aria-pressed={!!app.branchDiff}
          hint={{
            title: `Everything changed vs ${c.base}`,
            body: `Lists every file changed since ${head} forked from ${c.base}, uncommitted changes included: what the pull request will show. Diffs open on your real files, so Go to Definition, errors and links work.`
          }}
          disabled={!c.mergeBase}
          onclick={() => (app.branchDiff ? app.closeDetails() : app.openBranchDiff())}
        >
          Diff
        </Button>
      </div>
    {/if}
  </div>
{/if}
