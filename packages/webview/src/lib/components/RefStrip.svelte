<script lang="ts">
  import { since, type RefSummary } from '@treeline/shared';
  import { FolderGit2, GitBranch, LoaderCircle, Plus, Tag, Trash2 } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import {
    CLEANUP,
    DEFAULT_BRANCH_FILTER,
    deletable,
    filterBranches,
    owner,
    primary,
    pullsOf,
    type BranchFilter,
    type BranchRow
  } from '$lib/filters';
  import { menuItems, refCommit } from '$lib/menus';
  import { host } from '$lib/rpc';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import BranchState from './BranchState.svelte';
  import FilterMenu from './FilterMenu.svelte';
  import NavStrip from './NavStrip.svelte';
  import PullBadge from './PullBadge.svelte';
  import RefCard from './RefCard.svelte';
  import RefName from './RefName.svelte';
  import Tip from './Tip.svelte';

  /**
   * The branches or the tags, most recent first, as a row of chips. A branch is one chip, its local
   * and remote copies together (see `BranchRow`); the title filters which.
   */
  let { kind }: { kind: 'heads' | 'tags' } = $props();

  // Repositories with hundreds of deploy tags: the most recent ones are what matters here
  const LIMIT = 100;
  const f = $derived(app.branchFilter);
  const base = $derived(app.data?.compare?.base);
  type Item = { r: RefSummary; row?: BranchRow };
  const chip = (row: BranchRow): Item => ({ r: primary(row), row });
  /** Every branch of the chosen scope (what the count counts), or every tag. */
  const all = $derived(
    kind === 'tags'
      ? (app.data?.tags ?? []).map((r): Item => ({ r }))
      : app.rows
          .filter((row) =>
            f.scope === 'local' ? row.local : f.scope === 'remote' ? !row.local : 1
          )
          .map(chip)
  );
  const filtered = $derived(
    kind === 'heads' && app.data ? filterBranches(app.data, f, app.filterContext).map(chip) : all
  );
  const items = $derived(filtered.slice(0, LIMIT));
  const shown = $derived(kind === 'heads' ? app.view.branches : app.view.tags);
  const active = $derived(
    (Object.keys(f) as (keyof BranchFilter)[]).some((k) => f[k] !== DEFAULT_BRANCH_FILTER[k])
  );
  /** What "Delete" would delete: the shown branches a cleanup may touch. */
  const cleanup = $derived(
    kind === 'heads' && app.data && CLEANUP.branches.includes(f.state)
      ? filtered.flatMap(({ row }) => (row && deletable(row, app.data!, base) ? [row] : []))
      : []
  );
  const where = $derived(base ? `on ${base}` : 'on the compare base');

  function deleteAll(rows: BranchRow[]) {
    return app.run({
      type: 'deleteBranches',
      local: rows.flatMap((row) => (row.local ? [row.local.ref.name] : [])),
      remote: rows.flatMap((row) =>
        row.remote?.ref.remote ? [{ name: row.remote.ref.name, remote: row.remote.ref.remote }] : []
      )
    });
  }
</script>

