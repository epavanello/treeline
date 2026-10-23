<script lang="ts">
  import { since, type RefSummary } from '@treeline/shared';
  import { Check, ChevronDown, Cloud, Eye, EyeOff, FolderGit2, GitBranch } from '@lucide/svelte';
  import { mergeProps } from 'svelte-toolbelt';
  import { app } from '$lib/app.svelte';
  import { menuItems, refCommit } from '$lib/menus';
  import { Button } from '$lib/components/ui/button';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import BranchState from './BranchState.svelte';
  import RefCard from './RefCard.svelte';
  import Tip from './Tip.svelte';

  /**
   * The branch filter, and the place to look over every branch (the team's remote ones included,
   * with "Show Remote Branches"): how old, where it stands vs the compare base, its card on hover,
   * its actions on right-click (deleting a stale remote branch, say). Ticked branches filter the graph.
   */
  const all = $derived([
    ...(app.data?.heads ?? []),
    ...(app.showRemotes ? (app.data?.remoteHeads ?? []) : [])
  ]);
  // Shown (ticked) and hidden branches come first, in their own sections
  const groups = $derived([
    { heading: 'Shown', items: all.filter((r) => app.branches.includes(r.ref.name)) },
    { heading: 'Hidden', items: all.filter((r) => app.hidden.includes(r.ref.name)) },
    ...(['head', 'remote'] as const).map((kind) => ({
      heading: kind === 'head' ? 'Local' : 'Remote',
      items: all.filter(
        (r) =>
          r.ref.kind === kind &&
          !app.branches.includes(r.ref.name) &&
          !app.hidden.includes(r.ref.name)
      )
    }))
  ]);
  const label = $derived(
    [
      app.branches.length === 0
        ? 'Show All'
        : app.branches.length === 1
          ? app.branches[0]
          : `${app.branches.length} shown`,
      app.hidden.length && `${app.hidden.length} hidden`
    ]
      .filter(Boolean)
      .join(' · ')
  );

  function toggle(name: string) {
    app.setBranches(
      app.branches.includes(name) ? app.branches.filter((b) => b !== name) : [...app.branches, name]
    );
  }
  const iconOf = (r: RefSummary) =>
    r.ref.worktree ? FolderGit2 : r.ref.kind === 'remote' ? Cloud : GitBranch;
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        size="xs"
        class="max-w-56 justify-between"
        hint={{
          title: 'Branches',
          body: 'Tick branches to show only their history, or hide some (eye button) to leave out the commits only they have. Each row shows how old the branch is and where it stands against the compare base; hover it for details, right-click it for its actions.'
        }}
      >
        <span class="truncate">{label}</span>
        <ChevronDown class="size-3 opacity-60" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-96 p-0" align="start">
    <ActionMenu>
      {#snippet children(open)}
        <Command.Root>
          <Command.Input placeholder="Filter branches…" class="h-8 text-[13px] md:text-[13px]" />
          <Command.List class="max-h-96">
            <Command.Empty>No branches.</Command.Empty>
            <Command.Item
              value="__all"
              class="py-1 text-[13px]"
              onSelect={() => app.showAllBranches()}
            >
              <Check
                class={cn('size-4', (app.branches.length || app.hidden.length) && 'invisible')}
              />
              Show All
            </Command.Item>
            {#each groups as g (g.heading)}
              {#if g.items.length}
                <Command.Group heading={g.heading}>
                  {#each g.items as r (r.ref.name)}
                    {@const Icon = iconOf(r)}
                    {#snippet card()}
                      <RefCard
                        {r}
                        footer="Click: show it (tick) · Eye: hide it · Right-click: its actions"
                      />
                    {/snippet}
                    <Tip content={card} side="right">
                      {#snippet children(trigger)}
                        <Command.Item
                          {...mergeProps(trigger, {
                            oncontextmenu: (e: MouseEvent) =>
                              open(e, menuItems({ kind: 'ref', ref: r.ref, commit: refCommit(r) }))
                          })}
                          value={r.ref.name}
                          class="gap-1.5 py-1 text-[13px]"
                          onSelect={() => toggle(r.ref.name)}
                        >
                          <Check
                            class={cn('size-4', !app.branches.includes(r.ref.name) && 'invisible')}
                          />
                          <Icon class={cn('size-3.5', r.ref.kind === 'remote' && 'opacity-60')} />
                          <span
                            class={cn(
                              'truncate',
                              r.ref.name === app.data?.currentBranch && 'font-semibold',
                              app.hidden.includes(r.ref.name) && 'line-through opacity-60'
                            )}
                          >
                            {r.ref.name}
                          </span>
                          <span
                            class="ml-auto flex shrink-0 gap-1.5 text-[11px] text-muted-foreground tabular-nums"
                          >
                            <BranchState {r} />
                            <span class="w-7 text-right">{since(r.date)}</span>
                          </span>
                          <!-- Hide from "all" (or bring back), without ticking the row -->
                          <button
                            class="-my-0.5 rounded-sm p-0.5 opacity-60 hover:bg-accent hover:opacity-100"
                            title={app.hidden.includes(r.ref.name)
                              ? 'Unhide: bring its commits back into the graph'
                              : 'Hide: leave out the commits only this branch has'}
                            onclick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              app.toggleHidden(r.ref.name);
                            }}
                            onpointerdown={(e) => e.stopPropagation()}
                          >
                            {#if app.hidden.includes(r.ref.name)}
                              <Eye class="size-3.5" />
                            {:else}
                              <EyeOff class="size-3.5" />
                            {/if}
                          </button>
                        </Command.Item>
                      {/snippet}
                    </Tip>
                  {/each}
                </Command.Group>
              {/if}
            {/each}
          </Command.List>
        </Command.Root>
      {/snippet}
    </ActionMenu>
  </Popover.Content>
</Popover.Root>
