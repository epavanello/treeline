import { tick } from 'svelte';
import {
  DEFAULT_VIEW,
  UNCOMMITTED,
  type Commit,
  type CommitDetails,
  type FileChange,
  type GraphData,
  type Repo,
  type Side,
  type Worktree,
  type WorktreeDetails,
  type ViewSettings
} from '@treeline/shared';
import { layout } from './graph';
import { host, onHostEvent, vscode } from './rpc';

const PAGE = 300;

interface Persisted {
  repo?: string;
  branches?: string[];
  authors?: string[];
  showRemotes?: boolean;
  base?: string | null;
  focus?: Side[];
}

/** All webview state in one place. Components read it directly. */
class App {
  repos = $state<Repo[]>([]);
  repo = $state<string | null>(null);
  branches = $state<string[]>([]);
  authors = $state<string[]>([]);
  /** Every author seen in this repo's loaded commits, for the author filter. */
  knownAuthors = $state<string[]>([]);
  showRemotes = $state(true);
  maxCommits = $state(PAGE);
  /** Branch HEAD is compared with; null = the host's default (origin/HEAD, main…). */
  base = $state<string | null>(null);
  /** Show only what diverged between HEAD and the base. */
  focus = $state<Side[]>([]);

  data = $state<GraphData | null>(null);
  error = $state<string | null>(null);
  loading = $state(false);

  selected = $state<Commit | null>(null);
  /** Second commit for a comparison (Cmd/Ctrl+click). */
  compareWith = $state<Commit | null>(null);
  details = $state<CommitDetails | null>(null);
  compareFiles = $state<FileChange[] | null>(null);
  /** Another worktree's uncommitted changes, shown in the details panel (its chip was clicked). */
  worktreePanel = $state<{ worktree: Worktree; files: FileChange[] } | null>(null);
  /** Everything that changed since HEAD forked from the base, working tree included. */
  branchDiff = $state<{ base: string; mergeBase: string; files: FileChange[] } | null>(null);

