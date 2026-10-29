import { tick } from 'svelte';
import {
  DEFAULT_VIEW,
  isUncommitted,
  UNCOMMITTED,
  type Action,
  type BranchDetails,
  type ClaudeSession,
  type Commit,
  type CommitDetails,
  type FileChange,
  type GraphData,
  type GraphQuery,
  type PullRequest,
  type PullRequests,
  type Ref,
  type RefSummary,
  type Repo,
  type Side,
  type Worktree,
  type WorktreeDetails,
  type ViewSettings
} from '@treeline/shared';
import {
  branchRows,
  currentPull,
  primary,
  DEFAULT_BRANCH_FILTER,
  DEFAULT_PULL_FILTER,
  DEFAULT_WORKTREE_FILTER,
  isBase,
  type BranchFilter,
  type BranchRow,
  type Context,
  type PullFilter,
  type WorktreeFilter
} from './filters';
import { layout } from './graph';
import { resetHighlighter } from './highlight';
import { host, onHostEvent, vscode } from './rpc';

const PAGE = 300;
/** Branches per host call for their details (see preloadBranchDetails). */
const BATCH = 40;

/** What this panel remembers: which repository, and the ↑↓ filters of its current comparison. */
interface Persisted {
  repo?: string;
  focus?: Side[];
}

/**
 * How a repository's graph is set up, remembered by the extension for the repository itself: every
 * worktree and window of it opens with the same hidden branches, filters and base.
 */
interface RepoView {
  branches: string[];
  hidden: string[];
  authors: string[];
  showRemotes: boolean;
  showTags: boolean;
  showStashes: boolean;
  showWorktrees: boolean;
  base: string | null;
  branchFilter: BranchFilter;
  worktreeFilter: WorktreeFilter;
  pullFilter: PullFilter;
}

/** All webview state in one place. Components read it directly. */
class App {
  repos = $state<Repo[]>([]);
  repo = $state<string | null>(null);
  branches = $state<string[]>([]);
  /** Branches left out of "all" (see GraphQuery.hidden). */
  hidden = $state<string[]>([]);
  authors = $state<string[]>([]);
  /** Every author seen in this repo's loaded commits, for the author filter. */
  knownAuthors = $state<string[]>([]);
  showRemotes = $state(true);
  /** Tag badges in the graph (the Tags row is a row of its own, shown or not from View). */
  showTags = $state(true);
  showStashes = $state(true);
  showWorktrees = $state(true);
  maxCommits = $state(PAGE);
  /** Branch HEAD is compared with; null = the host's default (origin/HEAD, main…). */
  base = $state<string | null>(null);
  /** Show only what diverged between HEAD and the base. */
  focus = $state<Side[]>([]);

  data = $state<GraphData | null>(null);
  error = $state<string | null>(null);
  loading = $state(false);

  /** Bumped when the editor's color theme changes: diffs shown are colored again. */
  themeVersion = $state(0);
  selected = $state<Commit | null>(null);
  /** Second commit for a comparison (Cmd/Ctrl+click). */
  compareWith = $state<Commit | null>(null);
  details = $state<CommitDetails | null>(null);
  compareFiles = $state<FileChange[] | null>(null);
  /** Another worktree's uncommitted changes, shown in the details panel (its chip was clicked). */
  worktreePanel = $state<{ worktree: Worktree; files: FileChange[] } | null>(null);
  /** Everything that changed since HEAD forked from the base, working tree included. */
  branchDiff = $state<{ base: string; mergeBase: string; files: FileChange[] } | null>(null);
  /**
   * A pull request's changes, as GitHub shows them: from where its head forked from its base
   * (`from`) to its head (`to`). `files` null while they load.
   */
  pullPanel = $state<{
    pr: PullRequest;
    from: string;
    to: string;
    files: FileChange[] | null;
  } | null>(null);