{#snippet menu()}
  <FilterMenu
    value={f}
    onchange={(patch) => app.setBranchFilter(patch)}
    onreset={() => app.setBranchFilter(DEFAULT_BRANCH_FILTER)}
    groups={[
      {
        key: 'scope',
        label: 'Branches',
        options: [
          {
            value: 'local',
            label: 'Local',
            hint: 'Branches on your machine, each together with the remote branch it tracks.'
          },
          {
            value: 'remote',
            label: 'Only on the remote',
            hint: "Your team's branches that you don't have locally, as of the last fetch."
          },
          { value: 'all', label: 'All' }
        ]
      },
      {
        key: 'owner',
        label: 'Whose',
        options: [
          { value: 'anyone', label: "Anyone's" },
          {
            value: 'mine',
            label: 'Mine',
            hint: app.data?.user
              ? `You (${app.data.user.email}) wrote most of its own commits: the ones ${base ?? 'the base'} doesn't have or, once merged, the ones its merge brought in. Branches with no commits of their own are nobody's.`
              : 'Needs your git identity (user.name and user.email).',
            disabled: !app.data?.user
          }
        ]
      },
      {
        key: 'state',
        label: 'State',
        options: [
          { value: 'any', label: 'Any' },
          {
            value: 'merged',
            label: `Merged into ${base ?? 'the base'}`,
            hint: `All its changes are ${where}, merged or rebased in: deleting it loses nothing. Lists them with a button to delete them all.`
          },
          {
            value: 'unmerged',
            label: 'Not merged yet',
            hint: `It has changes that aren't ${where}.`
          },
          {
            value: 'gone',
            label: 'Deleted on the remote',
            hint: 'Local branches whose upstream branch is gone, usually after its pull request was merged (squash merges included). Lists them with a button to delete them all.'
          },
          {
            value: 'stale',
            label: 'No commits for 30 days',
            hint: 'Lists them with a button to delete them all.'
          }
        ]
      }
    ]}
  />
{/snippet}

{#if shown && app.data}
  <ActionMenu>
    {#snippet children(open)}
      <NavStrip
        label={kind === 'heads' ? 'Branches' : 'Tags'}
        count={all.length}
        shown={filtered.length}
        empty={kind === 'tags'
          ? 'No tags yet'
          : all.length
            ? 'No branches match the filter'
            : f.scope === 'remote'
              ? 'No remote branches'
              : 'No branches yet'}
        filter={kind === 'heads'
          ? {
              menu,
              active,
              loading: app.loadingBranchDetails,
              hint: {
                title: 'Filter the branches',
                body: "Local or remote ones, yours, merged ones, ones gone from the remote or left alone for a month. It filters this row only: the graph's branches are picked in the toolbar.",
                note: app.branchProgress
                  ? `Working out owners and merged state: ${app.branchProgress.done} of ${app.branchProgress.total} branches…`
                  : active
                    ? 'Filtered: click to change or reset.'
                    : undefined
              }
            }
          : undefined}
      >
        {#if cleanup.length}
          <Button
            variant="outline"
            size="xs"
            class="h-6 shrink-0 gap-1 border-destructive/50 px-2 text-xs font-normal text-destructive hover:text-destructive"
            icon={Trash2}
            loading={app.isRunning('deleteBranches')}
            hint={{
              title: `Delete these ${cleanup.length} branches`,
              body: 'Their local and remote copies. Asks once, saying what would be lost (commits no other branch contains), and lets you keep the remote ones.',
              note:
                filtered.length > cleanup.length
                  ? `${filtered.length - cleanup.length} stay: the base, and branches checked out here or in a worktree.`
                  : undefined,
              command: 'git branch -D <branches> · git push <remote> --delete <branches>'
            }}
            onclick={() => deleteAll(cleanup)}
          >
            Delete {cleanup.length}
          </Button>
        {/if}
        {#each items as { r, row } (r.ref.name)}
          {@const current = r.ref.kind === 'head' && r.ref.name === app.data?.currentBranch}
          {@const remoteOnly = r.ref.kind === 'remote'}
          {@const pr = row ? pullsOf(row, app.filterContext.pulls)[0] : undefined}
          {@const Icon = r.ref.worktree ? FolderGit2 : kind === 'heads' ? GitBranch : Tag}
          {@const o = kind === 'heads' ? owner(app.branchDetails[r.ref.name]) : null}
          {#snippet details()}
            <RefCard
              {r}
              footer="Click: show it in the graph · Right-click: {kind === 'heads'
                ? 'pull, push and more'
                : 'tag actions'}"
            />
          {/snippet}
          <Tip content={details}>
            {#snippet children(trigger)}
              <button
                {...trigger}
                class={cn(
                  'flex h-6 max-w-96 shrink-0 items-center gap-1.5 rounded-sm border px-2 hover:bg-accent data-menu-open:bg-accent',
                  current && 'border-ring font-semibold',
                  // Someone else's branch you don't have: a lighter, dashed chip
                  remoteOnly && 'border-dashed text-muted-foreground'
                )}
                onclick={() => app.reveal(r.hash)}
                oncontextmenu={(e) =>
                  open(e, menuItems({ kind: 'ref', ref: r.ref, commit: refCommit(r) }))}
              >
                {#if app.isRunning(r.ref.name, r.ref.worktree)}
                  <LoaderCircle class="size-3.5 shrink-0 animate-spin" />
                {:else}
                  <Icon class="size-3.5 shrink-0" />
                {/if}
                <span class="min-w-16 truncate"><RefName ref={r.ref} /></span>
                {#if kind === 'heads'}<BranchState {r} />{/if}
                {#if pr && (pr.state === 'open' || pr.state === 'draft')}<PullBadge {pr} />{/if}
                {#if o}<AuthorAvatar name={o.name} email={o.email} />{/if}
                <span class="shrink-0 text-muted-foreground tabular-nums">{since(r.date)}</span>
              </button>
            {/snippet}
          </Tip>
        {/each}
        {#if filtered.length > LIMIT}
          <span class="shrink-0 px-1 text-muted-foreground">+{filtered.length - LIMIT} older</span>
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
              onclick={() => app.run({ type: 'createBranch', hash: app.data!.head! })}
            />
          {:else if kind === 'tags' && app.data?.head}
            <Button
              variant="ghost"
              size="icon-xs"
              icon={Plus}
              hint={{
                title: 'New tag',
                body: 'Tags the current commit. Suggests the next version after your latest one (patch, minor, major), or any name you type; then offers to push it.',
                command: 'git tag <name>'
              }}
              onclick={() => app.run({ type: 'addTag', hash: app.data!.head! })}
            />
          {/if}
        {/snippet}
      </NavStrip>
    {/snippet}
  </ActionMenu>
{/if}
