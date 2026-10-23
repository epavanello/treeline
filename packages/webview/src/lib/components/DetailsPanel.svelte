<script lang="ts">
  import { ago, UNCOMMITTED, type FileChange } from '@treeline/shared';
  import { ChevronRight, Folder, List, ListTree, TriangleAlert, X } from '@lucide/svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import type { MenuItem } from '$lib/menus';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import { fileTree, type Dir } from '$lib/fileTree';
  import ActionMenu from './ActionMenu.svelte';

  const d = $derived(app.details);
  const branch = $derived(app.branchDiff);
  const wt = $derived(app.worktreePanel);
  const comparing = $derived(!!app.compareWith && !!app.compareFiles);
  const files = $derived(
    wt ? wt.files : branch ? branch.files : comparing ? app.compareFiles! : (d?.files ?? [])
  );
  /** Where the files live: another worktree's folder, or the repository the graph shows. */
  const repo = $derived(wt ? wt.worktree.path : app.repo);

  /** The two revisions the file list is a diff between. */
  const range = $derived.by((): { from: string; to: string } => {
    if (wt) return { from: 'HEAD', to: UNCOMMITTED };
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
  const folderName = (path: string) => path.split(/[\\/]/).pop();

  function diff(file: FileChange) {
    if (!repo) return;
    void host.openDiff({ repo, file: $state.snapshot(file), ...range });
  }

  const tree = $derived(fileTree(files));
  /** Collapsed folders (all start expanded). */
  const collapsed = new SvelteSet<string>();

  function fileMenu(file: FileChange): MenuItem[] {
    const at = repo!;
    const { to } = range;
    return [
      {
        label: 'View Diff',
        run: () => diff(file),
        hint: 'Side by side, before and after. When a side matches your working tree it opens the real file, so Go to Definition, errors and links work there.'
      },
      ...(file.status !== 'D' && to !== UNCOMMITTED
        ? [
            {
              // The working-tree side is the real file: Go to Definition, errors and links work
              label: 'Compare with Working Tree',
              run: () =>
                host.openDiff({
                  repo: at,
                  file: { ...$state.snapshot(file), status: 'M', oldPath: file.path },
                  from: file.status === 'U' ? `${to}^3` : to,
                  to: UNCOMMITTED
                }),
              hint: `This file at ${short(to)} next to your current file on disk: editable, with every language feature.`
            },
            {
              label: 'View File at this Revision',
              run: () => host.openFile(at, file.path, file.status === 'U' ? `${to}^3` : to),
              hint: `The whole file as it was at ${short(to)}, read-only.`
            }
          ]
        : []),
      ...(file.status !== 'D'
        ? [
            {
              label: 'Open File',
              run: () => host.openFile(at, file.path),
              hint: wt ? `Opens the file in ${folderName(at)}.` : 'Opens your current file on disk.'
            }
          ]
        : []),
      'separator',
      { label: 'Copy Relative File Path', run: () => host.copy(file.path) },
      { label: 'Copy Absolute File Path', run: () => host.copy(`${at}/${file.path}`) }
    ];
  }
</script>

<div class="flex h-full flex-col border-t bg-card text-[13px]" data-testid="details">
  <div class="flex h-8 shrink-0 items-center gap-2 border-b px-3">
    <span class="font-semibold">
      {#if wt}
        {folderName(wt.worktree.path)}: uncommitted changes
      {:else if branch}
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
      icon={app.view.fileTree ? List : ListTree}
      hint={app.view.fileTree
        ? 'Show the files as a flat list'
        : 'Show the files as a folder tree (folders collapse; chains of single folders share one row)'}
      onclick={() => app.setView({ fileTree: !app.view.fileTree })}
    />
    <Button
      variant="ghost"
      size="icon-xs"
      icon={X}
      hint="Close the details (Esc)"
      onclick={() => app.closeDetails()}
    />
  </div>

  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div class="overflow-auto p-3 select-text">
      {#if wt}
        {@const c = app.worktreeDetails[wt.worktree.path]?.compare}
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt class="text-muted-foreground">Branch</dt>
          <dd class="font-mono">
            {wt.worktree.branch ?? `detached at ${short(wt.worktree.head)}`}
          </dd>
          <dt class="text-muted-foreground">Folder</dt>
          <dd class="font-mono break-all">{wt.worktree.path}</dd>
          {#if c}
            <dt class="text-muted-foreground">vs {c.base}</dt>
            <dd>
              {[
                c.ahead && `↑ ${c.ahead} ahead`,
                c.behind && `↓ ${c.behind} behind`,
                c.same && `≡ ${c.same} copies`
              ]
                .filter(Boolean)
                .join(' · ') || 'Same as the base'}{c.mergeBaseDate
                ? ` · forked ${ago(c.mergeBaseDate)}`
                : ''}
            </dd>
          {/if}
        </dl>
        {#if c?.rewritten}
          <p
            class="mt-2 flex items-start gap-1 rounded-sm border border-dirty/40 bg-dirty/10 px-1.5 py-1 text-xs text-dirty"
          >
            <TriangleAlert class="mt-px size-3.5 shrink-0" />
            Rewritten history: rather than merging, start a fresh branch from {c.base} and bring these
            changes over.
          </p>
        {/if}
        <p class="mt-2 text-xs text-muted-foreground">
          Click a file to see its diff against the worktree's HEAD; the right side is the real file
          in that folder.
        </p>
        <button
          class="mt-1 text-xs text-ring hover:underline"
          onclick={() => app.reveal(wt.worktree.head)}
        >
          Show its commit in the graph
        </button>
      {:else if branch}
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
        {#snippet fileRow(f: FileChange, depth: number, withDir: boolean)}
          <li>
            <button
              class="flex w-full items-center gap-2 py-0.5 pr-3 text-left hover:bg-accent data-menu-open:bg-accent"
              style="padding-left: {12 + depth * 14}px"
              onclick={() => diff(f)}
              oncontextmenu={(e) => open(e, fileMenu(f))}
              title={f.status === 'R' ? `${f.oldPath} → ${f.path}` : f.path}
            >
              <span class={cn('w-3 shrink-0 font-mono text-xs font-bold', statusColor[f.status])}
                >{f.status}</span
              >
              <span class="truncate">
                {f.path.split('/').pop()}
                {#if withDir}
                  <span class="text-xs text-muted-foreground"
                    >{f.path.split('/').slice(0, -1).join('/')}</span
                  >
                {/if}
              </span>
              {#if f.additions !== null}
                <span class="ml-auto shrink-0 font-mono text-xs">
                  <span class={statusColor.A}>+{f.additions}</span>
                  <span class={statusColor.D}>−{f.deletions}</span>
                </span>
              {/if}
            </button>
          </li>
        {/snippet}
        {#snippet folder(dir: Dir, depth: number)}
          {#each dir.dirs as sub (sub.path)}
            {@const expanded = !collapsed.has(sub.path)}
            <li>
              <button
                class="flex w-full items-center gap-1 py-0.5 pr-3 text-left text-muted-foreground hover:bg-accent"
                style="padding-left: {8 + depth * 14}px"
                title={sub.path}
                onclick={() => (expanded ? collapsed.add(sub.path) : collapsed.delete(sub.path))}
              >
                <ChevronRight
                  class={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-90')}
                />
                <Folder class="size-3.5 shrink-0" />
                <span class="truncate">{sub.name}</span>
              </button>
            </li>
            {#if expanded}
              {@render folder(sub, depth + 1)}
            {/if}
          {/each}
          {#each dir.files as f (f.path)}
            {@render fileRow(f, depth, false)}
          {/each}
        {/snippet}
        <ul class="overflow-auto border-l py-1">
          {#if app.view.fileTree}
            {@render folder(tree, 0)}
          {:else}
            {#each files as f (f.path)}
              {@render fileRow(f, 0, true)}
            {/each}
          {/if}
        </ul>
      {/snippet}
    </ActionMenu>
  </div>
</div>