  find = $state('');
  /** Which navigation rows are shown (worktrees, branches, tags). */
  view = $state<ViewSettings>(structuredClone(DEFAULT_VIEW));
  /** Worktree cards' comparison and uncommitted files, by path: loaded on hover, `null` while loading. */
  worktreeDetails = $state<Record<string, WorktreeDetails | null>>({});
  /**
   * Branches' authors and merged state vs the compare base, by name, loaded one at a time after
   * each load; `key` says which branch and base commits they were computed for.
   */
  branchDetails = $state<Record<string, BranchDetails & { key: string }>>({});
  /** Branch details still being computed, while they are (the filters that need them may grow). */
  branchProgress = $state<{ done: number; total: number } | null>(null);
  loadingBranchDetails = $derived(!!this.branchProgress);
  /** What the Branches and Worktrees rows show (see filters.ts). */
  branchFilter = $state<BranchFilter>({ ...DEFAULT_BRANCH_FILTER });
  worktreeFilter = $state<WorktreeFilter>({ ...DEFAULT_WORKTREE_FILTER });
  pullFilter = $state<PullFilter>({ ...DEFAULT_PULL_FILTER });
  /** The repository's pull requests on GitHub, or why there are none; null until asked. */
  pulls = $state<PullRequests | null>(null);
  /** Claude Code sessions that ran in the repository's folders, most recent first (see sessions.ts). */
  claudeSessions = $state.raw<ClaudeSession[]>([]);
  /** Every branch once, local and remote copies together (see filters.ts). */
  rows = $derived(this.data ? branchRows(this.data) : []);
  /** Each branch's row by name, local or remote: what it is paired with. */
  rowOf = $derived(
    new Map(
      this.rows.flatMap((row) =>
        [row.local, row.remote].flatMap((r) => (r ? [[r.ref.name, row] as const] : []))
      )
    ) as Map<string, BranchRow>
  );
  filterContext = $derived<Context>({
    details: this.branchDetails,
    pulls: this.pulls?.status === 'ok' ? this.pulls.prs : [],
    user: this.data?.user ?? null,
    base: this.data?.compare?.base,
    now: Date.now() / 1000
  });
  /** A context menu is open: tooltips stay hidden meanwhile (see ActionMenu, Tip). */
  menuOpen = $state(false);
  /**
   * What a reload you asked for is busy with (a filter changed, a commit being looked up): the list
   * dims under it. Reloads after changes on disk stay quiet.
   */
  // Raw: replaced whole, and compared by identity (a proxy would never equal the object set)
  working = $state.raw<{ text: string } | null>(null);

  /** Reloads after a filter changed, showing it (see `working`). */
  private async reload(text = 'Applying the filters…') {
    const token = { text };
    this.working = token;
    try {
      await this.refresh();
    } finally {
      if (this.working === token) this.working = null;
    }
  }

  /** A short-lived message under the toolbar (see `flash`). */
  // Raw, like `working`: `flash` compares it by identity to know it's still its own
  notice = $state.raw<{
    text: string;
    /** A button that does something about it ("Show it"); such a notice stays until used or closed. */
    action?: { label: string; run: () => unknown };
    /** Something is loading meanwhile. */
    busy?: boolean;
  } | null>(null);
  /** `actionTarget`s of the actions whose git commands are running (host `busy` events). */
  running = $state<string[]>([]);

  graph = $derived(layout(this.data?.commits ?? []));
  matches = $derived.by(() => {
    const q = this.find.trim().toLowerCase();
    if (!q || !this.data) return new Set<string>();
    return new Set(
      this.data.commits
        .filter(
          (c) =>
            c.subject.toLowerCase().includes(q) ||
            c.hash.startsWith(q) ||
            c.author.toLowerCase().includes(q) ||
            c.refs.some((r) => r.name.toLowerCase().includes(q))
        )
        .map((c) => c.hash)
    );
  });

  flash(message: string) {
    const notice = { text: message };
    this.notice = notice;
    setTimeout(() => this.notice === notice && (this.notice = null), 5000);
  }

  /**
   * Selects a commit and scrolls to it, loading more history when it isn't loaded yet
   * (doubling the page each time, up to 20k commits).
   */
  async reveal(hash: string, quiet = false) {
    let commit = this.data?.commits.find((c) => c.hash === hash);
    if (!commit && this.repo) {
      // Ask where it is first: it may be thousands of commits down, or hidden by a filter
      const finding = { text: 'Finding that commit…' };
      this.working = finding;
      const where = await host.locate(this.query(), hash).catch(() => null);
      if (this.working === finding) this.working = null;
      if (where && 'hidden' in where) return this.hiddenCommit(hash, where.hidden, quiet);
      if (where && where.at >= this.maxCommits) {
        // Load that far in one go (and a page past it), saying so
        const target = (Math.floor(where.at / PAGE) + 2) * PAGE;
        this.maxCommits = target;
        await this.reload(
          `Loading the history down to that commit: ${target.toLocaleString()} commits…`
        );
      }
      commit = this.data?.commits.find((c) => c.hash === hash);
    }
    if (!commit) return quiet ? undefined : this.flash("That commit isn't in the graph.");
    void this.select(commit);
    await tick();
    this.scrollTo(hash);
  }

