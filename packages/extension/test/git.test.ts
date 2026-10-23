import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UNCOMMITTED } from '@treeline/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { Git } from '../src/git';
import { createFixtureRepo } from './fixture';

const git = new Git();
let dir: string;

beforeAll(() => {
  dir = createFixtureRepo().dir;
});

const query = (over = {}) => ({
  repo: dir,
  branches: [],
  authors: [],
  base: null,
  focus: false,
  showRemotes: true,
  maxCommits: 100,
  ...over
});

describe('getGraph', () => {
  it('lists every row type in order', async () => {
    const g = await git.getGraph(query());
    expect(g.commits.map((c) => c.subject)).toEqual([
      'Uncommitted Changes (2)',
      'On main: wip on main',
      'Main after topic',
      'Topic commit',
      'Merge feature',
      'Main moves on',
      'Feature work 2',
      'Feature work 1',
      'Add b',
      'Initial commit'
    ]);
    expect(g.currentBranch).toBe('main');
    expect(g.hasMore).toBe(false);
    expect(g.remotes).toEqual(['origin']);
    expect(g.branches.sort()).toEqual(['feature', 'main', 'origin/main', 'topic']);
  });

  it('annotates refs', async () => {
    const g = await git.getGraph(query());
    const merge = g.commits.find((c) => c.subject === 'Merge feature')!;
    expect(merge.parents).toHaveLength(2);
    expect(merge.refs).toContainEqual({ kind: 'tag', name: 'v1.0', annotated: true });
    expect(merge.refs).toContainEqual({ kind: 'remote', name: 'origin/main', remote: 'origin' });
    const stash = g.commits[1];
    expect(stash.refs).toEqual([{ kind: 'stash', name: 'stash@{0}' }]);
    expect(stash.parents).toEqual([g.head]);
  });

  it('paginates and hides remotes', async () => {
    const g = await git.getGraph(query({ maxCommits: 3, showRemotes: false }));
    expect(g.hasMore).toBe(true);
    expect(g.branches).not.toContain('origin/main');
    expect(g.commits.flatMap((c) => c.refs).some((r) => r.kind === 'remote')).toBe(false);
  });

  it('filters by branch', async () => {
    const g = await git.getGraph(query({ branches: ['feature'] }));
    expect(g.commits.map((c) => c.subject)).toEqual([
      'Feature work 2',
      'Feature work 1',
      'Add b',
      'Initial commit'
    ]);
  });
});

