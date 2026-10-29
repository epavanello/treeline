/**
 * The Branches, Pull Requests and Worktrees rows' own filters: which chips they show (the graph is filtered from
 * the toolbar). Pure functions over the graph data, the branch details and the pull requests,
 * unit-tested.
 */
import type {
  BranchDetails,
  GraphData,
  PullRequest,
  RefSummary,
  Worktree,
  WorktreeDetails
} from '@treeline/shared';

export interface BranchFilter {
  /** Branches you have locally (with the remote one each tracks), only on the remote, or both. */
  scope: 'local' | 'remote' | 'all';
  owner: 'anyone' | 'mine';
  state: 'any' | 'merged' | 'unmerged' | 'gone' | 'stale';
}

export interface WorktreeFilter {
  owner: 'anyone' | 'mine';
  state: 'any' | 'changes' | 'clean' | 'merged' | 'disposable' | 'stale';
}

export const DEFAULT_BRANCH_FILTER: BranchFilter = {
  scope: 'local',
  owner: 'anyone',
  state: 'any'
};
export const DEFAULT_WORKTREE_FILTER: WorktreeFilter = { owner: 'anyone', state: 'any' };

export interface PullFilter {
  /** Opened by you, or asking you for a review. */
  owner: 'anyone' | 'mine' | 'review';
  /** `open`: drafts included. */
  state: 'open' | 'draft' | 'merged' | 'closed' | 'any';
  /** Its branch is on your machine. */
  branch: 'anywhere' | 'local';
  /** Waiting on its author: changes requested, checks failing, conversations open. */
  needs: 'anything' | 'work';
}

export const DEFAULT_PULL_FILTER: PullFilter = {
  owner: 'anyone',
  state: 'open',
  branch: 'anywhere',
  needs: 'anything'
};

/** States whose chips are cleanup candidates: the row offers to delete or remove them all. */
export const CLEANUP = {
  branches: ['merged', 'gone', 'stale'] as BranchFilter['state'][],
  worktrees: ['disposable', 'merged', 'clean', 'stale'] as WorktreeFilter['state'][]
};

/** No commit for this long: stale. */
export const STALE = 30 * 86400;

type User = GraphData['user'];

/**
 * Who a branch most likely belongs to: whoever wrote most of its own commits. Unknown (null) for a
 * branch with none: guessing from a single commit would put it in the wrong "mine".
 */
export const owner = (d: BranchDetails | undefined) => d?.authors[0] ?? null;

export const isMine = (d: BranchDetails | undefined, user: User) => {
  const o = owner(d);
  return (
    !!o && !!user && (o.email.toLowerCase() === user.email.toLowerCase() || o.name === user.name)
  );
};

/**
 * The base itself or the local branch it stands for (`main` for `origin/main`): "merged" by
 * definition, and never something to clean up.
 */
export function isBase(r: RefSummary, base: string | undefined) {
  if (!base) return false;
  const { ref } = r;
  return (
    ref.name === base ||
    ref.upstream?.name === base ||
    (ref.kind === 'head' && base.endsWith(`/${ref.name}`))
  );
}

export interface Context {
  details: Record<string, BranchDetails | undefined>;
  /** The repository's pull requests, when GitHub could be asked. */
  pulls: PullRequest[];
  user: User;
  base: string | undefined;
  now: number;
}

/**
 * One branch as the Branches row shows it: the local branch and the remote branch it tracks (or,
 * with no upstream set, the remote one of the same name), or either alone.
 */
export interface BranchRow {
  local?: RefSummary;
  remote?: RefSummary;
}

/** The side a row is named and shown after: the local branch when there is one. */
export const primary = (row: BranchRow) => (row.local ?? row.remote)!;
const latest = (row: BranchRow) => Math.max(row.local?.date ?? 0, row.remote?.date ?? 0);

/** Every branch once, the checked-out one first, then the most recent: local ones with their remote, and remote ones nobody has locally. */
export function branchRows(data: GraphData): BranchRow[] {
  const remotes = new Map(data.remoteHeads.map((r) => [r.ref.name, r]));
  const paired = new Set<string>();
  const rows: BranchRow[] = data.heads.map((local) => {
    const up = local.ref.upstream;
    const name = up
      ? up.name
      : data.remotes.map((r) => `${r}/${local.ref.name}`).find((n) => remotes.has(n));
    const remote = name ? remotes.get(name) : undefined;
    if (remote) paired.add(remote.ref.name);
    return { local, remote };
  });
  for (const remote of data.remoteHeads) if (!paired.has(remote.ref.name)) rows.push({ remote });
  const current = (row: BranchRow) => +(!!row.local && row.local.ref.name === data.currentBranch);
  return rows.sort((a, b) => current(b) - current(a) || latest(b) - latest(a));
}

/** A branch's name on the remote, which is what pull requests know it by. */
export function remoteName(row: BranchRow) {
  if (row.remote?.ref.remote) return row.remote.ref.name.slice(row.remote.ref.remote.length + 1);
  return row.local!.ref.name;
}

/** Pull requests opened from the branch, most recently updated first. */
export const pullsOf = (row: BranchRow, pulls: PullRequest[]) =>
  pulls.filter((p) => p.head === remoteName(row)).sort((a, b) => b.updatedAt - a.updatedAt);

