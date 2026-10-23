<script lang="ts">
  import { ago, type RefSummary } from '@treeline/shared';
  import { Archive, Cloud, FolderGit2, GitBranch, Tag } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { cn } from '$lib/utils';
  import { describeStatus } from './WorktreeState.svelte';

  /** A branch's or tag's hover card: its commit and how old, its upstream, where it stands vs the base. */
  let { r, footer }: { r: RefSummary; footer: string } = $props();

  const STALE = 30 * 86400;
  const { ref } = $derived(r);
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
</script>

<div class="flex items-center gap-1.5">
  <Icon class="size-3.5 shrink-0" />
  <span class="font-semibold">{ref.name}</span>
  {#if badge}
    <span class="rounded-sm border px-1 text-[10px] leading-4 text-muted-foreground">{badge}</span>
  {/if}
</div>
<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
  <dt class="text-muted-foreground">{ref.kind === 'tag' ? 'Tagged' : 'Last commit'}</dt>
  <dd>
    <span class={cn(Date.now() / 1000 - r.date > STALE && 'text-dirty')}>{ago(r.date)}</span>
    <span class="text-muted-foreground">· {new Date(r.date * 1000).toLocaleDateString()}</span>
  </dd>
  <dt class="text-muted-foreground">Commit</dt>
  <dd>
    <span class="font-mono">{r.hash.slice(0, 8)}</span>
    <span class="line-clamp-2 block text-muted-foreground">{r.subject}</span>
  </dd>
  {#if r.vsBase && app.data?.compare}
    <dt class="text-muted-foreground">vs {app.data.compare.base}</dt>
    <dd>
      {[
        r.vsBase.ahead && `↑ ${r.vsBase.ahead} ahead`,
        r.vsBase.behind && `↓ ${r.vsBase.behind} behind`
      ]
        .filter(Boolean)
        .join(' · ') || 'Same commit'}
    </dd>
  {/if}
  {#if ref.kind === 'head'}
    {@const up = ref.upstream}
    <dt class="text-muted-foreground">Upstream</dt>
    <dd>
      {#if !up}
        Not pushed yet
      {:else if up.gone}
        <span class="text-dirty">Deleted on the remote</span>
      {:else}
        {[up.ahead && `↑ ${up.ahead} to push`, up.behind && `↓ ${up.behind} to pull`]
          .filter(Boolean)
          .join(' · ') || 'In sync'}
      {/if}
      {#if up}
        <span class="block font-mono text-[11px] text-muted-foreground">{up.name}</span>
      {/if}
    </dd>
  {/if}
  {#if ref.worktree}
    {@const status = app.data?.worktrees.find((w) => w.path === ref.worktree)?.status}
    <dt class="text-muted-foreground">Worktree</dt>
    <dd>
      {#if status}{describeStatus(status)}{/if}
      <span class="block font-mono text-[11px] text-muted-foreground">{ref.worktree}</span>
    </dd>
  {/if}
</dl>
<p class="border-t pt-1.5 text-[11px] text-muted-foreground">{footer}</p>
