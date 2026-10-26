/**
 * The single contract between the extension host and the webview.
 * Both sides import these types; the RPC layer is typed from `HostApi`.
 */

export const UNCOMMITTED = '*';

/** The Uncommitted Changes row, this folder's or another worktree's. */
export const isUncommitted = (c: { hash: string }) => c.hash.startsWith(UNCOMMITTED);

export interface Repo {
  path: string;
  name: string;
}

export type RefKind = 'head' | 'remote' | 'tag' | 'stash';

export interface Ref {
  kind: RefKind;
  /** Short display name: `main`, `origin/main`, `v1.0`, `stash@{0}`. */
  name: string;
  /** Remote name for remote-tracking branches. */
  remote?: string;
  annotated?: boolean;
  /** Set on local branches checked out in another worktree: that worktree's path. */
  worktree?: string;
  /** Set on local branches that track a remote branch. */
  upstream?: Upstream;
}

export interface Upstream {
  /** e.g. `origin/main`. */
  name: string;
  /** Commits to push. */
  ahead: number;
  /** Commits to pull. */
  behind: number;
  /** The remote branch was deleted. */
  gone: boolean;
}

export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  /** Unix seconds. */
  date: number;
  subject: string;
  refs: Ref[];
  /** Set on stash rows: the commit the stash was taken on. */
  stashBase?: string;
  /**
   * Set on another worktree's Uncommitted Changes row (drawn above the commit it's on): that
   * worktree's folder.
   */
  worktree?: string;
  /**
   * Relative to the compare base: only on HEAD (`ahead`), only on the base (`behind`), or on one
   * side with an equivalent commit (same changes, another hash) on the other (`same`).
   */
  side?: Side;
}

export interface GraphQuery {
  repo: string;
  /** Branch names to show; empty = all. */
  branches: string[];
  /**
   * Branches (local or remote) left out of "all": the commits only they have disappear, what they
   * share with other branches stays. Ignored when `branches` is set.
   */
  hidden: string[];
  /** Author names to show; empty = all. */
  authors: string[];
  showRemotes: boolean;
  /** Tag badges, and the commits only tags reach. */
  showTags: boolean;
  /** Stash rows (above the commit each was taken on). */
  showStashes: boolean;
  maxCommits: number;
  /** Branch to compare HEAD with; null = the default (origin/HEAD, then main/master). */
  base: string | null;
  /** Show only these kinds of commits relative to the base (plus their merge base); empty = all. */
  focus: Side[];
}

export type Side = 'ahead' | 'behind' | 'same';

export interface Compare {
  base: string;
  /** The commit the base points to. */
  baseHash: string;
  /** Commits on HEAD whose changes are not on the base. */
  ahead: number;
  /** Commits on the base whose changes are not on HEAD. */
  behind: number;
  /**
   * Commits on HEAD whose changes are already on the base under another hash: the branch was
   * rebased onto it, or cherry-picked / "rebase and merge"d into it.
   */
  same: number;
  /** Where HEAD forked from the base; null for unrelated histories. */
  mergeBase: string | null;
  /** Commit date (Unix seconds) of the merge base. */
  mergeBaseDate: number | null;
  /**
   * Most of HEAD's commits are copies of the base's: one side's history was rewritten (filter-repo,
   * a forced rebase), so ahead/behind by hash would be mostly noise.
   */
  rewritten: boolean;
}

/**
 * Who a branch belongs to and whether it is merged, relative to the compare base: loaded one branch
 * at a time after each graph load (see `HostApi.getBranchDetails`).
 */
export interface BranchDetails {
  /**
   * Authors of its own commits (merge commits aside), most commits first: the ones the base doesn't
   * have or, once merged with a merge commit, the ones that merge brought in. Empty when nothing
   * tells them apart from the base's (it never had commits of its own, or was fast-forwarded).
   */
  authors: BranchAuthor[];
  /** The merge commit on the base its commits came in with, when `authors` come from there. */
  mergedBy?: string;
  /**
   * Its commits whose changes are not on the base, copies (rebased, cherry-picked, "rebase and
   * merge"d) aside: 0 = merged.
   */
  unique: number;
}

export interface BranchAuthor {
  name: string;
  email: string;
  commits: number;
}