/** The branch a pull request was opened from, when the rows know it (see `pullsOf`). */
export const pullRow = (pr: PullRequest, rows: BranchRow[]) =>
  rows.find((row) => remoteName(row) === pr.head);

/**
 * The pull request of the branch checked out, by name (wherever its commits stand against GitHub's):
 * its most recently updated one.
 */
export const currentPull = (prs: PullRequest[], rows: BranchRow[], branch: string | null) =>
  branch
    ? prs
        .filter((p) => pullRow(p, rows)?.local?.ref.name === branch)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined;

const isOpen = (pr: PullRequest) => pr.state === 'open' || pr.state === 'draft';

/** Open, and its author has something to do: changes asked, checks failing, conversations open. */
export const needsWork = (pr: PullRequest) =>
  isOpen(pr) && (pr.decision === 'changes' || pr.checks === 'failing' || pr.threads.unresolved > 0);

/** `viewer`: the GitHub login they were read with. */
export function pullMatches(pr: PullRequest, f: PullFilter, viewer: string, rows: BranchRow[]) {
  if (f.owner === 'mine' && pr.author !== viewer) return false;
  if (
    f.owner === 'review' &&
    !(isOpen(pr) && pr.reviewers.some((r) => r.login === viewer && r.state === 'requested'))
  )
    return false;
  if (f.state === 'open' ? !isOpen(pr) : f.state !== 'any' && pr.state !== f.state) return false;
  if (f.branch === 'local' && !pullRow(pr, rows)?.local) return false;
  return f.needs !== 'work' || needsWork(pr);
}

/** A merged pull request was opened from exactly this commit: merged, squash merges included. */
const mergedByPull = (hash: string, pulls: PullRequest[]) =>
  pulls.some((p) => p.state === 'merged' && p.headOid === hash);

/** Merged into the base: nothing left whose changes aren't there. Unknown (false) until loaded. */
export const isMerged = (r: RefSummary, ctx: Context) => {
  if (isBase(r, ctx.base)) return false;
  const d = ctx.details[r.ref.name];
  return (!!d && d.unique === 0) || mergedByPull(r.hash, ctx.pulls);
};

/** Has changes the base doesn't (and no merged pull request says otherwise). */
const isUnmerged = (r: RefSummary, ctx: Context) => {
  const d = ctx.details[r.ref.name];
  return !!d && d.unique > 0 && !mergedByPull(r.hash, ctx.pulls);
};

const sides = (row: BranchRow) => [row.local, row.remote].filter((r) => !!r);

export function branchMatches(row: BranchRow, f: BranchFilter, ctx: Context) {
  if (f.scope === 'local' && !row.local) return false;
  if (f.scope === 'remote' && row.local) return false;
  const p = primary(row);
  if (f.owner === 'mine' && !isMine(ctx.details[p.ref.name], ctx.user)) return false;
  switch (f.state) {
    case 'merged':
      // Both copies: a remote with commits pushed after the merge isn't merged
      return sides(row).every((r) => isMerged(r, ctx));
    case 'unmerged':
      return sides(row).some((r) => isUnmerged(r, ctx));
    case 'gone':
      return !!row.local?.ref.upstream?.gone;
    case 'stale':
      return ctx.now - latest(row) > STALE;
  }
  return true;
}

/** The branches the row shows, most recent first. */
export const filterBranches = (data: GraphData, f: BranchFilter, ctx: Context) =>
  branchRows(data).filter((row) => branchMatches(row, f, ctx));

/**
 * What a cleanup may delete: not the base, not a branch checked out here or in a worktree (nor its
 * remote copy: deleting only that would surprise).
 */
export const deletable = (row: BranchRow, data: GraphData, base: string | undefined) =>
  !sides(row).some((r) => isBase(r, base)) &&
  !(row.local && (row.local.ref.worktree || row.local.ref.name === data.currentBranch));

/** Merged into the base: every commit is there (or copied there), or its pull request was merged. */
const worktreeMerged = (w: Worktree, d: WorktreeDetails | undefined, ctx: Context) =>
  !w.main && ((!!d?.compare && d.compare.ahead === 0) || mergedByPull(w.head, ctx.pulls));

/**
 * Nothing to lose: removing it (with its branch) loses no work. Clean, and either detached on a
 * commit another ref keeps (a temporary checkout), or on a branch that's merged. A branch not merged
 * yet is work in progress, however safe its folder is to remove.
 */
export function isDisposable(w: Worktree, d: WorktreeDetails | undefined, ctx: Context) {
  if (w.main || w.current || w.prunable || !d || w.status?.changes !== 0) return false;
  return w.branch ? worktreeMerged(w, d, ctx) : d.kept;
}

export function worktreeMatches(
  w: Worktree,
  f: WorktreeFilter,
  d: WorktreeDetails | undefined,
  ctx: Context
) {
  if (f.owner === 'mine' && !(w.branch && isMine(ctx.details[w.branch], ctx.user))) return false;
  switch (f.state) {
    case 'changes':
      return !!w.status?.changes;
    case 'clean':
      return w.status?.changes === 0;
    case 'merged':
      return worktreeMerged(w, d, ctx);
    case 'disposable':
      return isDisposable(w, d, ctx);
    case 'stale':
      return !!w.headDate && ctx.now - w.headDate > STALE;
  }
  return true;
}

/** What a cleanup may remove: not the main worktree, not the one this graph shows. */
export const removable = (w: Worktree) => !w.main && !w.current && !w.prunable;
