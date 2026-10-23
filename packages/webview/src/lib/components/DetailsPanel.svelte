<script lang="ts">
  import { UNCOMMITTED, type FileChange } from '@treeline/shared';
  import { X } from '@lucide/svelte';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import type { MenuItem } from '$lib/menus';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import ActionMenu from './ActionMenu.svelte';

  const d = $derived(app.details);
  const branch = $derived(app.branchDiff);
  const comparing = $derived(!!app.compareWith && !!app.compareFiles);
  const files = $derived(branch ? branch.files : comparing ? app.compareFiles! : (d?.files ?? []));

  /** The two revisions the file list is a diff between. */
  const range = $derived.by((): { from: string; to: string } => {
    if (branch) return { from: branch.mergeBase, to: UNCOMMITTED };
    const sel = app.selected!;
    if (comparing) {
      const commits = app.data!.commits;
      const a = commits.findIndex((c) => c.hash === sel.hash);
      const b = commits.findIndex((c) => c.hash === app.compareWith!.hash);
      const [newer, older] = a < b ? [sel, app.compareWith!] : [app.compareWith!, sel];
      return { from: older.hash, to: newer.hash };
    }
    if (sel.hash === UNCOMMITTED) return { from: 'HEAD', to: UNCOMMITTED };
    if (sel.stashBase) return { from: sel.stashBase, to: sel.hash };
    return { from: sel.parents[0] ?? '', to: sel.hash };
  });

  const statusColor: Record<string, string> = {
    A: 'text-[var(--vscode-gitDecoration-addedResourceForeground)]',
    U: 'text-[var(--vscode-gitDecoration-untrackedResourceForeground)]',
    M: 'text-[var(--vscode-gitDecoration-modifiedResourceForeground)]',
    D: 'text-[var(--vscode-gitDecoration-deletedResourceForeground)]',
    R: 'text-[var(--vscode-gitDecoration-renamedResourceForeground)]'
  };

  const date = (s: number) => new Date(s * 1000).toLocaleString();
  const short = (h: string) => (h === UNCOMMITTED ? 'Working Tree' : h.slice(0, 8));

  function diff(file: FileChange) {
    if (!app.repo) return;
    void host.openDiff({ repo: app.repo, file: $state.snapshot(file), ...range });
  }

  function fileMenu(file: FileChange): MenuItem[] {
    const repo = app.repo!;
    const { to } = range;
    return [
      { label: 'View Diff', run: () => diff(file) },
      ...(file.status !== 'D' && to !== UNCOMMITTED
        ? [
            {
              // The working-tree side is the real file: Go to Definition, errors and links work
              label: 'Compare with Working Tree',
              run: () =>
                host.openDiff({
                  repo,
                  file: { ...$state.snapshot(file), status: 'M', oldPath: file.path },
                  from: file.status === 'U' ? `${to}^3` : to,
                  to: UNCOMMITTED
                })
            }
          ]
        : []),
      ...(file.status !== 'D' && to !== UNCOMMITTED
        ? [
            {
              label: 'View File at this Revision',
              run: () => host.openFile(repo, file.path, file.status === 'U' ? `${to}^3` : to)
            }
          ]
        : []),
      ...(file.status !== 'D'
        ? [{ label: 'Open File', run: () => host.openFile(repo, file.path) }]
        : []),
      'separator',
      { label: 'Copy Relative File Path', run: () => host.copy(file.path) },
      { label: 'Copy Absolute File Path', run: () => host.copy(`${repo}/${file.path}`) }
    ];
  }
</script>

<div class="flex h-full flex-col border-t bg-card text-[13px]" data-testid="details">
  <div class="flex h-8 shrink-0 items-center gap-2 border-b px-3">
    <span class="font-semibold">
      {#if branch}
        Changes vs {branch.base}
      {:else if comparing}
        Comparing {short(range.from)} ↔ {short(range.to)}
      {:else if app.selected?.hash === UNCOMMITTED}
        Uncommitted Changes
      {:else}
        Commit {app.selected?.hash.slice(0, 8)}
      {/if}
    </span>
    <span class="text-xs text-muted-foreground">{files.length} files</span>
    <Button
      class="ml-auto"
      variant="ghost"
      size="icon-xs"
      icon={X}
      title="Close (Esc)"
      onclick={() => app.closeDetails()}
    />
  </div>

  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div class="overflow-auto p-3 select-text">
      {#if branch}
        <p class="text-xs text-muted-foreground">
          Every change since {app.data?.currentBranch ?? 'HEAD'} forked from {branch.base} at
          <span class="font-mono">{short(branch.mergeBase)}</span>, uncommitted changes included:
          what a pull request would show. Diffs open on your working files, so Go to Definition,
          errors and links work.
        </p>
      {:else if d && !comparing && d.hash !== UNCOMMITTED}
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt class="text-muted-foreground">Commit</dt>
          <dd class="font-mono">{d.hash}</dd>
          <dt class="text-muted-foreground">Parents</dt>
          <dd class="font-mono">{d.parents.map((p) => p.slice(0, 8)).join(', ') || '—'}</dd>
          <dt class="text-muted-foreground">Author</dt>
          <dd>{d.author} &lt;{d.authorEmail}&gt;</dd>
          <dt class="text-muted-foreground">Date</dt>
          <dd>{date(d.authorDate)}</dd>
          {#if d.committer !== d.author || d.committerDate !== d.authorDate}
            <dt class="text-muted-foreground">Committer</dt>
            <dd>{d.committer} &lt;{d.committerEmail}&gt; · {date(d.committerDate)}</dd>
          {/if}
        </dl>
        <pre class="mt-3 font-sans text-[13px] whitespace-pre-wrap">{d.body}</pre>
      {:else if comparing}
        <p class="text-xs text-muted-foreground">
          Changes from {short(range.from)} to {short(range.to)}.
        </p>
      {:else}
        <p class="text-xs text-muted-foreground">Changes in the working tree relative to HEAD.</p>
      {/if}
    </div>

    <ActionMenu>
      {#snippet children(open)}
        <ul class="overflow-auto border-l py-1">
          {#each files as f (f.path)}
            <li>
              <button
                class="flex w-full items-center gap-2 px-3 py-0.5 text-left hover:bg-accent"
                onclick={() => diff(f)}
                oncontextmenu={(e) => open(e, fileMenu(f))}
                title={f.status === 'R' ? `${f.oldPath} → ${f.path}` : f.path}
              >
                <span class={cn('w-3 shrink-0 font-mono text-xs font-bold', statusColor[f.status])}
                  >{f.status}</span
                >
                <span class="truncate">
                  {f.path.split('/').pop()}
                  <span class="text-xs text-muted-foreground"
                    >{f.path.split('/').slice(0, -1).join('/')}</span
                  >
                </span>
                {#if f.additions !== null}
                  <span class="ml-auto shrink-0 font-mono text-xs">
                    <span class={statusColor.A}>+{f.additions}</span>
                    <span class={statusColor.D}>−{f.deletions}</span>
                  </span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/snippet}
    </ActionMenu>
  </div>
</div>