/** A GitHub pull request opened from one of the repository's branches (see `HostApi.getPullRequests`). */
export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'draft' | 'merged' | 'closed';
  /** GitHub login of who opened it. */
  author: string;
  /** Unix seconds. */
  updatedAt: number;
  /** The branch it was opened from, as named on the remote, and the commit it was last at. */
  head: string;
  headOid: string;
  /** The branch it goes into. */
  base: string;
  /** The review verdict GitHub shows; null when the repository requires none and nobody gave one. */
  decision: 'approved' | 'changes' | 'required' | null;
  /** Everyone asked for a review or who gave one, with their latest verdict. */
  reviewers: {
    login: string;
    state: 'approved' | 'changes' | 'commented' | 'requested' | 'dismissed';
  }[];
  /** Review conversations (comment threads on the code). */
  threads: { resolved: number; unresolved: number };
  /** Checks on its latest commit; null when it has none. */
  checks: 'passing' | 'failing' | 'pending' | null;
}

/**
 * The repository's pull requests, or why there are none: not on GitHub (`none`), no access yet
 * (`signin`: neither the gh CLI nor the editor's GitHub account can read it), or a failure.
 */
export type PullRequests =
  | { status: 'ok'; via: 'gh' | 'editor'; repo: string; prs: PullRequest[] }
  | { status: 'none' }
  | { status: 'signin'; repo: string }
  | { status: 'error'; message: string };

/** A worktree compared with a base, and its uncommitted changes: loaded when its card opens. */
export interface WorktreeDetails {
  compare: Compare | null;
  files: FileChange[];
  /**
   * Its commit is also on another branch, a remote branch or a tag: removing the worktree (and,
   * for a detached one, its HEAD) loses no commit.
   */
  kept: boolean;
}

export interface GraphData {
  commits: Commit[];
  /** HEAD commit hash, null on an empty repo. */
  head: string | null;
  /** Current branch name, null when detached. */
  currentBranch: string | null;
  /** Every branch name (local + remote) for the branch filter. */
  branches: string[];
  remotes: string[];
  worktrees: Worktree[];
  /** Local branches and tags, most recent first (whether or not their commit is loaded). */
  heads: RefSummary[];
  tags: RefSummary[];
  /** Remote-tracking branches, most recent first. */
  remoteHeads: RefSummary[];
  /** HEAD vs the base branch; null when there is no HEAD or no base. */
  compare: Compare | null;
  /** The configured git identity (user.name, user.email), for "mine" filters. */
  user: { name: string; email: string } | null;
  hasMore: boolean;
}

export interface RefSummary {
  ref: Ref;
  /** The commit it points to. */
  hash: string;
  /** Unix seconds: the commit date, or the tagging date of an annotated tag. */
  date: number;
  /** Subject of the commit it points to. */
  subject: string;
  /** Branches only: commits ahead of / behind the compare base (by hash), when there is one. */
  vsBase?: { ahead: number; behind: number };
}

export interface Worktree {
  path: string;
  /** Checked-out branch, null when detached. */
  branch: string | null;
  head: string;
  /** The commit it's on: committer date (Unix seconds) and subject; null when unknown. */
  headDate: number | null;
  headSubject: string | null;
  /** The main working tree, the one that owns the `.git` directory. */
  main: boolean;
  /** The worktree the graph is showing. */
  current: boolean;
  locked: boolean;
  /** Its directory is gone; `git worktree prune` cleans it up. */
  prunable: boolean;
  /** Null when the directory can't be read. */
  status: WorktreeStatus | null;
}

export interface WorktreeStatus {
  /** Changed, staged and untracked files. */
  changes: number;
  ahead: number;
  behind: number;
  /** Upstream branch, null when none is set. */
  upstream: string | null;
}

export type FileStatus = 'A' | 'M' | 'D' | 'R' | 'U';

export interface FileChange {
  status: FileStatus;
  oldPath: string;
  path: string;
  additions: number | null;
  deletions: number | null;
}

export interface CommitDetails {
  hash: string;
  parents: string[];
  author: string;
  authorEmail: string;
  authorDate: number;
  committer: string;
  committerEmail: string;
  committerDate: number;
  body: string;
  files: FileChange[];
}

