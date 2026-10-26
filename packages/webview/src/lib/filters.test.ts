import type { BranchDetails, GraphData, PullRequest, RefSummary, Worktree } from '@treeline/shared';
import { describe, expect, it } from 'vitest';
import {
  branchRows,
  DEFAULT_BRANCH_FILTER,
  DEFAULT_WORKTREE_FILTER,
  deletable,
  filterBranches,
  isBase,
  isMine,
  owner,
  primary,
  pullsOf,
  removable,
  worktreeMatches,
  type Context
} from './filters';

const NOW = 2_000_000_000;
const DAY = 86400;
const head = (name: string, days = 1, extra = {}): RefSummary => ({
  ref: { kind: 'head', name, ...extra },
  hash: name,
  date: NOW - days * DAY,
  subject: ''
});
const remote = (name: string, days = 1): RefSummary => ({
  ref: { kind: 'remote', name, remote: 'origin' },
  hash: name,
  date: NOW - days * DAY,
  subject: ''
});
const by = (name: string, commits: number, unique = commits): BranchDetails => ({
  authors: commits ? [{ name, email: `${name.toLowerCase()}@x.com`, commits }] : [],
  unique
});

const up = (name: string, gone = false) => ({ upstream: { name, ahead: 0, behind: 0, gone } });
const main = head('main', 0, up('origin/main'));
const mine = head('mine', 2, up('origin/mine'));
const theirs = head('theirs', 60);
const merged = head('merged', 5);
const gone = head('gone', 3, up('origin/gone', true));
const data = {
  heads: [main, mine, gone, merged, theirs],
  // origin/merged: no upstream set, paired by name; origin/team: nobody has it locally
  remoteHeads: [
    remote('origin/main', 0),
    remote('origin/mine', 2),
    remote('origin/team', 4),
    remote('origin/merged', 5)
  ],
  remotes: ['origin'],
  currentBranch: 'mine'
} as GraphData;
const pr = (head: string, state: PullRequest['state'], headOid: string) =>
  ({ number: 1, head, headOid, state, updatedAt: NOW }) as PullRequest;
const ctx: Context = {
  details: {
    main: by('Ada', 0),
    mine: by('Ada', 3),
    'origin/mine': by('Ada', 3),
    theirs: by('Bob', 2),
    merged: by('Ada', 2, 0),
    'origin/merged': by('Ada', 2, 0),
    'origin/team': by('Bob', 1)
  },
  // theirs was squash merged: git can't tell, its pull request can
  pulls: [pr('theirs', 'merged', 'theirs'), pr('mine', 'open', 'mine')],
  user: { name: 'Ada', email: 'ADA@x.com' },
  base: 'origin/main',
  now: NOW
};
const names = (f = {}) =>
  filterBranches(data, { ...DEFAULT_BRANCH_FILTER, ...f }, ctx).map((r) => primary(r).ref.name);

