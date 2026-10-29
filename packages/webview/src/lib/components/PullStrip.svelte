<script lang="ts">
  import { since } from '@treeline/shared';
  import {
    CircleCheck,
    CircleDot,
    CircleX,
    GitPullRequest,
    MessageSquare,
    Plus
  } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import {
    currentPull,
    DEFAULT_PULL_FILTER,
    pullMatches,
    pullRow,
    type PullFilter
  } from '$lib/filters';
  import { pullMenu } from '$lib/menus';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import FilterMenu from './FilterMenu.svelte';
  import NavStrip from './NavStrip.svelte';
  import PullCard from './PullCard.svelte';
  import { PULL_STATE } from './PullBadge.svelte';
  import Tip from './Tip.svelte';

  /**
   * The repository's pull requests on GitHub, most recently updated first, as a row of chips; the
   * title filters which. Shown once GitHub could be asked, or with a button to connect.
   */
  const pulls = $derived(app.pulls);
  const ok = $derived(pulls?.status === 'ok' ? pulls : null);
  const f = $derived(app.pullFilter);
  const all = $derived(ok?.prs ?? []);
  const matching = $derived(ok ? all.filter((p) => pullMatches(p, f, ok.viewer, app.rows)) : []);
  /** The checked-out branch's pull request: first, and drawn like the current branch's chip. */
  const current = $derived(currentPull(matching, app.rows, app.data?.currentBranch ?? null));
  const filtered = $derived(
    current ? [current, ...matching.filter((p) => p !== current)] : matching
  );
  const active = $derived(
    (Object.keys(f) as (keyof PullFilter)[]).some((k) => f[k] !== DEFAULT_PULL_FILTER[k])
  );
  const shown = $derived(
    app.view.pulls && !!app.data && (pulls?.status === 'ok' || pulls?.status === 'signin')
  );
</script>