  /** A commit to reveal that the graph leaves out: say which filters do, and offer to lift them. */
  private hiddenCommit(hash: string, byFilters: boolean, quiet = false) {
    if (!byFilters)
      return quiet
        ? undefined
        : this.flash("No branch, tag or worktree has that commit: the graph can't show it.");
    const active = [
      this.authors.length && `the author filter (${this.authors.length})`,
      this.branches.length && `the branches shown (${this.branches.length})`,
      this.hidden.length && `hidden branches (${this.hidden.length})`,
      this.focus.length && 'the ↑↓ filter',
      !this.showRemotes && 'remote branches being off',
      !this.showTags && 'tags being off'
    ].filter(Boolean);
    this.notice = {
      text: `That commit is hidden by ${active.join(', ').replace(/, ([^,]*)$/, ' and $1') || 'the filters'}.`,
      action: {
        label: 'Show it',
        run: async () => {
          [this.authors, this.branches, this.hidden, this.focus] = [[], [], [], []];
          this.showRemotes = this.showTags = true;
          this.maxCommits = PAGE;
          this.notice = null;
          await this.refresh();
          await this.reveal(hash);
        }
      }
    };
  }

  /** The graph as filtered now (what `refresh` loads). */
  private query(): GraphQuery {
    return {
      repo: this.repo!,
      branches: $state.snapshot(this.branches),
      hidden: $state.snapshot(this.hidden),
      authors: $state.snapshot(this.authors),
      showRemotes: this.showRemotes,
      showTags: this.showTags,
      showStashes: this.showStashes,
      showWorktrees: this.showWorktrees,
      maxCommits: this.maxCommits,
      base: this.base,
      focus: $state.snapshot(this.focus)
    };
  }

  /**
   * Every worktree's card details, one at a time after each load, so a rewritten history is
   * flagged without hovering. The host caches comparisons until a HEAD moves, so this stays cheap.
   */
  private async preloadWorktreeDetails(data: GraphData) {
    const seq = this.loadSeq;
    for (const w of data.worktrees) {
      if (w.prunable || seq !== this.loadSeq) continue;
      try {
        this.worktreeDetails[w.path] = await host.getWorktreeDetails(
          w.path,
          data.compare?.base ?? this.base
        );
      } catch {
        // A worktree being removed meanwhile: its card simply has no details
      }
    }
  }

  /**
   * Every branch's authors and merged state, the Branches row's scope first, in batches the host
   * computes in parallel (and keeps across sessions); a branch is asked again only when it or the
   * base moved. One update per batch, so the rows redraw a few times, not once per branch.
   */
  private async preloadBranchDetails(data: GraphData) {
    const seq = this.loadSeq;
    const [repo, c] = [this.repo, data.compare];
    if (!repo || !c) return void (this.branchProgress = null);
    const key = (r: RefSummary) => `${r.hash} ${c.baseHash}`;
    const full = (r: RefSummary) =>
      `refs/${r.ref.kind === 'head' ? 'heads' : 'remotes'}/${r.ref.name}`;
    const first = this.branchFilter.scope === 'remote' ? 'remote' : 'head';
    const todo = [...data.heads, ...data.remoteHeads]
      .filter((r) => this.branchDetails[r.ref.name]?.key !== key(r))
      .sort((a, b) => +(b.ref.kind === first) - +(a.ref.kind === first));
    if (!todo.length) return void (this.branchProgress = null);
    const started = Date.now();
    this.branchProgress = { done: 0, total: todo.length };
    for (let i = 0; i < todo.length; i += BATCH) {
      if (seq !== this.loadSeq) return;
      const batch = todo.slice(i, i + BATCH);
      const got = await host
        .getBranchDetails(
          repo,
          batch.map((r) => ({ ref: full(r), key: key(r) })),
          c.base
        )
        .catch(() => ({}) as Record<string, BranchDetails>);
      if (seq !== this.loadSeq) return;
      const next = { ...this.branchDetails };
      for (const r of batch) if (got[full(r)]) next[r.ref.name] = { key: key(r), ...got[full(r)] };
      this.branchDetails = next;
      this.branchProgress = { done: Math.min(i + BATCH, todo.length), total: todo.length };
    }
    this.branchProgress = null;
    void host.log(`branch details: ${todo.length} branches in ${Date.now() - started} ms`);
  }

