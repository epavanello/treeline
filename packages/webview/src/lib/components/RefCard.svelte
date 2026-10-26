<script lang="ts" module>
  /**
   * The cards' shared look (this one and the worktree card): small caps labels on the left, values
   * on the right; inside values, `.sub` lines are secondary (muted, smaller), dates italic.
   */
  export const CARD_LIST =
    'grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 [&_dt]:text-[10px] [&_dt]:font-medium [&_dt]:tracking-wider [&_dt]:text-muted-foreground [&_dt]:uppercase';
  export const SUB = 'block text-[11px] text-muted-foreground';
  /** A section title above a group of lines (pull requests). */
  export const SECTION = 'text-[10px] font-medium tracking-wider text-muted-foreground uppercase';
</script>

<script lang="ts">
  import { ago, type RefSummary } from '@treeline/shared';
  import { Archive, Check, Cloud, CloudOff, FolderGit2, GitBranch, Tag } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { isBase, pullsOf } from '$lib/filters';
  import { cn } from '$lib/utils';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import AuthorStack from './AuthorStack.svelte';
  import PullCard from './PullCard.svelte';
  import { describeStatus } from './WorktreeState.svelte';

  /** A branch's or tag's hover card: its commit and how old, where it stands, whose, its pull requests. */
  let { r, footer }: { r: RefSummary; footer: string } = $props();

  const STALE = 30 * 86400;
  const { ref } = $derived(r);
  const d = $derived(ref.kind === 'tag' ? undefined : app.branchDetails[ref.name]);
  const total = $derived(d?.authors.reduce((n, a) => n + a.commits, 0) ?? 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const base = $derived(app.data?.compare?.base);
  const own = $derived(!!d && !isBase(r, base));
  const current = $derived(ref.kind === 'head' && ref.name === app.data?.currentBranch);
  const Icon = $derived(
    ref.worktree
      ? FolderGit2
      : { head: GitBranch, remote: Cloud, tag: Tag, stash: Archive }[ref.kind]
  );
  const badge = $derived(
    current
      ? 'checked out'
      : ref.worktree
        ? 'in a worktree'
        : ref.kind === 'remote'
          ? `on ${ref.remote ?? 'a remote'}`
          : ref.annotated
            ? 'annotated'
            : null
  );
  const row = $derived(ref.kind === 'tag' ? undefined : app.rowOf.get(ref.name));
  const prs = $derived(row ? pullsOf(row, app.filterContext.pulls).slice(0, 3) : []);
  /** Its merged pull request, when that's what says it's merged (squash merges: git can't tell). */
  const mergedPr = $derived(prs.find((p) => p.state === 'merged' && p.headOid === r.hash));
</script>

<div class="flex items-center gap-1.5">
  <Icon class="size-3.5 shrink-0" />
  <span class="font-semibold">{ref.name}</span>
  {#if badge}
    <span class="rounded-sm border px-1 text-[10px] leading-4 text-muted-foreground">{badge}</span>
  {/if}
</div>
<dl class={CARD_LIST}>
  <dt>{ref.kind === 'tag' ? 'Tagged' : 'Last commit'}</dt>
  <dd>
    <span class={cn(Date.now() / 1000 - r.date > STALE && 'text-dirty')}>{ago(r.date)}</span>
    <span class="text-[11px] text-muted-foreground italic">
      {new Date(r.date * 1000).toLocaleDateString()}
    </span>
    <span class="mt-0.5 line-clamp-2 block">
      <span class="font-mono text-[11px] text-muted-foreground">{r.hash.slice(0, 8)}</span>
      {r.subject}
    </span>
  </dd>

  {#if r.vsBase && base}
    <dt>vs {base}</dt>
    <dd>
      <span class="tabular-nums">
        {#if r.vsBase.ahead}<span class="text-ahead">↑ {r.vsBase.ahead} ahead</span>{/if}
        {#if r.vsBase.ahead && r.vsBase.behind}<span class="text-muted-foreground"> · </span>{/if}
        {#if r.vsBase.behind}<span class="text-behind">↓ {r.vsBase.behind} behind</span>{/if}
        {#if !r.vsBase.ahead && !r.vsBase.behind}Same commit{/if}
      </span>
      {#if own}
        {#if d!.unique && !mergedPr}
          <span class={SUB}>{plural(d!.unique, 'commit')} not merged yet</span>
        {:else}
          <span class="flex items-center gap-1 text-[11px] text-ahead">
            <Check class="size-3" />
            {d!.unique
              ? `Merged through #${mergedPr!.number} (its commits were squashed)`
              : r.vsBase.ahead
                ? 'Merged as copies (rebased or cherry-picked)'
                : 'Merged: deleting it loses nothing'}
          </span>
        {/if}
      {/if}
    </dd>
  {/if}

  {#if own}
    {@const share = (n: number) => `${Math.round((100 * n) / total)}%`}
    <dt>Owner</dt>
    <dd>
      {#if d!.authors.length}
        {@const o = d!.authors[0]}
        <span class="flex items-center gap-1.5">
          <AuthorStack authors={d!.authors} />
          <span class="font-medium">{o.name}</span>
          <span class="text-[11px] text-muted-foreground tabular-nums">{share(o.commits)}</span>
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
          <span class="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <AuthorAvatar name={a.name} email={a.email} />
            {a.name}
            <span class="tabular-nums">{a.commits} · {share(a.commits)}</span>
          </span>
        {/each}
        {#if d!.authors.length > 4}
          <span class={SUB}>and {d!.authors.length - 4} more</span>
        {/if}
      {:else}
        <span class="text-muted-foreground">Nobody</span>
        <span class={SUB}>No commits of its own: it sits on {base}'s history</span>
      {/if}
    </dd>
  {/if}

  {#if ref.kind === 'head'}
    {@const up = ref.upstream}
    {@const twin = row?.remote}
    <dt>Remote</dt>
    <dd>
      <span class="flex items-center gap-1">
        {#if (up && !up.gone) || twin}
          <Cloud class="size-3 fill-current" />
        {:else}
          <CloudOff class={cn('size-3', up?.gone ? 'text-dirty' : 'text-muted-foreground')} />
        {/if}
        {#if !up && twin}
          On the remote, not set as its upstream
        {:else if !up}
          Only here: never pushed
        {:else if up.gone}
          <span class="text-dirty">Deleted on the remote</span>
        {:else}
          {[up.ahead && `↑ ${up.ahead} to push`, up.behind && `↓ ${up.behind} to pull`]
            .filter(Boolean)
            .join(' · ') || 'In sync'}
        {/if}
      </span>
      {#if up || twin}
        <span class="{SUB} font-mono">{up?.name ?? twin?.ref.name}</span>
      {/if}
    </dd>
  {:else if ref.kind === 'remote'}
    <dt>Locally</dt>
    <dd>
      {#if row?.local}
        As <span class="font-mono">{row.local.ref.name}</span>
        {#if row.local.hash === r.hash}<span class={SUB}>same commit</span>{/if}
      {:else}
        <span class="text-muted-foreground">Not on your machine</span>
      {/if}
    </dd>
  {/if}

  {#if ref.worktree}
    {@const status = app.data?.worktrees.find((w) => w.path === ref.worktree)?.status}
    <dt>Worktree</dt>
    <dd>
      {#if status}{describeStatus(status)}{/if}
      <span class="{SUB} font-mono">{ref.worktree}</span>
    </dd>
  {/if}
</dl>

{#if prs.length}
  <div class="flex flex-col gap-1.5 border-t pt-1.5">
    <p class={SECTION}>{prs.length === 1 ? 'Pull request' : 'Pull requests'}</p>
    {#each prs as pr (pr.number)}<PullCard {pr} />{/each}
  </div>
{:else if row && app.pulls?.status === 'signin'}
  <p class="border-t pt-1.5 text-[11px] text-muted-foreground">
    Its pull requests:
    <button class="text-ring hover:underline" onclick={() => app.connectGitHub()}>
      connect GitHub
    </button>
    (no gh account here can read {app.pulls.repo})
  </p>
{/if}
<p class="border-t pt-1.5 text-[11px] text-muted-foreground">{footer}</p>