/** A diff side: a commit hash, `UNCOMMITTED` (working tree) or `null` (file absent). */
export interface DiffTarget {
  repo: string;
  file: FileChange;
  from: string;
  to: string;
}

/**
 * Everything the context menus can trigger. Prompts happen host-side, natively, and only when
 * something is needed (a name) or something would be lost (changes, unique commits).
 */
export type Action =
  | { type: 'checkoutBranch'; name: string; remote?: string }
  | { type: 'checkoutCommit'; hash: string }
  | { type: 'createBranch'; hash: string }
  | { type: 'renameBranch'; name: string }
  | { type: 'deleteBranch'; name: string }
  | { type: 'deleteRemoteBranch'; name: string; remote: string }
  /** Deletes local branches and remote ones (`origin/x`) at once, after one confirmation. */
  | { type: 'deleteBranches'; local: string[]; remote: { name: string; remote: string }[] }
  | { type: 'pushBranch'; name: string; force?: boolean }
  | { type: 'pullBranch'; name: string; remote: string }
  /** Brings a local branch up to date with its upstream, wherever it is checked out (or not). */
  | { type: 'updateBranch'; name: string }
  | { type: 'merge'; target: string }
  | { type: 'rebase'; target: string }
  | { type: 'cherryPick'; hash: string; parents: number }
  | { type: 'revert'; hash: string; parents: number }
  | { type: 'reset'; hash: string }
  | { type: 'addTag'; hash: string }
  | { type: 'deleteTag'; name: string }
  | { type: 'pushTag'; name: string }
  | { type: 'stashPush' }
  | { type: 'stashApply'; selector: string }
  | { type: 'stashPop'; selector: string }
  | { type: 'stashDrop'; selector: string }
  | { type: 'stashBranch'; selector: string }
  | { type: 'unstageAll' }
  | { type: 'discardAll' }
  | { type: 'fetch' }
  /**
   * `target` is a local branch to check out (`isBranch`), or a commit / remote branch to start
   * from: a new branch (asked, `suggest`ed) or, with `detach`, a detached HEAD.
   */
  | {
      type: 'addWorktree';
      target: string;
      isBranch?: boolean;
      suggest?: string;
      detach?: boolean;
      /** Open it in a new window right away instead of offering to. */
      open?: boolean;
    }
  /**
   * Picks what a new worktree checks out: a free local branch, a remote branch, or a new branch from
   * `base` (default: the repository's default base) or from another branch.
   */
  | { type: 'newWorktree'; base?: string }
  /** Optionally deletes the branch that was checked out there too, and its copy on the remote. */
  | {
      type: 'removeWorktree';
      path: string;
      deleteBranch?: string;
      deleteRemote?: { name: string; remote: string };
    }
  /** Removes the worktree and checks its branch out in the main worktree, carrying its changes. */
  /** Removes several worktrees after one confirmation, which also offers to delete their branches. */
  | { type: 'removeWorktrees'; paths: string[] }
  | { type: 'bringWorktreeHere'; path: string; branch: string }
  | { type: 'pruneWorktrees' };

/** Which navigation rows the graph shows, remembered across sessions and windows. */
export interface ViewSettings {
  worktrees: boolean;
  branches: boolean;
  tags: boolean;
  /** The commit list's optional columns (Graph and Description are always shown). */
  columns: Record<Column, boolean>;
  /** Changed files of a commit as a folder tree rather than a flat list. */
  fileTree: boolean;
  /** Column widths in px; `graph: null` fits the graph's lanes. Description takes the rest. */
  widths: { graph: number | null } & Record<Column, number>;
}

export type Column = 'date' | 'author' | 'commit';

export const DEFAULT_VIEW: ViewSettings = {
  worktrees: true,
  branches: true,
  tags: true,
  columns: { date: true, author: true, commit: true },
  fileTree: false,
  widths: { graph: null, date: 170, author: 140, commit: 76 }
};