  /**
   * Runs an action, then reloads the graph. The host asks for a reload too; this one doesn't depend
   * on that message arriving, so what the action changed always shows.
   */
  async run(action: Action) {
    if (!this.repo) return;
    try {
      await host.run(this.repo, action);
    } finally {
      void this.refresh();
    }
  }

  /** Asks the host for the pull requests: cached there for a minute, so cheap after every load. */
  async loadPulls(fresh = false) {
    const repo = this.repo;
    if (!repo) return;
    const pulls = await host.getPullRequests(repo, fresh).catch(() => null);
    if (repo !== this.repo) return;
    this.pulls = pulls;
    // The pull request shown: its reviews and checks as they are now, its changes again if pushed to
    const shown = this.pullPanel?.pr;
    const now = pulls?.status === 'ok' && pulls.prs.find((p) => p.number === shown?.number);
    if (shown && now)
      if (now.headOid !== shown.headOid || now.mergeOid !== shown.mergeOid) void this.openPull(now);
      else this.pullPanel!.pr = now;
  }

  /**
   * A pull request's chip was clicked: its head selected in the graph, when the graph has it, and its
   * changes in the details panel.
   */
  async showPull(pr: PullRequest) {
    await this.reveal(pr.headOid, true);
    if (this.selected?.hash !== pr.headOid) this.selected = null;
    await this.openPull(pr);
  }

  /**
   * The checked-out branch's open pull request, or how to open one: from it into the compare base.
   * Null with nothing to open a pull request from (a detached HEAD, the base itself).
   */
  newPullFor = $derived.by(() => {
    const [d, p] = [this.data, this.pulls];
    const branch = d?.currentBranch;
    const head = d?.heads.find((h) => h.ref.name === branch);
    if (!d?.compare || p?.status !== 'ok' || !head || isBase(head, d.compare.base)) return null;
    const open = p.prs.filter((pr) => pr.state === 'open' || pr.state === 'draft');
    const existing = currentPull(open, this.rows, branch!);
    const up = head.ref.upstream;
    const into = d.compare.base.replace(new RegExp(`^(${d.remotes.join('|')})/`), '');
    return {
      branch: branch!,
      into,
      existing,
      /** Not on GitHub as it is here: pushed first. */
      push: !up || up.gone || up.ahead > 0
    };
  });

  /** Opens GitHub's page for a new pull request of the checked-out branch, pushing it first if needed. */
  async newPull() {
    const n = this.newPullFor;
    const pulls = this.pulls;
    if (!n || pulls?.status !== 'ok') return;
    if (n.existing) return this.showPull(n.existing);
    if (n.push) {
      await this.run({ type: 'pushBranch', name: n.branch });
      await this.refresh();
    }
    const up = this.data?.heads.find((h) => h.ref.name === n.branch)?.ref.upstream;
    // Not pushed after all (cancelled, or it failed): nothing to compare on GitHub yet
    if (!up || up.gone) return;
    const head = up.name.slice(up.name.indexOf('/') + 1);
    const site = pulls.prs[0] ? new URL(pulls.prs[0].url).origin : 'https://github.com';
    const path = (s: string) => s.split('/').map(encodeURIComponent).join('/');
    await host.openUrl(`${site}/${pulls.repo}/compare/${path(n.into)}...${path(head)}?expand=1`);
  }

  /** A pull request's changes in the details panel (its head fetched first when it isn't here). */
  async openPull(pr: PullRequest) {
    const [repo, pulls] = [this.repo, this.pulls];
    if (!repo || pulls?.status !== 'ok') return;
    this.compareWith =
      this.details =
      this.compareFiles =
      this.branchDiff =
      this.worktreePanel =
        null;
    this.pullPanel = { pr, from: '', to: '', files: null };
    const still = () => this.repo === repo && this.pullPanel?.pr.number === pr.number;
    try {
      const { from, to } = await host.pullRange(repo, pulls.remote, $state.snapshot(pr));
      const files = await host.compare(repo, from, to);
      if (still()) this.pullPanel = { pr, from, to, files };
    } catch (e) {
      if (!still()) return;
      this.pullPanel = null;
      this.flash(`Couldn't get the changes of #${pr.number}: ${(e as Error).message}`);
    }
  }

