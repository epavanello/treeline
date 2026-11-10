<script lang="ts">
  import { since, type RefSummary } from '@treeline/shared';
  import { Check, ChevronDown, Cloud, Eye, EyeOff, FolderGit2, GitBranch, X } from '@lucide/svelte';
  import { mergeProps } from 'svelte-toolbelt';
  import { app } from '$lib/app.svelte';
  import { owner, type RuleCriteria } from '$lib/filters';
  import { menuItems, refCommit } from '$lib/menus';
  import { Button } from '$lib/components/ui/button';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import BranchState from './BranchState.svelte';
  import RefCard from './RefCard.svelte';
  import RefName from './RefName.svelte';
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
    {
      heading: app.rule ? 'In the graph' : 'Shown',
      items: all.filter((r) => app.branches.includes(r.ref.name))
    },
    { heading: 'Hidden', items: all.filter((r) => app.hidden.includes(r.ref.name)) },
    ...(['head', 'remote'] as const).map((kind) => ({
      heading: `${kind === 'head' ? 'Local' : 'Remote'}${app.rule ? ', not in the graph' : ''}`,
      items: all.filter(
        (r) =>
          r.ref.kind === kind &&
          !app.branches.includes(r.ref.name) &&
          !app.hidden.includes(r.ref.name)
      )
    }))
  ]);
  /**
   * The filters on top: criteria combined (each group one choice, "Any" = not set), or "Like a row":
   * that row's own filter. Either drives the ticked branches, kept up to date (see `app.rule`).
   */
  const github = $derived(app.pulls?.status === 'ok');
  const criteria = $derived(app.rule && !('follow' in app.rule) ? app.rule : {});
  const follow = $derived(app.rule && 'follow' in app.rule ? app.rule.follow : null);
  type Pill = { value?: string; label: string; hint?: string; disabled?: boolean };
  const GROUPS: { key: keyof RuleCriteria; label: string; pills: Pill[] }[] = $derived([
    {
      key: 'owner',
      label: 'Whose',
      pills: [
        { label: 'Anyone' },
        { value: 'mine', label: 'Mine', hint: 'Branches whose own commits are mostly yours.' }
      ]
    },
    {
      key: 'state',
      label: 'State',
      pills: [
        { label: 'Any' },
        {
          value: 'unmerged',
          label: 'Not merged',
          hint: "Changes the compare base doesn't have yet."
        },
        {
          value: 'merged',
          label: 'Merged',
          hint: 'All its changes are in the compare base, or its pull request was merged.'
        },
        { value: 'stale', label: 'Stale', hint: 'No commit for 30 days.' }
      ]
    },
    {
      key: 'pull',
      label: 'Pull request',
      pills: [
        { label: 'Any' },
        ...[
          { value: 'open', label: 'Open', hint: 'It has an open pull request (drafts too).' },
          { value: 'mine', label: 'Mine', hint: 'It has an open pull request you opened.' },
          {
            value: 'review',
            label: 'To review',
            hint: 'Its pull request asks you for a review.'
          },
          {
            value: 'work',
            label: 'Needs work',
            hint: 'Its pull request has changes requested, failing checks or open conversations.'
          }
        ].map((p) => ({
          ...p,
          disabled: !github,
          hint: github ? p.hint : `${p.hint} Connect GitHub (Pull Requests row) first.`
        }))
      ]
    }
  ]);
  const ROWS = [
    {
      value: 'branches',
      label: 'Branches',
      hint: 'The branches the Branches row shows: change its filter there and the graph follows.'
    },
    {
      value: 'pulls',
      label: 'Pull Requests',
      hint: "The branches of the pull requests the Pull Requests row shows, with that row's filter."
    },
    {
      value: 'worktrees',
      label: 'Worktrees',
      hint: "The branches checked out in the worktrees the Worktrees row shows, with that row's filter."
    }
  ] as const;
  const NAMES = {
    owner: { mine: 'Mine' },
    state: { unmerged: 'Not merged', merged: 'Merged', stale: 'Stale' },
    pull: { open: 'PR open', mine: 'My PR', review: 'PR to review', work: 'PR needs work' }
  } as Record<string, Record<string, string>>;
  /** The rule in a few words, for the button. */
  const ruleText = $derived(
    follow
      ? `Like ${ROWS.find((r) => r.value === follow)!.label}`
      : (['owner', 'state', 'pull'] as const)
          .map((k) => criteria[k] && NAMES[k][criteria[k]])
          .filter(Boolean)
          .join(' · ')
  );
  const base = $derived(app.data?.compare?.base);
  const label = $derived(
    app.rule
      ? `${ruleText} (${app.ruleResult?.matched ?? '…'})`
      : [
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
  const setCriterion = (key: keyof RuleCriteria, value: string | undefined) =>
    app.setRule({ ...criteria, [key]: value } as RuleCriteria);

  function toggle(name: string) {
    app.setBranches(
      app.branches.includes(name) ? app.branches.filter((b) => b !== name) : [...app.branches, name]
    );
  }
  const iconOf = (r: RefSummary) =>
    r.ref.worktree ? FolderGit2 : r.ref.kind === 'remote' ? Cloud : GitBranch;
</script>

{#snippet pill(p: Pill, on: boolean, pick: () => void)}
  <Tip hint={p.hint} side="bottom">
    {#snippet children(trigger)}
      <button
        {...trigger}
        type="button"
        disabled={p.disabled}
        aria-pressed={on}
        onclick={pick}
        class={cn(
          'rounded-full border px-2 py-px text-[12px] whitespace-nowrap hover:bg-accent disabled:pointer-events-none disabled:opacity-50',
          on ? 'border-ring bg-accent font-medium' : 'border-input text-muted-foreground'
        )}
      >
        {p.label}
      </button>
    {/snippet}
  </Tip>
{/snippet}

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
  <Popover.Content class="w-[30rem] p-0" align="start">
    <div class="space-y-1.5 border-b p-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-muted-foreground"
          >Show in the graph only branches…</span
        >
        {#if app.rule}
          <button
            type="button"
            class="flex items-center gap-0.5 rounded-sm px-1 text-[12px] text-link hover:underline"
            onclick={() => app.setRule(null)}
          >
            <X class="size-3" /> Clear
          </button>
        {/if}
      </div>
      {#each GROUPS as g (g.key)}
        <div class="flex items-center gap-1">
          <span class="w-24 shrink-0 text-[12px] text-muted-foreground">{g.label}</span>
          <div class="flex flex-wrap gap-1">
            {#each g.pills as p (p.label)}
              {@render pill(p, !follow && criteria[g.key] === p.value, () =>
                setCriterion(g.key, p.value)
              )}
            {/each}
          </div>
        </div>
      {/each}
      <div class="flex items-center gap-1 border-t pt-1.5">
        <span class="w-24 shrink-0 text-[12px] text-muted-foreground">Or like the row</span>
        <div class="flex flex-wrap gap-1">
          {#each ROWS as r (r.value)}
            {@render pill(
              { ...r, disabled: r.value === 'pulls' && !github },
              follow === r.value,
              () => app.setRule(follow === r.value ? null : { follow: r.value })
            )}
          {/each}
        </div>
      </div>
      {#if app.rule && app.ruleResult}
        <p class="rounded-sm bg-muted px-2 py-1 text-[12px]">
          {#if app.ruleResult.matched}
            <span class="font-medium"
              >{app.ruleResult.matched} branch{app.ruleResult.matched === 1 ? '' : 'es'}</span
            >
            in the graph{base ? `, with ${base} for context` : ''}.
          {:else}
            No branch matches{base ? `: the graph shows ${base} alone` : ''}.
          {/if}
          {#if app.loadingBranchDetails}
            <span class="text-muted-foreground">More may match as branches load…</span>
          {/if}
        </p>
      {/if}
    </div>
    <ActionMenu>
      {#snippet children(open)}
        <Command.Root>
          <Command.Input placeholder="Filter branches…" class="h-8 text-[13px] md:text-[13px]" />
          <Command.List class="max-h-80">
            <Command.Empty>No branches.</Command.Empty>
            <Command.Item
              value="__all"
              class="py-1 text-[13px]"
              onSelect={() => app.showAllBranches()}
            >
              <Check
                class={cn(
                  'size-4',
                  (app.branches.length || app.hidden.length || app.rule) && 'invisible'
                )}
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
                            <RefName ref={r.ref} />
                          </span>
                          <span
                            class="ml-auto flex shrink-0 gap-1.5 text-[11px] text-muted-foreground tabular-nums"
                          >
                            <BranchState {r} />
                            {#if owner(app.branchDetails[r.ref.name])}
                              {@const o = owner(app.branchDetails[r.ref.name])!}
                              <AuthorAvatar name={o.name} email={o.email} />
                            {/if}
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