describe('details', () => {
  it('commit files with counts', async () => {
    const g = await git.getGraph(query());
    const c = g.commits.find((c) => c.subject === 'Topic commit')!;
    const d = await git.getDetails(dir, c);
    expect(d.author).toBe('Ada');
    expect(d.body).toBe('Topic commit');
    expect(d.files).toEqual([
      { status: 'A', oldPath: 'd.txt', path: 'd.txt', additions: 1, deletions: 0 }
    ]);
  });

  it('root commit', async () => {
    const g = await git.getGraph(query());
    const d = await git.getDetails(dir, g.commits.at(-1)!);
    expect(d.files.map((f) => f.path)).toEqual(['a.txt']);
  });

  it('uncommitted changes include untracked files', async () => {
    const g = await git.getGraph(query());
    const d = await git.getDetails(dir, g.commits[0]);
    expect(d.hash).toBe(UNCOMMITTED);
    expect(d.files.map((f) => `${f.status} ${f.path}`)).toEqual(['M b.txt', 'U new.txt']);
  });

  it('stash', async () => {
    const g = await git.getGraph(query());
    const d = await git.getDetails(dir, g.commits[1]);
    expect(d.files.map((f) => `${f.status} ${f.path}`)).toEqual(['M a.txt']);
  });

  it('compare', async () => {
    const g = await git.getGraph(query());
    const files = await git.compare(dir, g.commits.at(-1)!.hash, g.head!);
    expect(files.map((f) => f.path).sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('file at revision', async () => {
    const g = await git.getGraph(query());
    expect(await git.showFile(dir, g.commits.at(-1)!.hash, 'a.txt')).toBe('Initial commit\n');
  });
});

describe('compare with a base branch', () => {
  it('defaults to origin/main and marks diverging commits', async () => {
    const g = await git.getGraph(query());
    expect(g.compare).toMatchObject({ base: 'origin/main', ahead: 1, behind: 0 });
    expect(g.commits.filter((c) => c.side).map((c) => [c.subject, c.side])).toEqual([
      ['Main after topic', 'ahead']
    ]);
  });

  it('compares with any branch', async () => {
    const g = await git.getGraph(query({ base: 'topic' }));
    const merge = g.commits.find((c) => c.subject === 'Merge feature')!;
    expect(g.compare).toEqual({ base: 'topic', ahead: 1, behind: 1, mergeBase: merge.hash });
    expect(g.commits.find((c) => c.subject === 'Topic commit')?.side).toBe('behind');
  });

  it('focus shows only the divergence and the merge base', async () => {
    const g = await git.getGraph(query({ base: 'topic', focus: true }));
    expect(g.commits.map((c) => c.subject)).toEqual([
      'Uncommitted Changes (2)',
      'On main: wip on main',
      'Main after topic',
      'Topic commit',
      'Merge feature'
    ]);
  });

  it('ignores a base that does not exist', async () => {
    const g = await git.getGraph(query({ base: 'gone', focus: true }));
    expect(g.compare).toBeNull();
    expect(g.commits).toHaveLength(10);
  });
});

describe('worktrees', () => {
  it('lists the main worktree with its status', async () => {
    const [main] = await git.getWorktrees(dir);
    expect(main).toMatchObject({ branch: 'main', main: true, current: true, prunable: false });
    expect(main.status).toEqual({ changes: 2, ahead: 0, behind: 0, upstream: null });
  });

  it('lists a linked worktree and marks its branch in the graph', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'treeline-wt-')), 'topic');
    execFileSync('git', ['worktree', 'add', '-q', path, 'topic'], { cwd: dir });
    execFileSync('git', ['branch', '-q', '-u', 'origin/main'], { cwd: path });
    writeFileSync(join(path, 'wip.txt'), 'wip\n');

    const [, linked] = await git.getWorktrees(dir);
    expect(linked).toMatchObject({ branch: 'topic', main: false, current: false });
    expect(linked.status).toEqual({ changes: 1, ahead: 1, behind: 0, upstream: 'origin/main' });

    const g = await git.getGraph(query());
    const refs = g.commits.flatMap((c) => c.refs);
    expect(refs.find((r) => r.name === 'topic')?.worktree).toBe(linked.path);
    expect(refs.find((r) => r.name === 'main')?.worktree).toBeUndefined();
    // Seen from the linked worktree, it is the current one and main is elsewhere
    const fromLinked = await git.getWorktrees(path);
    expect(fromLinked.map((w) => w.current)).toEqual([false, true]);

    rmSync(path, { recursive: true });
    const [, gone] = await git.getWorktrees(dir);
    expect(gone).toMatchObject({ prunable: true, status: null });
    execFileSync('git', ['worktree', 'prune'], { cwd: dir });
    expect(await git.getWorktrees(dir)).toHaveLength(1);
  });
});

describe('author filter', () => {
  it('matches exact author names, ORed', async () => {
    const commit = (author: string, msg: string) =>
      execFileSync('git', ['commit', '-q', '--allow-empty', '-m', msg, `--author=${author}`], {
        cwd: dir
      });
    commit('B.o.b (bot) <bob@example.com>', 'Bot commit');
    commit('Adam <adam@example.com>', 'Adam commit');
    const subjects = async (authors: string[]) =>
      (await git.getGraph(query({ authors }))).commits
        .filter((c) => c.hash !== UNCOMMITTED && !c.stashBase)
        .map((c) => c.subject);

    expect(await subjects(['B.o.b (bot)'])).toEqual(['Bot commit']);
    expect(await subjects(['Adam', 'B.o.b (bot)'])).toEqual(['Adam commit', 'Bot commit']);
    expect(await subjects(['Ada'])).not.toContain('Adam commit');
    expect(await subjects(['Ada'])).toHaveLength(8);
    expect(await subjects(['Bob'])).toEqual([]);
  });
});