describe('branch filters', () => {
  it('shows a local branch and its remote copy as one, most recent first', () => {
    const rows = branchRows(data);
    expect(rows.map((r) => [r.local?.ref.name, r.remote?.ref.name])).toEqual([
      ['main', 'origin/main'],
      ['mine', 'origin/mine'],
      ['gone', undefined],
      [undefined, 'origin/team'],
      ['merged', 'origin/merged'],
      ['theirs', undefined]
    ]);
    expect(names()).toEqual(['main', 'mine', 'gone', 'merged', 'theirs']);
    expect(names({ scope: 'remote' })).toEqual(['origin/team']);
    expect(names({ scope: 'all' })).toHaveLength(6);
  });

  it('knows whose a branch is and where it stands', () => {
    expect(owner(ctx.details.theirs)?.name).toBe('Bob');
    expect(isMine(ctx.details.mine, ctx.user)).toBe(true);
    expect(names({ owner: 'mine' })).toEqual(['mine', 'merged']);
    // No commits of its own (main here): nobody's, never guessed from one commit
    expect(owner(ctx.details.main)).toBeNull();
    // The base's own branch is never "merged"; a merged pull request says so where git can't
    expect(names({ state: 'merged' })).toEqual(['merged', 'theirs']);
    expect(names({ state: 'unmerged' })).toEqual(['mine']);
    expect(names({ state: 'gone' })).toEqual(['gone']);
    expect(names({ state: 'stale' })).toEqual(['theirs']);
    // Not loaded yet: unknown, so left out
    expect(names({ owner: 'mine', state: 'merged', scope: 'remote' })).toEqual([]);
  });

  it('finds the pull requests opened from a branch', () => {
    const row = branchRows(data).find((r) => r.local?.ref.name === 'mine')!;
    expect(pullsOf(row, ctx.pulls).map((p) => p.head)).toEqual(['mine']);
  });

  it('never cleans up the base or a checked-out branch', () => {
    expect(isBase(main, 'origin/main')).toBe(true);
    expect(isBase(data.remoteHeads[0], 'origin/main')).toBe(true);
    expect(
      branchRows(data)
        .filter((r) => deletable(r, data, 'origin/main'))
        .map((r) => primary(r).ref.name)
    ).toEqual(['gone', 'origin/team', 'merged', 'theirs']);
    expect(
      deletable({ local: head('busy', 1, { worktree: '/tmp/busy' }) }, data, 'origin/main')
    ).toBe(false);
  });
});

describe('worktree filters', () => {
  const wt = (over: Partial<Worktree>): Worktree => ({
    path: '/w',
    branch: 'mine',
    head: 'h',
    headDate: NOW - DAY,
    headSubject: '',
    main: false,
    current: false,
    locked: false,
    prunable: false,
    status: { changes: 0, ahead: 0, behind: 0, upstream: null },
    ...over
  });
  const compare = (ahead: number) => ({
    base: 'origin/main',
    baseHash: 'b',
    ahead,
    behind: 0,
    same: 0,
    mergeBase: null,
    mergeBaseDate: null,
    rewritten: false
  });
  const matches = (w: Worktree, f = {}, ahead = 1, kept = false) =>
    worktreeMatches(
      w,
      { ...DEFAULT_WORKTREE_FILTER, ...f },
      { compare: compare(ahead), files: [], kept },
      ctx
    );

  it('tells work in progress, clean, merged and stale worktrees apart', () => {
    const dirty = wt({ status: { changes: 2, ahead: 0, behind: 0, upstream: null } });
    expect(matches(dirty, { state: 'changes' })).toBe(true);
    expect(matches(dirty, { state: 'clean' })).toBe(false);
    expect(matches(wt({}), { state: 'merged' }, 0)).toBe(true);
    expect(matches(wt({}), { state: 'merged' }, 1)).toBe(false);
    expect(matches(wt({ main: true }), { state: 'merged' }, 0)).toBe(false);
    expect(matches(wt({ headDate: NOW - 40 * DAY }), { state: 'stale' })).toBe(true);
    expect(matches(wt({ branch: 'theirs' }), { owner: 'mine' })).toBe(false);
    expect(matches(wt({}), { owner: 'mine' })).toBe(true);
  });

  it('knows which ones have nothing to lose', () => {
    const detached = wt({ branch: null });
    expect(matches(detached, { state: 'disposable' }, 5, true)).toBe(true);
    expect(matches(detached, { state: 'disposable' }, 5, false)).toBe(false);
    // A branch: only once merged; never with uncommitted changes
    expect(matches(wt({}), { state: 'disposable' }, 1, true)).toBe(false);
    expect(matches(wt({}), { state: 'disposable' }, 0, true)).toBe(true);
    const dirty = wt({ status: { changes: 1, ahead: 0, behind: 0, upstream: null } });
    expect(matches(dirty, { state: 'disposable' }, 0, true)).toBe(false);
  });

  it('never removes the main worktree or the one in this graph', () => {
    expect(removable(wt({}))).toBe(true);
    expect(removable(wt({ main: true }))).toBe(false);
    expect(removable(wt({ current: true }))).toBe(false);
  });
});