  /** Read from Claude Code's files after every load: cheap, the host reads only what changed. */
  async loadClaudeSessions(data: GraphData) {
    const repo = this.repo;
    const folders = data.worktrees.filter((w) => !w.prunable).map((w) => w.path);
    const sessions = await host.getClaudeSessions(folders).catch(() => []);
    if (repo === this.repo) this.claudeSessions = sessions;
  }

  /**
   * The Claude sessions behind a branch or a worktree, open ones first, then archived ones, each most
   * recent first and with why: it committed
   * to the branch, opened its pull request, ran in the worktree's folder, or was on the branch.
   * The main worktree's folder says nothing: most sessions run there.
   */
  sessionsOf(branch: string | null | undefined, worktree?: Worktree) {
    const folders = this.data?.worktrees.map((w) => w.path) ?? [];
    /** The innermost worktree a session's folder is in. */
    const folderOf = (cwd: string) =>
      folders
        .filter((f) => cwd === f || cwd.startsWith(`${f}/`))
        .sort((a, b) => b.length - a.length)[0];
    const out: { s: ClaudeSession; why: string }[] = [];
    for (const s of this.claudeSessions) {
      const why =
        branch && s.committed.includes(branch)
          ? 'committed to it'
          : branch && s.pulls.includes(branch)
            ? 'opened its pull request'
            : worktree && !worktree.main && folderOf(s.cwd) === worktree.path
              ? 'ran in this folder'
              : branch && s.branches.includes(branch)
                ? 'was on it'
                : null;
      if (why) out.push({ s, why });
    }
    // Already most recent first: a stable sort keeps that within each group
    return out.sort((a, b) => +a.s.archived - +b.s.archived);
  }

  /** Signs in with the editor's GitHub account (it asks for consent), then shows them. */
  async connectGitHub() {
    const repo = this.repo;
    if (!repo) return;
    const pulls = await host.connectGitHub(repo);
    if (repo === this.repo) this.pulls = pulls;
  }

  setBranchFilter(patch: Partial<BranchFilter>) {
    this.branchFilter = { ...this.branchFilter, ...patch };
    this.persist();
  }

  setPullFilter(patch: Partial<PullFilter>) {
    this.pullFilter = { ...this.pullFilter, ...patch };
    this.persist();
  }

  setWorktreeFilter(patch: Partial<WorktreeFilter>) {
    this.worktreeFilter = { ...this.worktreeFilter, ...patch };
    this.persist();
  }

  async loadWorktreeDetails(path: string) {
    if (path in this.worktreeDetails) return;
    this.worktreeDetails[path] = null;
    try {
      const base = this.data?.compare?.base ?? this.base;
      this.worktreeDetails[path] = await host.getWorktreeDetails(path, base);
    } catch {
      delete this.worktreeDetails[path];
    }
  }

  /**
   * A ref's name as badges, chips and lists show it: a remote branch without its remote (the
   * cloud icon says it), which comes apart only when the repository has several.
   */
  refLabel(ref: Ref): { name: string; remote?: string } {
    if (ref.kind !== 'remote' || !ref.remote) return { name: ref.name };
    const name = ref.name.slice(ref.remote.length + 1);
    return (this.data?.remotes.length ?? 0) > 1 ? { name, remote: ref.remote } : { name };
  }

  /** Whether an action is running on any of these targets (worktree path, ref name, hash…). */
  isRunning(...keys: (string | null | undefined)[]) {
    return keys.some((k) => k && this.running.includes(k));
  }

  /** Scrolls the commit list to a commit; set by App.svelte, which owns the scroller. */
  scrollTo: (hash: string) => void = () => {};

  private loadSeq = 0;

