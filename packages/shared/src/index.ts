/**
 * The single contract between the extension host and the webview.
 * Both sides import these types; the RPC layer is typed from `HostApi`.
 */

export const UNCOMMITTED = '*';

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
  /** Relative to the compare base: only on HEAD (`ahead`) or only on the base (`behind`). */
  side?: 'ahead' | 'behind';
}

export interface GraphQuery {
  repo: string;
  /** Branch names to show; empty = all. */
  branches: string[];
  /** Author names to show; empty = all. */
  authors: string[];
  showRemotes: boolean;
  maxCommits: number;
  /** Branch to compare HEAD with; null = the default (origin/HEAD, then main/master). */
  base: string | null;
  /** Show only what diverged between HEAD and the base (plus their merge base). */
  focus: boolean;
}

export interface Compare {
  base: string;
  /** Commits on HEAD that are not on the base. */
  ahead: number;
  /** Commits on the base that are not on HEAD. */
  behind: number;
  /** Where HEAD forked from the base; null for unrelated histories. */
  mergeBase: string | null;
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
  /** HEAD vs the base branch; null when there is no HEAD or no base. */
  compare: Compare | null;
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
  /** Optionally deletes the branch that was checked out there too. */
  | { type: 'removeWorktree'; path: string; deleteBranch?: string }
  /** Removes the worktree and checks its branch out in the main worktree, carrying its changes. */
  | { type: 'bringWorktreeHere'; path: string; branch: string }
  | { type: 'pruneWorktrees' };

/** Which navigation rows the graph shows, remembered across sessions and windows. */
export interface ViewSettings {
  worktrees: boolean;
  branches: boolean;
  tags: boolean;
}

export interface HostApi {
  getRepos(): Promise<Repo[]>;
  getGraph(query: GraphQuery): Promise<GraphData>;
  getDetails(repo: string, commit: Commit): Promise<CommitDetails>;
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
