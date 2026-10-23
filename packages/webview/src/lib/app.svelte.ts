import {
  UNCOMMITTED,
  type Commit,
  type CommitDetails,
  type FileChange,
  type GraphData,
  type Repo
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
  focus?: boolean;
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
  focus = $state(false);

  data = $state<GraphData | null>(null);
  error = $state<string | null>(null);
  loading = $state(false);

  selected = $state<Commit | null>(null);
  /** Second commit for a comparison (Cmd/Ctrl+click). */
  compareWith = $state<Commit | null>(null);
  details = $state<CommitDetails | null>(null);
  compareFiles = $state<FileChange[] | null>(null);
  /** Everything that changed since HEAD forked from the base, working tree included. */
  branchDiff = $state<{ base: string; mergeBase: string; files: FileChange[] } | null>(null);

  find = $state('');

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

  /** Scrolls the commit list to a commit; set by App.svelte, which owns the scroller. */
  scrollTo: (hash: string) => void = () => {};

  private loadSeq = 0;

  async init() {
    const saved = vscode.getState<Persisted>() ?? {};
    this.branches = saved.branches ?? [];
    this.authors = saved.authors ?? [];
    this.showRemotes = saved.showRemotes ?? true;
    this.base = saved.base ?? null;
    this.focus = saved.focus ?? false;
    await this.loadRepos(saved.repo);
    onHostEvent((e) => {
      if (e.event === 'refresh') void this.refresh();
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
      focus: this.focus
    });
  }

  async refresh() {
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
        focus: this.focus
      });
      if (seq !== this.loadSeq) return;
      this.data = data;
      this.error = null;
      const seen = data.commits.filter((c) => c.hash !== UNCOMMITTED).map((c) => c.author);
      this.knownAuthors = [...new Set([...this.knownAuthors, ...this.authors, ...seen])].sort(
        (a, b) => a.localeCompare(b)
      );
      // Keep what the details panel shows up to date
      if (this.branchDiff) void this.openBranchDiff();
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

  toggleFocus() {
    this.focus = !this.focus;
    this.maxCommits = PAGE;
    void this.refresh();
  }

  /** Opens (or refreshes) the "everything since I forked from the base" file list. */
  async openBranchDiff() {
    const c = this.data?.compare;
    if (!this.repo || !c?.mergeBase) return;
    const files = await host.compare(this.repo, c.mergeBase, UNCOMMITTED);
    this.selected = this.compareWith = this.details = this.compareFiles = null;
    this.branchDiff = { base: c.base, mergeBase: c.mergeBase, files };
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
    this.branchDiff = null;
    this.compareWith = null;
    this.compareFiles = null;
    this.details = await host.getDetails(this.repo, $state.snapshot(commit));
  }

  closeDetails() {
    this.selected = null;
    this.compareWith = null;
    this.details = null;
    this.compareFiles = null;
    this.branchDiff = null;
  }
}

export const app = new App();