  async init() {
    const saved = vscode.getState<Persisted>() ?? {};
    // Older saved state had a boolean here
    this.focus = Array.isArray(saved.focus) ? saved.focus : [];
    void host.getView().then((v) => (this.view = v));
    // Pull requests change on GitHub, not on disk: ask again now and then while the graph is seen
    setInterval(() => document.visibilityState === 'visible' && void this.loadPulls(), 60_000);
    await this.loadRepos(saved.repo);
    onHostEvent((e) => {
      if (e.event === 'refresh') void this.refresh();
      else if (e.event === 'busy')
        this.running = e.busy
          ? [...this.running, e.key]
          : this.running.filter((k, i) => i !== this.running.indexOf(e.key));
      else if (e.event === 'theme') {
        resetHighlighter();
        this.themeVersion++;
      } else void this.loadRepos(this.repo ?? undefined);
    });
  }

  async loadRepos(prefer?: string) {
    this.repos = await host.getRepos();
    const next = this.repos.find((r) => r.path === prefer)?.path ?? this.repos[0]?.path ?? null;
    if (next !== this.repo) await this.setRepo(next);
  }

  async setRepo(repo: string | null) {
    this.repo = repo;
    this.knownAuthors = [];
    this.applyRepoView(repo ? await host.getRepoView(repo).catch(() => null) : null);
    if (repo !== this.repo) return; // another repository was picked meanwhile
    this.maxCommits = PAGE;
    this.closeDetails();
    this.data = null;
    this.branchDetails = {};
    this.pulls = null;
    this.claudeSessions = [];
    await this.refresh();
  }

  private repoView(): RepoView {
    return $state.snapshot({
      branches: this.branches,
      hidden: this.hidden,
      authors: this.authors,
      showRemotes: this.showRemotes,
      showTags: this.showTags,
      showStashes: this.showStashes,
      showWorktrees: this.showWorktrees,
      base: this.base,
      branchFilter: this.branchFilter,
      worktreeFilter: this.worktreeFilter,
      pullFilter: this.pullFilter
    });
  }

  /** A repository's remembered setup (null: never opened, so the defaults). */
  private applyRepoView(saved: Partial<RepoView> | null) {
    this.branches = saved?.branches ?? [];
    this.hidden = saved?.hidden ?? [];
    this.authors = saved?.authors ?? [];
    this.showRemotes = saved?.showRemotes ?? true;
    this.showTags = saved?.showTags ?? true;
    this.showStashes = saved?.showStashes ?? true;
    this.showWorktrees = saved?.showWorktrees ?? true;
    this.base = saved?.base ?? null;
    this.branchFilter = { ...DEFAULT_BRANCH_FILTER, ...saved?.branchFilter };
    this.worktreeFilter = { ...DEFAULT_WORKTREE_FILTER, ...saved?.worktreeFilter };
    this.pullFilter = { ...DEFAULT_PULL_FILTER, ...saved?.pullFilter };
    this.sentView = JSON.stringify(this.repoView());
  }

  /** The last setup sent to the host, so an unchanged one isn't written again on every load. */
  private sentView = '';

  persist() {
    vscode.setState<Persisted>({
      repo: this.repo ?? undefined,
      focus: $state.snapshot(this.focus)
    });
    const view = this.repoView();
    const json = JSON.stringify(view);
    if (this.repo && json !== this.sentView) {
      this.sentView = json;
      void host.setRepoView(this.repo, { ...view });
    }
  }

