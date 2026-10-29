<script lang="ts">
  import { ago, UNCOMMITTED, type FileChange, type Ref } from '@treeline/shared';
  import {
    ChevronRight,
    Copy,
    File,
    FileClock,
    FileDiff,
    FilePen,
    Folder,
    FolderGit2,
    GitBranch,
    GitCommitHorizontal,
    GitCompare,
    GitMerge,
    GitPullRequest,
    Sparkles,
    List,
    LoaderCircle,
    ListTree,
    Rows3,
    X
  } from '@lucide/svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { app } from '$lib/app.svelte';
  import { host } from '$lib/rpc';
  import type { MenuItem } from '$lib/menus';
  import { Button } from '$lib/components/ui/button';
  import * as Resizable from '$lib/components/ui/resizable';
  import { cn } from '$lib/utils';
  import { fileTree, type Dir } from '$lib/fileTree';
  import { STATUS_COLOR, STATUS_LABEL } from '$lib/fileStatus';
  import { pullRow } from '$lib/filters';
  import ActionMenu from './ActionMenu.svelte';
  import AuthorAvatar from './AuthorAvatar.svelte';
  import ChangeSummary from './ChangeSummary.svelte';
  import ClaudeSessions from './ClaudeSessions.svelte';
  import CopyField from './CopyField.svelte';
  import DiffStat from './DiffStat.svelte';
  import DiffView from './DiffView.svelte';
  import PullCard from './PullCard.svelte';
  import { PULL_STATE } from './PullBadge.svelte';
  import RefBadge from './RefBadge.svelte';
  import RefCard, { LEGEND, SUB } from './RefCard.svelte';
  import { laneColor } from './GraphSvg.svelte';

  const d = $derived(app.details);
  const branch = $derived(app.branchDiff);
  const wt = $derived(app.worktreePanel);
  const pull = $derived(app.pullPanel);
  const comparing = $derived(!!app.compareWith && !!app.compareFiles);
  const files = $derived(
    pull
      ? (pull.files ?? [])
      : wt
        ? wt.files
        : branch
          ? branch.files
          : comparing
            ? app.compareFiles!
            : (d?.files ?? [])
  );
  /** Where the files live: another worktree's folder, or the repository the graph shows. */
  const repo = $derived(wt ? wt.worktree.path : app.repo);
  const other = $derived(!!(pull || wt || branch || comparing));
  const uncommitted = $derived(!other && app.selected?.hash === UNCOMMITTED);
  /** A commit's details, once loaded (not while another one's are still shown). */
  const commit = $derived(
    !other && d && d.hash !== UNCOMMITTED && d.hash === app.selected?.hash ? d : null
  );

  /** The two revisions the file list is a diff between. */
  const range = $derived.by((): { from: string; to: string } => {
    if (pull) return { from: pull.from, to: pull.to };
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

  const totals = $derived(
    files.reduce((t, f) => ({ add: t.add + (f.additions ?? 0), del: t.del + (f.deletions ?? 0) }), {
      add: 0,
      del: 0
    })
  );
  const date = (s: number) => new Date(s * 1000).toLocaleString();
  const short = (h: string) => (h === UNCOMMITTED ? 'Working Tree' : h.slice(0, 8));
  const folderName = (path: string) => path.split(/[\\/]/).pop();
  /** A loaded commit's subject, to name a parent or a compared commit. */
  const subjectOf = (hash: string) => app.data?.commits.find((c) => c.hash === hash)?.subject;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function diff(file: FileChange) {
    if (!repo) return;
    void host.openDiff({ repo, file: $state.snapshot(file), ...range });
  }

  /** The file list or diff: back to its top when it shows other changes. */
  let right = $state<HTMLElement>();
  /** The list's or tree's file shown in the third column, as an inline diff. */
  let shown = $state<FileChange | null>(null);
  $effect(() => {
    void [repo, range.from, range.to];
    if (right) right.scrollTop = 0;
  });
  $effect(() => {
    void [repo, range.from, range.to];
    shown = null;
  });
  /** Still among the files (a refresh may have dropped it): as it is now. */
  const shownFile = $derived(
    app.view.files !== 'diff' && shown ? files.find((f) => f.path === shown!.path) : undefined
  );

  /** A long commit message shows its first lines, the rest on request. */
  let expanded = $state(false);
  let clamped = $state(false);
  let bodyEl = $state<HTMLElement>();
  $effect(() => {
    void app.selected?.hash;
    expanded = false;
  });
  $effect(() => {
    const el = bodyEl;
    if (!el) return;
    const measure = () => (clamped = el.scrollHeight > el.clientHeight + 1);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  });
  /** Branch and tag details by `kind:name`, for the badges' hover cards. */
  const summaries = $derived(
    new Map(
      [...(app.data?.heads ?? []), ...(app.data?.remoteHeads ?? []), ...(app.data?.tags ?? [])].map(
        (r) => [`${r.ref.kind}:${r.ref.name}`, r]
      )
    )
  );

  const tree = $derived(fileTree(files));
  /** Collapsed folders (all start expanded). */
  const collapsed = new SvelteSet<string>();

  const VIEWS = [
    { id: 'list', icon: List, hint: 'The changed files, as a flat list' },
    {
      id: 'tree',
      icon: ListTree,
      hint: 'The changed files as a folder tree (folders fold; chains of single folders share one row)'
    },
    {
      id: 'diff',
      icon: Rows3,
      hint: "Every change on one page, as a pull request shows them: each file's changed lines, colored like the editor colors them. A file's name opens its diff in the editor."
    }
  ] as const;

  function fileMenu(file: FileChange): MenuItem[] {
    const at = repo!;
    const { to } = range;
    return [
      {
        label: 'View Diff',
        icon: FileDiff,
        run: () => diff(file),
        hint: 'Side by side, before and after. When a side matches your working tree it opens the real file, so Go to Definition, errors and links work there.'
      },
      ...(file.status !== 'D' && to !== UNCOMMITTED
        ? [
            {
              // The working-tree side is the real file: Go to Definition, errors and links work
              label: 'Compare with Working Tree',
              icon: GitCompare,
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
              icon: FileClock,
              run: () => host.openFile(at, file.path, file.status === 'U' ? `${to}^3` : to),
              hint: `The whole file as it was at ${short(to)}, read-only.`
            }
          ]
        : []),
      ...(file.status !== 'D'
        ? [
            {
              label: 'Open File',
              icon: File,
              run: () => host.openFile(at, file.path),
              hint: wt ? `Opens the file in ${folderName(at)}.` : 'Opens your current file on disk.'
            }
          ]
        : []),
      'separator',
      { label: 'Copy Relative File Path', icon: Copy, run: () => host.copy(file.path) },
      { label: 'Copy Absolute File Path', icon: Copy, run: () => host.copy(`${at}/${file.path}`) }
    ];
  }
</script>

{#snippet commitLink(hash: string)}
  <!-- A commit to jump to: its short hash, then its subject when it's loaded -->
  <button
    class="flex w-full min-w-0 items-baseline gap-1.5 text-left hover:underline"
    title="Show it in the graph"
    onclick={() => app.reveal(hash)}
  >
    <span class="shrink-0 font-mono text-[11px] text-link">{short(hash)}</span>
    {#if subjectOf(hash)}<span class="truncate text-[12px]">{subjectOf(hash)}</span>{/if}
  </button>
{/snippet}

<div class="flex h-full flex-col border-t bg-card text-[13px]" data-testid="details">
  <!-- What the panel shows, how big it is, how to look at it -->
  <div class="flex h-8 shrink-0 items-center gap-2 border-b px-3">
    {#if pull}
      {@const s = PULL_STATE[pull.pr.state]}
      <s.icon class="size-3.5 shrink-0 {s.class}" />
      <span class="shrink-0 font-semibold">#{pull.pr.number}</span>
      <span class="truncate text-muted-foreground">{pull.pr.title}</span>
    {:else if wt}
      <FolderGit2 class="size-3.5 shrink-0" />
      <span class="truncate font-semibold">{folderName(wt.worktree.path)}</span>
      <span class="shrink-0 text-muted-foreground">uncommitted changes</span>
    {:else if branch}
      <GitCompare class="size-3.5 shrink-0" />
      <span class="truncate font-semibold">Changes vs {branch.base}</span>
    {:else if comparing}
      <GitCompare class="size-3.5 shrink-0" />
      <span class="truncate font-semibold">
        <span class="font-mono">{short(range.from)}</span> ↔
        <span class="font-mono">{short(range.to)}</span>
      </span>
    {:else if uncommitted}
      <FilePen class="size-3.5 shrink-0 text-dirty" />
      <span class="truncate font-semibold">Uncommitted Changes</span>
    {:else}
      <GitCommitHorizontal class="size-3.5 shrink-0" />
      <span class="shrink-0 font-semibold">Commit</span>
      <span class="truncate font-mono text-muted-foreground">{app.selected?.hash.slice(0, 8)}</span>
    {/if}
    <span class="shrink-0 text-xs text-muted-foreground">{plural(files.length, 'file')}</span>
    {#if totals.add || totals.del}
      <span class="shrink-0 font-mono text-[11px] tabular-nums">
        <span class="text-[var(--vscode-gitDecoration-addedResourceForeground)]">+{totals.add}</span
        >
        <span class="text-[var(--vscode-gitDecoration-deletedResourceForeground)]"
          >−{totals.del}</span
        >
      </span>
    {/if}
    <div class="ml-auto flex shrink-0 items-center rounded-sm border p-px">
      {#each VIEWS as v (v.id)}
        <Button
          variant="ghost"
          size="icon-xs"
          class={cn('size-5 rounded-[3px]', app.view.files === v.id && 'bg-accent text-foreground')}
          icon={v.icon}
          hint={v.hint}
          onclick={() => app.setView({ files: v.id })}
        />
      {/each}
    </div>
    <Button
      variant="ghost"
      size="icon-xs"
      icon={X}
      hint="Close the details (Esc)"
      onclick={() => app.closeDetails()}
    />
  </div>

  <Resizable.PaneGroup
    direction="horizontal"
    class="min-h-0 flex-1"
    onLayoutChange={(l) => {
      if (l.length === 2) app.setView({ detailsSplit: Math.round(l[0]) });
    }}
  >
    <Resizable.Pane defaultSize={app.view.detailsSplit} minSize={15} class="overflow-auto!">
      <div class="flex flex-col gap-3 p-3 select-text">
        {#if pull}
          {@const pr = pull.pr}
          {@const row = pullRow(pr, app.rows)}
          {@const local = row?.local}
          <dl class={LEGEND}>
            <dt><GitPullRequest class="size-3.5" /></dt>
            <dd><PullCard {pr} icon={false} view={false} /></dd>
            <dt><GitBranch class="size-3.5" /></dt>
            <dd>
              <span class="font-mono text-[12px]">{pr.head}</span>
              <span class="text-muted-foreground">into</span>
              <span class="font-mono text-[12px]">{pr.base}</span>
              <span class={SUB}>
                {!local && row?.remote
                  ? `only on the remote, as ${row.remote.ref.name}`
                  : !local
                    ? 'not on your machine: its head was fetched from GitHub'
                    : local.hash === pr.headOid
                      ? 'on your machine, as pushed'
                      : `your ${local.ref.name} is at another commit: these are the changes GitHub has`}
              </span>
            </dd>
            {#if pull.files}
              <dt><GitMerge class="size-3.5" /></dt>
              <dd>
                {@render commitLink(pull.from)}
                <span class={SUB}>
                  the fork point from {pr.base}{pr.mergeOid ? ', before its merge' : ''}
                </span>
              </dd>
              <dt><GitCommitHorizontal class="size-3.5" /></dt>
              <dd>
                {@render commitLink(pull.to)}
                <span class={SUB}>its head</span>
              </dd>
            {:else}
              <dt><LoaderCircle class="size-3.5 animate-spin" /></dt>
              <dd class="text-xs text-muted-foreground">Loading its changes…</dd>
            {/if}
            <ClaudeSessions branches={[pr.head]} />
            <dt><FileDiff class="size-3.5" /></dt>
            <dd class="text-[12px] text-muted-foreground">
              Diffs open on your working files when they match its head, so Go to Definition, errors
              and links work.
            </dd>
          </dl>
        {:else if wt}
          <!-- A worktree: its branch's card (the one its chip shows on hover) -->
          <div class="flex flex-col gap-2">
            <RefCard r={app.worktreeSummary(wt.worktree)} worktree={wt.worktree} files={false} />
          </div>
          <dl class={LEGEND}>
            <dt><Sparkles class="size-3.5" /></dt>
            <dd><ChangeSummary repo={wt.worktree.path} rev={null} version={wt.files} /></dd>
            <ClaudeSessions branches={[wt.worktree.branch]} worktree={wt.worktree} />
            <dt><GitCommitHorizontal class="size-3.5" /></dt>
            <dd>
              {@render commitLink(wt.worktree.head)}
              <span class={SUB}
                >its HEAD: the diffs are against it, the right side is the real file</span
              >
            </dd>
          </dl>
        {:else if branch}
          <dl class={LEGEND}>
            <dt><GitCompare class="size-3.5" /></dt>
            <dd>
              <span class="font-semibold">
                Everything {app.data?.currentBranch ?? 'HEAD'} changed since it forked from {branch.base}
              </span>
              <span class={SUB}>uncommitted changes included: what a pull request would show</span>
            </dd>
            <dt><GitMerge class="size-3.5" /></dt>
            <dd>
              {@render commitLink(branch.mergeBase)}
              <span class={SUB}>the fork point</span>
            </dd>
            <ClaudeSessions
              branches={[app.data?.currentBranch]}
              worktree={app.data?.worktrees.find((w) => w.current)}
            />
            <dt><FileDiff class="size-3.5" /></dt>
            <dd class="text-[12px] text-muted-foreground">
              Diffs open on your working files, so Go to Definition, errors and links work.
            </dd>
          </dl>
        {:else if comparing}
          <dl class={LEGEND}>
            <dt><span class="text-[11px]">from</span></dt>
            <dd>{@render commitLink(range.from)}</dd>
            <dt><span class="text-[11px]">to</span></dt>
            <dd>{@render commitLink(range.to)}</dd>
          </dl>
        {:else if uncommitted}
          <dl class={LEGEND}>
            <dt><FilePen class="size-3.5 text-dirty" /></dt>
            <dd>
              <span class="font-semibold text-dirty"
                >{plural(files.length, 'uncommitted change')}</span
              >
              <span class={SUB}>
                on {app.data?.currentBranch ?? 'a detached HEAD'}, against its last commit
              </span>
            </dd>
            {#if app.repo}
              <dt><Sparkles class="size-3.5" /></dt>
              <dd><ChangeSummary repo={app.repo} rev={null} version={d?.files} /></dd>
              <dt><FolderGit2 class="size-3.5" /></dt>
              <dd><CopyField value={app.repo} what="folder path" /></dd>
            {/if}
          </dl>
        {:else if commit}
          {@const [subject, ...rest] = commit.body.split('\n')}
          {@const body = rest.join('\n').trim()}
          {@const refs = app.selected?.refs ?? []}
          <!-- A local branch and its remote copy share one badge, as in the graph -->
          {@const remoteOf = (r: Ref) =>
            refs.find(
              (u) => u.kind === 'remote' && u.name === app.rowOf.get(r.name)?.remote?.ref.name
            )}
          {@const merged = refs.flatMap((r) => (r.kind === 'head' ? (remoteOf(r) ?? []) : []))}
          {@const row =
            app.graph.rows[app.data?.commits.findIndex((c) => c.hash === commit.hash) ?? -1]}
          <div>
            <h3 class="text-[14px] leading-snug font-semibold">{subject}</h3>
            {#if body}
              <!-- Its first lines; the rest on request -->
              <p
                bind:this={bodyEl}
                class={cn(
                  'mt-1.5 text-[13px] whitespace-pre-wrap text-foreground/85',
                  !expanded && 'line-clamp-4'
                )}
              >
                {body}
              </p>
              {#if expanded || clamped}
                <button
                  class="mt-0.5 text-xs text-link hover:text-link-hover hover:underline"
                  onclick={() => (expanded = !expanded)}
                >
                  {expanded ? 'Show less' : 'Show all'}
                </button>
              {/if}
            {/if}
            {#if refs.length}
              <div class="mt-2 flex flex-wrap gap-1">
                {#each refs.filter((r) => !merged.includes(r)) as r (r.kind + r.name)}
                  <RefBadge
                    ref={r}
                    remote={r.kind === 'head' ? remoteOf(r) : undefined}
                    card={summaries.get(`${r.kind}:${r.name}`)}
                    color={laneColor(row?.color ?? 0)}
                    current={r.kind === 'head' && r.name === app.data?.currentBranch}
                    status={r.worktree
                      ? app.data?.worktrees.find((w) => w.path === r.worktree)?.status
                      : undefined}
                  />
                {/each}
              </div>
            {/if}
          </div>
          <dl class="{LEGEND} border-t pt-3">
            <dt><AuthorAvatar name={commit.author} email={commit.authorEmail} /></dt>
            <dd>
              <span class="font-semibold">{commit.author}</span>
              <span class={SUB}>{commit.authorEmail}</span>
              <span class={SUB}>
                authored {ago(commit.authorDate)} ·
                <span class="italic">{date(commit.authorDate)}</span>
              </span>
            </dd>
            {#if commit.committer !== commit.author || commit.committerDate !== commit.authorDate}
              <dt><AuthorAvatar name={commit.committer} email={commit.committerEmail} /></dt>
              <dd>
                <span class="font-semibold">{commit.committer}</span>
                <span class={SUB}>
                  committed it {ago(commit.committerDate)} ·
                  <span class="italic">{date(commit.committerDate)}</span>
                </span>
              </dd>
            {/if}
            <dt><GitCommitHorizontal class="size-3.5" /></dt>
            <dd><CopyField value={commit.hash} what="commit hash" /></dd>
            <dt>
              {#if commit.parents.length > 1}<GitMerge class="size-3.5" />{:else}<span
                  class="text-[11px]">parent</span
                >{/if}
            </dt>
            <dd>
              {#each commit.parents as p (p)}
                {@render commitLink(p)}
              {:else}
                <span class="text-muted-foreground">None: the first commit</span>
              {/each}
              {#if commit.parents.length > 1}
                <span class={SUB}>a merge: the files are what it brought into the first one</span>
              {/if}
            </dd>
            {#if app.repo}
              <dt><Sparkles class="size-3.5" /></dt>
              <dd><ChangeSummary repo={app.repo} rev={commit.hash} /></dd>
            {/if}
            <!-- The sessions behind the branches it's the tip of (not the base: most sessions start there) -->
            <ClaudeSessions
              branches={refs
                .filter((r) => r.kind === 'head' || r.kind === 'remote')
                .filter((r) => r.name !== app.data?.compare?.base)
                .map((r) =>
                  r.kind === 'remote' ? r.name.slice((r.remote?.length ?? -1) + 1) : r.name
                )
                .filter((n) => !app.data?.compare?.base?.endsWith(`/${n}`))}
            />
          </dl>
        {:else}
          <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderCircle class="size-3.5 animate-spin" /> Loading the commit…
          </p>
        {/if}
      </div>
    </Resizable.Pane>
    <Resizable.Handle />
    <Resizable.Pane minSize={25}>
      <ActionMenu>
        {#snippet children(open)}
          {#snippet fileRow(f: FileChange, depth: number, withDir: boolean)}
            <li
              class={cn(
                'group flex items-center pr-1 hover:bg-accent has-data-menu-open:bg-accent',
                shownFile?.path === f.path &&
                  'bg-[var(--vscode-list-inactiveSelectionBackground,var(--accent))]'
              )}
            >
              <button
                class="flex min-w-0 flex-1 items-center gap-2 py-0.5 pr-1 text-left"
                style="padding-left: {12 + depth * 14}px"
                onclick={() => (shown = f)}
                ondblclick={() => diff(f)}
                oncontextmenu={(e) => open(e, fileMenu(f))}
                title="{STATUS_LABEL[f.status]}: {f.status === 'R'
                  ? `${f.oldPath} → ${f.path}`
                  : f.path}"
              >
                <span class={cn('w-3 shrink-0 font-mono text-xs font-bold', STATUS_COLOR[f.status])}
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
                <DiffStat
                  class="ml-auto shrink-0"
                  additions={f.additions}
                  deletions={f.deletions}
                />
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                class="size-5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                icon={FileDiff}
                hint="Open its diff in the editor, on your real file when it matches: Go to Definition, errors and links work (or double-click the file)"
                onclick={() => diff(f)}
              />
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
          {#snippet list()}
            <div class="h-full overflow-auto" bind:this={right}>
              <!-- A pull request's range is known once its head is here (it may be fetched first) -->
              {#if app.view.files === 'diff' && repo && (!pull || pull.files)}
                <DiffView
                  {repo}
                  {...range}
                  {files}
                  onopen={diff}
                  menu={(e, f) => open(e, fileMenu(f))}
                />
              {:else}
                <ul class="py-1">
                  {#if app.view.files === 'tree'}
                    {@render folder(tree, 0)}
                  {:else}
                    {#each files as f (f.path)}
                      {@render fileRow(f, 0, true)}
                    {/each}
                  {/if}
                </ul>
              {/if}
            </div>
          {/snippet}
          {#if shownFile && repo}
            <!-- The clicked file's diff in a third column, next to the list -->
            <Resizable.PaneGroup
              direction="horizontal"
              onLayoutChange={(l) => {
                if (l.length === 2) app.setView({ detailsFiles: Math.round(l[0]) });
              }}
            >
              <Resizable.Pane defaultSize={app.view.detailsFiles} minSize={15}>
                {@render list()}
              </Resizable.Pane>
              <Resizable.Handle />
              <Resizable.Pane minSize={25}>
                <div class="h-full overflow-auto">
                  {#key shownFile.path}
                    <DiffView
                      {repo}
                      {...range}
                      files={[shownFile]}
                      paths={[shownFile.path, shownFile.oldPath]}
                      onopen={diff}
                      menu={(e, f) => open(e, fileMenu(f))}
                      onclose={() => (shown = null)}
                    />
                  {/key}
                </div>
              </Resizable.Pane>
            </Resizable.PaneGroup>
          {:else}
            {@render list()}
          {/if}
        {/snippet}
      </ActionMenu>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