export interface HostApi {
  getRepos(): Promise<Repo[]>;
  getGraph(query: GraphQuery): Promise<GraphData>;
  getDetails(repo: string, commit: Commit): Promise<CommitDetails>;
  /**
   * Where a commit comes in the graph `query` draws (`at`: its row, to load that far at once), or,
   * when it isn't there, whether the filters hide it.
   */
  locate(query: GraphQuery, hash: string): Promise<{ at: number } | { hidden: boolean }>;
  compare(repo: string, from: string, to: string): Promise<FileChange[]>;
  run(repo: string, action: Action): Promise<void>;
  openDiff(target: DiffTarget): Promise<void>;
  openFile(repo: string, path: string, hash?: string): Promise<void>;
  openScm(): Promise<void>;
  /** Opens a folder (a worktree) in a new window of the running editor. */
  openFolder(path: string): Promise<void>;
  /** Writes a commit message for the current changes into the Source Control input box. */
  generateCommitMessage(repo: string): Promise<void>;
  copy(text: string): Promise<void>;
  getWorktreeDetails(path: string, base: string | null): Promise<WorktreeDetails>;
  /**
   * Several branches at once, by full ref name (`refs/heads/x`, `refs/remotes/origin/x`); `base` is
   * a branch name. `key` says which commits they were asked for (branch and base): answers are kept
   * across sessions by it.
   */
  getBranchDetails(
    repo: string,
    refs: { ref: string; key: string }[],
    base: string
  ): Promise<Record<string, BranchDetails>>;
  /**
   * How the graph of a repository was last set up (hidden branches, filters, base…), shared by all
   * its worktrees and windows; the webview decides what's in it. Null the first time.
   */
  getRepoView(repo: string): Promise<Record<string, unknown> | null>;
  setRepoView(repo: string, view: Record<string, unknown>): Promise<void>;
  /** A line in the Treeline output channel (timings, for diagnosing slow repositories). */
  log(message: string): Promise<void>;
  /** Cached for a minute; `fresh` asks GitHub again (after a fetch, say). */
  getPullRequests(repo: string, fresh?: boolean): Promise<PullRequests>;
  /** Signs in with the editor's GitHub account (it asks for consent), then loads them. */
  connectGitHub(repo: string): Promise<PullRequests>;
  openUrl(url: string): Promise<void>;
  getView(): Promise<ViewSettings>;
  setView(view: ViewSettings): Promise<void>;
}

export type RpcRequest = { id: number; method: keyof HostApi; args: unknown[] };
export type RpcResponse = { id: number; result?: unknown; error?: string };
/** Pushed host → webview when the repo changes on disk or the repo list changes. */
export type HostEvent =
  | { event: 'refresh' }
  | { event: 'repos' }
  /** An action's git commands started (after its prompts) or finished; `key` is its `actionTarget`. */
  | { event: 'busy'; key: string; busy: boolean };

/**
 * What an action works on, so the UI can show it as busy: a worktree path, a ref name, a stash,
 * a commit hash, `UNCOMMITTED` for the working tree, or the action type for repository-wide ones.
 */
export function actionTarget(a: Action): string {
  switch (a.type) {
    case 'stashPush':
    case 'unstageAll':
    case 'discardAll':
      return UNCOMMITTED;
    case 'fetch':
    case 'pruneWorktrees':
    case 'newWorktree':
    case 'deleteBranches':
    case 'removeWorktrees':
      return a.type;
  }
  if ('path' in a) return a.path;
  if ('selector' in a) return a.selector;
  if ('name' in a) return a.name;
  return 'hash' in a ? a.hash : a.target;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60]
] as const;

/** "3 days ago", "last month"… for a Unix timestamp in seconds. */
export function ago(unix: number, now = Date.now() / 1000) {
  const diff = unix - now;
  for (const [unit, seconds] of UNITS)
    if (Math.abs(diff) >= seconds) return relative.format(Math.round(diff / seconds), unit);
  return 'just now';
}

/** "5m", "3h", "2d", "3w", "4mo", "1y": how long ago, compactly, for chips and lists. */
export function since(unix: number, now = Date.now() / 1000) {
  const diff = now - unix;
  for (const [unit, seconds] of UNITS)
    if (diff >= seconds) return `${Math.floor(diff / seconds)}${SHORT[unit]}`;
  return 'now';
}
const SHORT = { year: 'y', month: 'mo', week: 'w', day: 'd', hour: 'h', minute: 'm' } as const;