  async refresh(retry = true): Promise<void> {
    if (!this.repo) return;
    this.persist();
    const seq = ++this.loadSeq;
    this.loading = true;
    try {
      const data = await host.getGraph(this.query());
      if (seq !== this.loadSeq) return;
      // Side filters belong to one comparison: reset them when the branch changed (a checkout),
      // and drop a side that has no commits left (e.g. ahead after a rebase), then reload
      if (this.focus.length) {
        const switched = !!this.data && this.data.currentBranch !== data.currentBranch;
        const c = data.compare;
        const keep = switched || !c ? [] : this.focus.filter((side) => c[side] > 0);
        if (keep.length !== this.focus.length) {
          this.focus = keep;
          return this.refresh();
        }
      }
      // Branches shown or hidden on purpose that were deleted since: forget them
      const names = new Set([...data.heads, ...data.remoteHeads].map((r) => r.ref.name));
      if (this.branches.some((b) => !names.has(b)) || this.hidden.some((b) => !names.has(b))) {
        this.branches = this.branches.filter((b) => names.has(b));
        this.hidden = this.hidden.filter((b) => names.has(b));
        this.persist();
      }
      this.data = data;
      this.error = null;
      void this.preloadWorktreeDetails(data);
      void this.preloadBranchDetails(data);
      void this.loadPulls();
      void this.loadClaudeSessions(data);
      const seen = data.commits.filter((c) => !isUncommitted(c)).map((c) => c.author);
      this.knownAuthors = [...new Set([...this.knownAuthors, ...this.authors, ...seen])].sort(
        (a, b) => a.localeCompare(b)
      );
      // Keep what the details panel shows up to date
      if (this.worktreePanel) {
        const still = data.worktrees.find((w) => w.path === this.worktreePanel!.worktree.path);
        // Its row: still there while it has changes (selected again, as the new object it is now)
        const row = data.commits.find((c) => c.worktree === still?.path);
        if (still && (row || !this.selected?.worktree)) {
          if (row) this.selected = row;
          void this.showWorktreeChanges(still);
        } else this.closeDetails();
      } else if (this.branchDiff) void this.openBranchDiff();
      else if (this.pullPanel) {
        // A pull request's commits don't change with the repository: new pushes come with loadPulls
      } else if (this.selected) {
        const still = data.commits.find((c) => c.hash === this.selected!.hash);
        if (still) void this.select(still);
        else this.closeDetails();
      }
    } catch (e) {
      if (seq !== this.loadSeq) return;
      // Git may have been mid-change (refs being rewritten by another command): try once more
      if (retry) {
        await new Promise((r) => setTimeout(r, 500));
        if (seq === this.loadSeq) return this.refresh(false);
      } else this.error = (e as Error).message;
    } finally {
      if (seq === this.loadSeq) this.loading = false;
    }
  }

  async loadMore() {
    if (!this.data?.hasMore || this.loading) return;
    this.maxCommits += PAGE;
    await this.refresh();
  }

  setBranches(branches: string[]) {
    this.branches = branches;
    // A branch can't be both shown on purpose and hidden
    this.hidden = this.hidden.filter((b) => !branches.includes(b));
    this.maxCommits = PAGE;
    void this.reload();
  }

  /**
   * Shows `name` with the compare base and, in a stack of branches (stacked pull requests), those
   * built on it (`above`) or its whole stack: every branch sharing a commit with it the base lacks.
   */
  async showStack(name: string, part: 'base' | 'above' | 'stack') {
    const base = this.data?.compare?.base;
    if (!base || !this.repo) return;
    const names = part === 'base' ? [] : (await host.branchStack(this.repo, name, base))[part];
    const show = new Set([name, base]);
    const skip = new Set([this.rowOf.get(name), this.rowOf.get(base)]);
    // One name per branch (its local copy when there is one), only branches the rows know
    for (const n of names) {
      const row = this.rowOf.get(n);
      if (row && !skip.has(row)) show.add(primary(row).ref.name);
    }
    this.setBranches([...show]);
  }

  /** Hide a branch from "all", or bring it back. */
  toggleHidden(name: string) {
    this.hidden = this.hidden.includes(name)
      ? this.hidden.filter((b) => b !== name)
      : [...this.hidden, name];
    this.branches = this.branches.filter((b) => b !== name);
    this.maxCommits = PAGE;
    void this.reload();
  }

  /** Back to every branch: nothing picked, nothing hidden. */
  showAllBranches() {
    this.hidden = [];
    this.setBranches([]);
  }

  setAuthors(authors: string[]) {
    this.authors = authors;
    this.maxCommits = PAGE;
    void this.reload();
  }

  setBase(base: string | null) {
    this.base = base;
    this.maxCommits = PAGE;
    if (this.branchDiff) this.branchDiff = null;
    void this.reload();
  }

  /** Show (or stop showing) only one side of the divergence: ahead, behind, same. */
  toggleFocus(side: Side) {
    this.focus = this.focus.includes(side)
      ? this.focus.filter((s) => s !== side)
      : [...this.focus, side];
    this.maxCommits = PAGE;
    void this.reload();
  }