{#snippet menu()}
  <FilterMenu
    value={f}
    onchange={(patch) => app.setPullFilter(patch)}
    onreset={() => app.setPullFilter({ ...DEFAULT_PULL_FILTER, state: 'any' })}
    groups={[
      {
        key: 'owner',
        label: 'Whose',
        options: [
          { value: 'anyone', label: "Anyone's" },
          {
            value: 'mine',
            label: 'Mine',
            hint: `Opened by you (${ok?.viewer || 'your GitHub account'}).`
          },
          {
            value: 'review',
            label: 'Waiting for my review',
            hint: 'Open ones asking you for a review: never reviewed, or asked again since.'
          }
        ]
      },
      {
        key: 'state',
        label: 'State',
        options: [
          { value: 'open', label: 'Open', hint: 'Drafts included.' },
          { value: 'draft', label: 'Drafts' },
          { value: 'merged', label: 'Merged' },
          { value: 'closed', label: 'Closed', hint: 'Closed without merging.' },
          { value: 'any', label: 'Any' }
        ]
      },
      {
        key: 'branch',
        label: 'Branch',
        options: [
          { value: 'anywhere', label: 'Anywhere' },
          {
            value: 'local',
            label: 'On my machine',
            hint: 'Its branch is one of your local branches.'
          }
        ]
      },
      {
        key: 'needs',
        label: 'Needs',
        options: [
          { value: 'anything', label: 'Anything' },
          {
            value: 'work',
            label: 'Work from its author',
            hint: 'Open, with changes requested, checks failing or conversations still open.'
          }
        ]
      }
    ]}
  />
{/snippet}

{#snippet connect()}
  <Button
    variant="outline"
    size="xs"
    class="h-6 shrink-0 gap-1 px-2 text-xs font-normal"
    icon={GitPullRequest}
    hint={{
      title: 'Connect GitHub',
      body: `No gh account here can read ${pulls?.status === 'signin' ? pulls.repo : 'this repository'}: sign in with the editor's GitHub account instead (it asks for your consent).`,
      note: 'Or sign in with the gh CLI: gh auth login'
    }}
    onclick={() => app.connectGitHub()}
  >
    Connect GitHub
  </Button>
{/snippet}

{#if shown}
  <ActionMenu>
    {#snippet children(open)}
      <NavStrip
        label="Pull Requests"
        count={all.length}
        shown={filtered.length}
        empty={!ok
          ? connect
          : all.length
            ? 'No pull requests match the filter'
            : 'No pull requests yet'}
        filter={ok
          ? {
              menu,
              active,
              hint: {
                title: 'Filter the pull requests',
                body: 'Yours or waiting for your review, by state, with their branch on your machine, or waiting on their author. It filters this row only.',
                note: `The ${all.length} most recently updated on GitHub.${active ? ' Filtered: click to change or reset.' : ''}`
              }
            }
          : undefined}
      >
        {#each filtered as pr (pr.number)}
          {@const s = PULL_STATE[pr.state]}
          {@const row = pullRow(pr, app.rows)}
          {@const live = pr.state === 'open' || pr.state === 'draft'}
          {#snippet details()}
            <div class="flex flex-col gap-2">
              <PullCard {pr} />
              <p class="text-[11px] text-muted-foreground">
                <span class="font-mono">{pr.head}</span> into
                <span class="font-mono">{pr.base}</span> ·
                {pr === current
                  ? 'the branch you have checked out'
                  : row?.local
                    ? 'on your machine'
                    : row
                      ? 'on the remote only'
                      : "its branch isn't here: fetched when you look at its changes"}
              </p>
              <p class="border-t pt-1.5 text-[11px] text-muted-foreground">
                Click: its changes, its head in the graph · Right-click: more
              </p>
            </div>
          {/snippet}
          <Tip content={details}>
            {#snippet children(trigger)}
              <button
                {...trigger}
                class={cn(
                  'flex h-6 max-w-96 shrink-0 items-center gap-1.5 rounded-sm border px-2 hover:bg-accent data-menu-open:bg-accent',
                  pr === current && 'border-ring font-semibold',
                  // Shown in the details panel
                  app.pullPanel?.pr.number === pr.number && 'bg-accent',
                  // Not on your machine: a lighter, dashed chip, as for remote-only branches
                  !row?.local && 'border-dashed text-muted-foreground'
                )}
                onclick={() => app.showPull(pr)}
                oncontextmenu={(e) => open(e, pullMenu(pr))}
              >
                <s.icon class="size-3.5 shrink-0 {s.class}" />
                <span class="shrink-0 text-muted-foreground tabular-nums">#{pr.number}</span>
                <span class="min-w-16 truncate">{pr.title}</span>
                {#if live}
                  {#if pr.decision === 'approved'}
                    <CircleCheck class="size-3 shrink-0 text-ahead" />
                  {:else if pr.decision === 'changes'}
                    <CircleX class="size-3 shrink-0 text-destructive" />
                  {/if}
                  {#if pr.checks === 'failing' || pr.checks === 'pending'}
                    <CircleDot
                      class={cn(
                        'size-3 shrink-0',
                        pr.checks === 'failing' ? 'text-destructive' : 'text-dirty'
                      )}
                    />
                  {/if}
                  {#if pr.threads.unresolved}
                    <span class="inline-flex shrink-0 items-center gap-0.5 tabular-nums">
                      <MessageSquare class="size-3 text-dirty" />{pr.threads.unresolved}
                    </span>
                  {/if}
                {/if}
                <AuthorAvatar name={pr.author} email={pr.author} />
                <span class="shrink-0 text-muted-foreground tabular-nums"
                  >{since(pr.updatedAt)}</span
                >
              </button>
            {/snippet}
          </Tip>
        {/each}
        {#snippet action()}
          {@const n = app.newPullFor}
          {#if n}
            <Button
              variant="ghost"
              size="icon-xs"
              icon={Plus}
              loading={app.isRunning(n.branch)}
              hint={n.existing
                ? {
                    title: `${n.branch} has #${n.existing.number}`,
                    body: 'Shows it, its head in the graph and its changes in the details panel.'
                  }
                : {
                    title: 'New pull request',
                    body: `Opens GitHub's page for a pull request of ${n.branch} into ${n.into}, where you write its title and description.`,
                    note: n.push
                      ? `Pushes ${n.branch} first: GitHub doesn't have it as it is here.`
                      : undefined,
                    command: n.push ? `git push --set-upstream <remote> ${n.branch}` : undefined
                  }}
              onclick={() => app.newPull()}
            />
          {/if}
        {/snippet}
      </NavStrip>
    {/snippet}
  </ActionMenu>
{/if}