  find = $state('');
  /** Which navigation rows are shown (worktrees, branches, tags). */
  view = $state<ViewSettings>(structuredClone(DEFAULT_VIEW));
  /** Worktree cards' comparison and uncommitted files, by path: loaded on hover, `null` while loading. */
  worktreeDetails = $state<Record<string, WorktreeDetails | null>>({});
  /** A context menu is open: tooltips stay hidden meanwhile (see ActionMenu, Tip). */
  menuOpen = $state(false);
  /** A short-lived message under the toolbar (see `flash`). */
  notice = $state<string | null>(null);
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
    this.notice = message;
    setTimeout(() => this.notice === message && (this.notice = null), 5000);
  }

  /**
   * Selects a commit and scrolls to it, loading more history when it isn't loaded yet
   * (doubling the page each time, up to 20k commits).
   */
  async reveal(hash: string) {
    const find = () => this.data?.commits.find((c) => c.hash === hash);
    while (!find() && this.data?.hasMore && this.maxCommits < 20_000) {
      this.maxCommits *= 2;
      await this.refresh();
    }
    const commit = find();
    if (!commit)
      return this.flash(
        "That commit isn't in the graph: the branch, author or ↑↓ filters hide it."
      );
    void this.select(commit);
    await tick();
    this.scrollTo(hash);
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

  /** Whether an action is running on any of these targets (worktree path, ref name, hash…). */
  isRunning(...keys: (string | null | undefined)[]) {
    return keys.some((k) => k && this.running.includes(k));
  }

  /** Scrolls the commit list to a commit; set by App.svelte, which owns the scroller. */
  scrollTo: (hash: string) => void = () => {};

  private loadSeq = 0;

  async init() {
    const saved = vscode.getState<Persisted>() ?? {};
    this.branches = saved.branches ?? [];
    this.authors = saved.authors ?? [];
    this.showRemotes = saved.showRemotes ?? true;
    this.base = saved.base ?? null;
    // Older saved state had a boolean here
    this.focus = Array.isArray(saved.focus) ? saved.focus : [];
    void host.getView().then((v) => (this.view = v));
    await this.loadRepos(saved.repo);
    onHostEvent((e) => {
      if (e.event === 'refresh') void this.refresh();
      else if (e.event === 'busy')
        this.running = e.busy
          ? [...this.running, e.key]
          : this.running.filter((k, i) => i !== this.running.indexOf(e.key));
      else void this.loadRepos(this.repo ?? undefined);
    });
  }

  async loadRepos(prefer?: string) {
    this.repos = await host.getRepos();
    const next = this.repos.find((r) => r.path === prefer)?.path ?? this.repos[0]?.path ?? null;
    if (next !== this.repo) await this.setRepo(next);
  }

  async setRepo(repo: string | null, keepFilters = false) {
    this.repo = repo;
    if (!keepFilters) {
      [this.branches, this.authors, this.knownAuthors] = [[], [], []];
      this.base = null;
    }
    this.maxCommits = PAGE;
    this.closeDetails();
    this.data = null;
    await this.refresh();
  }

  persist() {
    vscode.setState<Persisted>({
      repo: this.repo ?? undefined,
      branches: $state.snapshot(this.branches),
      authors: $state.snapshot(this.authors),
      showRemotes: this.showRemotes,
      base: this.base,
      focus: $state.snapshot(this.focus)
    });
  }

  async refresh(): Promise<void> {
    if (!this.repo) return;
    this.persist();
    const seq = ++this.loadSeq;
    this.loading = true;
    try {
      const data = await host.getGraph({
        repo: this.repo,
        branches: $state.snapshot(this.branches),
        authors: $state.snapshot(this.authors),
        showRemotes: this.showRemotes,
        maxCommits: this.maxCommits,
        base: this.base,
        focus: $state.snapshot(this.focus)
      });
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
      this.data = data;
      this.error = null;
      void this.preloadWorktreeDetails(data);
      const seen = data.commits.filter((c) => c.hash !== UNCOMMITTED).map((c) => c.author);
      this.knownAuthors = [...new Set([...this.knownAuthors, ...this.authors, ...seen])].sort(
        (a, b) => a.localeCompare(b)
      );
      // Keep what the details panel shows up to date
      if (this.worktreePanel) {
        const still = data.worktrees.find((w) => w.path === this.worktreePanel!.worktree.path);
        if (still) void this.openWorktree(still);
        else this.closeDetails();
      } else if (this.branchDiff) void this.openBranchDiff();
      else if (this.selected) {
        const still = data.commits.find((c) => c.hash === this.selected!.hash);
        if (still) void this.select(still);
        else this.closeDetails();
      }
    } catch (e) {
      if (seq === this.loadSeq) this.error = (e as Error).message;
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
    this.maxCommits = PAGE;
    void this.refresh();
  }

  setAuthors(authors: string[]) {
    this.authors = authors;
    this.maxCommits = PAGE;
    void this.refresh();
  }

  setBase(base: string | null) {
    this.base = base;
    this.maxCommits = PAGE;
    if (this.branchDiff) this.branchDiff = null;
    void this.refresh();
  }

  /** Show (or stop showing) only one side of the divergence: ahead, behind, same. */
  toggleFocus(side: Side) {
    this.focus = this.focus.includes(side)
      ? this.focus.filter((s) => s !== side)
      : [...this.focus, side];
    this.maxCommits = PAGE;
    void this.refresh();
  }

  /**
   * A worktree's uncommitted changes in the details panel; for the worktree this graph shows, its
   * Uncommitted Changes row.
   */
  async openWorktree(w: Worktree) {
    if (w.current) {
      const row = this.data?.commits.find((c) => c.hash === UNCOMMITTED);
      if (row) return this.select(row);
      return this.reveal(w.head);
    }
    const details = await host.getWorktreeDetails(w.path, this.data?.compare?.base ?? this.base);
    this.worktreeDetails[w.path] = details;
    this.selected = this.compareWith = this.details = this.compareFiles = this.branchDiff = null;
    this.worktreePanel = { worktree: w, files: details.files };
  }

  /** Opens (or refreshes) the "everything since I forked from the base" file list. */
  async openBranchDiff() {
    const c = this.data?.compare;
    if (!this.repo || !c?.mergeBase) return;
    const files = await host.compare(this.repo, c.mergeBase, UNCOMMITTED);
    this.selected = this.compareWith = this.details = this.compareFiles = this.worktreePanel = null;
    this.branchDiff = { base: c.base, mergeBase: c.mergeBase, files };
  }

  setView(patch: Partial<ViewSettings>) {
    this.view = { ...this.view, ...patch };
    void host.setView($state.snapshot(this.view));
  }

  setShowRemotes(show: boolean) {
    this.showRemotes = show;
    this.branches = this.branches.filter((b) => show || this.data?.branches.includes(b));
    void this.refresh();
  }

  async select(commit: Commit, compare = false) {
    if (!this.repo) return;
    if (compare && this.selected && this.selected.hash !== commit.hash) {
      this.compareWith = commit;
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
    this.branchDiff = this.worktreePanel = null;
    this.compareWith = null;
    this.compareFiles = null;
    this.details = await host.getDetails(this.repo, $state.snapshot(commit));
  }

  closeDetails() {
    this.selected = null;
    this.compareWith = null;
    this.details = null;
    this.compareFiles = null;
    this.branchDiff = this.worktreePanel = null;
  }
}

export const app = new App();