  /**
   * A worktree's chip was clicked: like a branch's, its commit in the graph, selected; and when it
   * has uncommitted changes, those in the details panel (for the worktree this graph shows, its
   * Uncommitted Changes row).
   */
  async openWorktree(w: Worktree) {
    if (w.current) {
      const row = this.data?.commits.find((c) => c.hash === UNCOMMITTED);
      if (row) return this.select(row);
      return this.reveal(w.head);
    }
    await this.reveal(w.head);
    // With changes: its Uncommitted Changes row, right above the commit
    const row = this.data?.commits.find((c) => c.worktree === w.path);
    if (row) {
      void this.select(row);
      await tick();
      this.scrollTo(row.hash);
    }
  }

  /** A worktree's uncommitted files in the details panel; its commit stays selected in the graph. */
  async showWorktreeChanges(w: Worktree) {
    const details = await host.getWorktreeDetails(w.path, this.data?.compare?.base ?? this.base);
    this.worktreeDetails[w.path] = details;
    this.compareWith = this.details = this.compareFiles = this.branchDiff = this.pullPanel = null;
    this.worktreePanel = { worktree: w, files: details.files };
  }

  /** Opens (or refreshes) the "everything since I forked from the base" file list. */
  async openBranchDiff() {
    const c = this.data?.compare;
    if (!this.repo || !c?.mergeBase) return;
    const files = await host.compare(this.repo, c.mergeBase, UNCOMMITTED);
    this.selected = this.compareWith = this.details = this.compareFiles = this.worktreePanel = null;
    this.pullPanel = null;
    this.branchDiff = { base: c.base, mergeBase: c.mergeBase, files };
  }

  /** A worktree as its branch (what its chip and card show), or its commit when detached. */
  worktreeSummary(w: Worktree): RefSummary {
    return (
      this.data?.heads.find((h) => h.ref.name === w.branch) ?? {
        ref: { kind: 'head', name: w.branch ?? `detached ${w.head.slice(0, 8)}` },
        hash: w.head,
        date: w.headDate ?? 0,
        subject: w.headSubject ?? ''
      }
    );
  }

  private savingView?: ReturnType<typeof setTimeout>;
  setView(patch: Partial<ViewSettings>) {
    if (Object.entries(patch).every(([k, v]) => this.view[k as keyof ViewSettings] === v)) return;
    this.view = { ...this.view, ...patch };
    // Dragging a divider changes it on every frame: save once it settles
    clearTimeout(this.savingView);
    this.savingView = setTimeout(() => void host.setView($state.snapshot(this.view)), 300);
  }

  setShowTags(show: boolean) {
    if (this.showTags === show) return;
    this.showTags = show;
    void this.reload();
  }

  setShowStashes(show: boolean) {
    if (this.showStashes === show) return;
    this.showStashes = show;
    void this.reload();
  }

  setShowWorktrees(show: boolean) {
    if (this.showWorktrees === show) return;
    this.showWorktrees = show;
    void this.reload();
  }

  setShowRemotes(show: boolean) {
    if (this.showRemotes === show) return;
    this.showRemotes = show;
    this.branches = this.branches.filter((b) => show || this.data?.branches.includes(b));
    void this.refresh();
  }

  async select(commit: Commit, compare = false) {
    if (!this.repo) return;
    if (commit.worktree) {
      // Another worktree's uncommitted changes: its files, diffed in its own folder
      const w = this.data?.worktrees.find((x) => x.path === commit.worktree);
      this.selected = commit;
      if (w) await this.showWorktreeChanges(w);
      return;
    }
    if (compare && this.selected && !this.selected.worktree && this.selected.hash !== commit.hash) {
      this.compareWith = commit;
      this.pullPanel = null;
      // Older commit first; UNCOMMITTED is always the newest side.
      const commits = this.data!.commits;
      const [newer, older] =
        commits.indexOf(commit) < commits.findIndex((c) => c.hash === this.selected!.hash)
          ? [commit, this.selected]
          : [this.selected, commit];
      this.compareFiles = await host.compare(this.repo, older.hash, newer.hash);
      return;
    }
    this.selected = commit;
    this.branchDiff = this.worktreePanel = this.pullPanel = null;
    this.compareWith = null;
    this.compareFiles = null;
    this.details = await host.getDetails(this.repo, $state.snapshot(commit));
  }

  closeDetails() {
    this.selected = null;
    this.compareWith = null;
    this.details = null;
    this.compareFiles = null;
    this.branchDiff = this.worktreePanel = this.pullPanel = null;
  }
}

export const app = new App();
