<script lang="ts" module>
  /** A secondary line inside a card's value: muted, smaller. */
  export const SUB = 'block text-[11px] text-muted-foreground';
</script>

<script lang="ts">
  import { ago, since, type RefSummary, type Worktree } from '@treeline/shared';
  import {
    Archive,
    Check,
    Cloud,
    FolderGit2,
    GitBranch,
    GitCommitHorizontal,
    LoaderCircle,
    Recycle,
    Tag,
    TriangleAlert
  } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { isBase, isDisposable, pullsOf } from '$lib/filters';
  import { cn } from '$lib/utils';
  import AuthorStack from './AuthorStack.svelte';
  import BranchState from './BranchState.svelte';
  import CopyField from './CopyField.svelte';
  import PullBadge from './PullBadge.svelte';
  import PullCard from './PullCard.svelte';
  import WorktreeState from './WorktreeState.svelte';

  /**
   * A branch's, tag's or worktree's hover card, laid out as the legend of its chip: each line starts
   * with the very symbol the chip shows (the same component draws it), then says what it means.
   * A worktree's card is its branch's plus what makes it a worktree: uncommitted files, its folder.
   */
  let { r, footer, worktree: w }: { r: RefSummary; footer: string; worktree?: Worktree } = $props();

  const STALE = 30 * 86400;
  const { ref } = $derived(r);
  /** A worktree on a detached HEAD: no branch, so no owner, remote or pull requests. */
  const detached = $derived(!!w && !w.branch);
  const d = $derived(ref.kind === 'tag' || detached ? undefined : app.branchDetails[ref.name]);
  const total = $derived(d?.authors.reduce((n, a) => n + a.commits, 0) ?? 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const base = $derived(app.data?.compare?.base);
  const own = $derived(!!d && !isBase(r, base));
  const current = $derived(ref.kind === 'head' && ref.name === app.data?.currentBranch);
  const Icon = $derived(
    w || ref.worktree
      ? FolderGit2
      : { head: GitBranch, remote: Cloud, tag: Tag, stash: Archive }[ref.kind]
  );
  const badge = $derived(
    w
      ? w.current
        ? 'in this graph'
        : w.main
          ? 'main worktree'
          : w.locked
            ? 'locked'
            : null
      : current
        ? 'checked out'
        : ref.worktree
          ? 'in a worktree'
          : ref.annotated
            ? 'annotated'
            : null
  );
  const row = $derived(ref.kind === 'tag' || detached ? undefined : app.rowOf.get(ref.name));
  const prs = $derived(row ? pullsOf(row, app.filterContext.pulls).slice(0, 3) : []);
  /** Its merged pull request, when that's what says it's merged (squash merges: git can't tell). */
  const mergedPr = $derived(prs.find((p) => p.state === 'merged' && p.headOid === r.hash));
  /** The worktree's comparison (copies told apart) and its uncommitted files, once loaded. */
  const wd = $derived(w ? app.worktreeDetails[w.path] : undefined);
  const vs = $derived(wd?.compare ?? r.vsBase ?? null);
  const folder = (path: string) => path.split(/[\\/]/).pop();

  /** Where the branch lives, in words: what the cloud on its chip says. */
  const up = $derived(row?.local?.ref.upstream);
  const where = $derived.by(() => {
    if (row?.local && row.remote) {
      const sync = [up?.ahead && `${up.ahead} to push`, up?.behind && `${up.behind} to pull`]
        .filter(Boolean)
        .join(', ');
      return ref.kind === 'remote'
        ? { title: 'Also on your machine', detail: 'as', name: row.local.ref.name }
        : {
            title: `On ${row.remote.ref.remote}`,
            detail: `${sync || (up ? 'in sync' : 'same name, not set as its upstream')} ·`,
            name: row.remote.ref.name
          };
    }
    if (ref.kind === 'remote')
      return { title: `Only on ${ref.remote ?? 'the remote'}`, detail: 'not on your machine' };
    if (up?.gone)
      return {
        title: 'Deleted on the remote',
        detail: 'only here now:',
        name: `${up.name} is gone`
      };
    return { title: 'Only on your machine', detail: 'never pushed' };
  });

  const STATUS: Record<string, string> = {
    A: 'text-[var(--vscode-gitDecoration-addedResourceForeground)]',
    U: 'text-[var(--vscode-gitDecoration-untrackedResourceForeground)]',
    M: 'text-[var(--vscode-gitDecoration-modifiedResourceForeground)]',
    D: 'text-[var(--vscode-gitDecoration-deletedResourceForeground)]',
    R: 'text-[var(--vscode-gitDecoration-renamedResourceForeground)]'
  };
  const FILES = 6;
</script>

<!-- Header: what it is, and for a worktree the branch it has checked out -->
<div class="flex flex-col gap-0.5">
  <div class="flex items-center gap-1.5">
    <Icon class="size-3.5 shrink-0" />
    <span class="truncate text-[13px] font-semibold">{w ? folder(w.path) : ref.name}</span>
    {#if badge}
      <span class="shrink-0 rounded-sm border px-1 text-[10px] leading-4 text-muted-foreground">
        {badge}
      </span>
    {/if}
  </div>
  {#if w?.branch}
    <span class="flex items-center gap-1 pl-5 font-mono text-[11px] text-muted-foreground">
      <GitBranch class="size-3 shrink-0" />{w.branch}
    </span>
  {/if}
</div>

<!-- The legend: on the left the chip's symbol, on the right what it means -->
<dl
  class="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2.5 gap-y-2 border-t pt-2 [&_dt]:flex [&_dt]:items-start [&_dt]:justify-end [&_dt]:pt-[3px] [&_dt]:text-muted-foreground"
>
  {#if w}
    <dt>
      {#if w.status}<WorktreeState status={w.status} sync={false} faded />{/if}
    </dt>
    <dd>
      {#if w.prunable}
        <span class="font-semibold text-destructive">Folder missing</span>
        <span class={SUB}>right-click to prune it</span>
      {:else if w.status?.changes}
        <span class="font-semibold text-dirty"
          >{plural(w.status.changes, 'uncommitted change')}</span
        >
        {#if wd}
          <ul class="mt-1 flex flex-col gap-px">
            {#each wd.files.slice(0, FILES) as f (f.path)}
              <li class="flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
                <span class={cn('w-2.5 shrink-0 font-bold', STATUS[f.status])}>{f.status}</span>
                <span class="truncate" title={f.path}>{f.path}</span>
              </li>
            {/each}
          </ul>
          <span class={SUB}>
            {wd.files.length > FILES ? `and ${wd.files.length - FILES} more · ` : ''}click the chip
            for the diffs
          </span>
        {:else}
          <span class="flex items-center gap-1 {SUB}">
            <LoaderCircle class="size-3 animate-spin" /> listing them…
          </span>
        {/if}
      {:else}
        <span class="font-semibold">Clean</span>
        <span class={SUB}>nothing uncommitted: the chip shows no pen</span>
      {/if}
    </dd>
  {/if}

  {#if base && vs}
    <dt>
      {#if vs.ahead || vs.behind}<BranchState {r} {vs} cloud={false} />{:else}<span
          class="text-[11px]">=</span
        >{/if}
    </dt>
    <dd>
      <span class="font-semibold tabular-nums">
        {#if vs.ahead}<span class="text-ahead">{vs.ahead} ahead</span>{/if}
        {#if vs.ahead && vs.behind}<span class="font-normal text-muted-foreground"> · </span>{/if}
        {#if vs.behind}<span class="text-behind">{vs.behind} behind</span>{/if}
        {#if !vs.ahead && !vs.behind}Same commit as{:else}<span class="font-normal">of</span>{/if}
        <span class="font-mono font-normal">{base}</span>
      </span>
      {#if wd?.compare?.mergeBaseDate}
        <span class="{SUB} italic">forked {ago(wd.compare.mergeBaseDate)}</span>
      {/if}
      {#if own}
        {#if d!.unique && !mergedPr}
          <span class={SUB}>{plural(d!.unique, 'commit')} not merged yet</span>
        {:else}
          <span class="flex items-center gap-1 text-[11px] text-ahead">
            <Check class="size-3" />
            {d!.unique
              ? `Merged through #${mergedPr!.number} (its commits were squashed)`
              : vs.ahead
                ? 'Merged as copies (rebased or cherry-picked)'
                : 'Merged: deleting it loses nothing'}
          </span>
        {/if}
      {/if}
      {#if wd?.compare?.rewritten}
        {@const c = wd.compare}
        <span
          class="mt-1 block rounded-sm border border-dirty/40 bg-dirty/10 px-1.5 py-1 text-[11px] text-dirty"
        >
          <span class="flex items-center gap-1 font-semibold">
            <TriangleAlert class="size-3.5" /> Rewritten history
          </span>
          {c.same} of its commits are copies of commits on {c.base}, and the two histories {c.mergeBaseDate
            ? `only meet ${ago(c.mergeBaseDate)}`
            : 'never meet'}: one side was rewritten (filter-repo, a forced rebase). Rather than
          merging, start a fresh branch from {c.base} and bring the changes over.
        </span>
      {/if}
    </dd>
  {/if}

  {#if detached}
    <dt><GitCommitHorizontal class="size-3.5" /></dt>
    <dd>
      <span class="font-semibold">Detached</span>
      <span class={SUB}>on a commit, not a branch: nothing to push</span>
      <span class="mt-1 block"><CopyField value={w!.head} what="commit hash" /></span>
    </dd>
  {:else if ref.kind === 'head' || ref.kind === 'remote'}
    <dt><BranchState {r} arrows={false} /></dt>
    <dd>
      <span class={cn('font-semibold', up?.gone && !row?.remote && 'text-dirty')}>
        {where.title}
      </span>
      <span class={SUB}
        >{where.detail}
        {#if where.name}<span class="font-mono">{where.name}</span>{/if}</span
      >
    </dd>
  {/if}

  {#each prs as pr (pr.number)}
    <dt><PullBadge {pr} /></dt>
    <dd><PullCard {pr} icon={false} /></dd>
  {/each}
  {#if !prs.length && row && app.pulls?.status === 'signin'}
    <dt></dt>
    <dd class="text-[11px] text-muted-foreground">
      Its pull requests:
      <button class="text-ring hover:underline" onclick={() => app.connectGitHub()}>
        connect GitHub
      </button>
      (no gh account here can read {app.pulls.repo})
    </dd>
  {/if}

  {#if own}
    {@const share = (n: number) => `${Math.round((100 * n) / total)}%`}
    <dt>
      {#if d!.authors.length}<AuthorStack authors={d!.authors} />{/if}
    </dt>
    <dd>
      {#if d!.authors.length}
        {@const o = d!.authors[0]}
        <span class="flex min-w-0 items-baseline gap-1.5">
          <span class="truncate font-semibold">{o.name}</span>
          <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            owner · {share(o.commits)}
          </span>
        </span>
        <span class={SUB}>
          {total === 1
            ? 'its only commit'
            : d!.authors.length === 1
              ? `all ${total} of its commits`
              : `${o.commits} of its ${total} commits`}{d!.mergedBy
            ? ', merged in '
            : ` not on ${base}`}{#if d!.mergedBy}<span class="font-mono"
              >{d!.mergedBy.slice(0, 8)}</span
            >{/if}
        </span>
        {#each d!.authors.slice(1, 4) as a (a.name)}
          <span class="flex min-w-0 items-baseline gap-1.5 text-[11px] text-muted-foreground">
            <span class="truncate">{a.name}</span>
            <span class="shrink-0 tabular-nums">{a.commits} · {share(a.commits)}</span>
          </span>
        {/each}
        {#if d!.authors.length > 4}
          <span class={SUB}>and {d!.authors.length - 4} more</span>
        {/if}
      {:else}
        <span class="font-semibold text-muted-foreground">Nobody's</span>
        <span class={SUB}>no commits of its own: it sits on {base}'s history</span>
      {/if}
    </dd>
  {/if}

  {#if r.date}
    <dt><span class="text-[11px] tabular-nums">{since(r.date)}</span></dt>
    <dd>
      <span class={cn('font-semibold', Date.now() / 1000 - r.date > STALE && 'text-dirty')}>
        {ref.kind === 'tag' ? 'Tagged' : 'Last commit'}
        {ago(r.date)}
      </span>
      <span class="text-[11px] text-muted-foreground italic">
        {new Date(r.date * 1000).toLocaleDateString()}
      </span>
      <span class="mt-0.5 line-clamp-2 block text-[12px]">
        <span class="font-mono text-[11px] text-muted-foreground">{r.hash.slice(0, 8)}</span>
        {r.subject}
      </span>
    </dd>
  {/if}

  {#if w && isDisposable(w, wd ?? undefined, app.filterContext)}
    <dt><Recycle class="size-3.5" /></dt>
    <dd>
      <span class="font-semibold">Nothing to lose</span>
      <span class={SUB}>
        {w.branch
          ? `clean, and ${w.branch} is merged: removing the worktree and its branch loses no work`
          : 'clean, and its commit is on another branch or tag: removing it loses no work'}. Files
        git ignores (node_modules, .env…) go with the folder.
      </span>
    </dd>
  {/if}

  {#if w || ref.worktree}
    <dt><FolderGit2 class="size-3.5" /></dt>
    <dd><CopyField value={w?.path ?? ref.worktree!} what="folder path" /></dd>
  {/if}
</dl>
<p class="border-t pt-1.5 text-[11px] text-muted-foreground">{footer}</p>
