import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UNCOMMITTED, type Side } from '@treeline/shared';
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
  hidden: [],
  base: null,
  focus: [],
  showRemotes: true,
  showTags: true,
  showStashes: true,
  showWorktrees: true,
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

  it('lists branches and tags, most recent first, with their commit', async () => {
    const g = await git.getGraph(query());
    expect(g.heads.map((h) => [h.ref.name, h.subject])).toEqual([
      ['main', 'Main after topic'],
      ['topic', 'Topic commit'],
      ['feature', 'Feature work 2']
    ]);
    const [tag] = g.tags;
    expect(tag).toMatchObject({ ref: { name: 'v1.0', annotated: true }, subject: 'Merge feature' });
    expect(tag.hash).toBe(g.commits.find((c) => c.subject === 'Merge feature')!.hash);
  });

  it('hides branches: their own commits go, what they share stays', async () => {
    const subjects = async (hidden: string[]) =>
      (await git.getGraph(query({ hidden }))).commits.map((c) => c.subject);
    expect(await subjects(['topic'])).not.toContain('Topic commit');
    expect(await subjects(['topic'])).toContain('Merge feature');
    // feature is merged into main: hiding it leaves its commits, main still has them
    expect(await subjects(['feature'])).toContain('Feature work 2');
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

  it('names only the branches picked, remote ones too', async () => {
    const names = async (over: object) =>
      (await git.getGraph(query({ showRemotes: false, ...over }))).commits
        .flatMap((c) => c.refs)
        .filter((r) => r.kind !== 'stash')
        .map((r) => r.name)
        .sort();
    // feature and origin/main point into topic's history: not named, the tag still is
    expect(await names({ branches: ['topic'] })).toEqual(['topic', 'v1.0']);
    expect(await names({ branches: ['topic', 'origin/main'] })).toEqual([
      'origin/main',
      'topic',
      'v1.0'
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
    // Every branch knows where it stands against the base, remote ones included
    expect(g.heads.find((h) => h.ref.name === 'topic')?.vsBase).toEqual({ ahead: 1, behind: 0 });
    expect(g.remoteHeads.map((r) => [r.ref.name, r.vsBase])).toEqual([
      ['origin/main', { ahead: 0, behind: 0 }]
    ]);
    expect(g.commits.filter((c) => c.side).map((c) => [c.subject, c.side])).toEqual([
      ['Main after topic', 'ahead']
    ]);
  });

  it('compares with any branch', async () => {
    const g = await git.getGraph(query({ base: 'topic' }));
    const merge = g.commits.find((c) => c.subject === 'Merge feature')!;
    expect(g.compare).toMatchObject({
      base: 'topic',
      ahead: 1,
      behind: 1,
      same: 0,
      mergeBase: merge.hash,
      mergeBaseDate: merge.date,
      rewritten: false
    });
    expect(g.commits.find((c) => c.subject === 'Topic commit')?.side).toBe('behind');
  });

  it('focus shows only the chosen sides of the divergence and the merge base', async () => {
    const subjects = async (focus: Side[]) =>
      (await git.getGraph(query({ base: 'topic', focus }))).commits.map((c) => c.subject);
    expect(await subjects(['ahead', 'behind'])).toEqual([
      'Uncommitted Changes (2)',
      'On main: wip on main',
      'Main after topic',
      'Topic commit',
      'Merge feature'
    ]);
    expect(await subjects(['behind'])).toEqual(['Topic commit', 'Merge feature']);
    expect(await subjects(['ahead'])).toEqual([
      'Uncommitted Changes (2)',
      'On main: wip on main',
      'Main after topic',
      'Merge feature'
    ]);
  });

  it('recognises commits already on the base under another hash (rebase and merge)', async () => {
    // What GitHub's "rebase and merge" does: same changes and message, new commit
    const run = (...args: string[]) => execFileSync('git', args, { cwd: dir }).toString().trim();
    const copy = run('commit-tree', 'HEAD^{tree}', '-p', 'HEAD^', '-m', 'Main after topic');
    run('branch', 'rebased', copy);
    const g = await git.getGraph(query({ base: 'rebased' }));
    expect(g.compare).toMatchObject({ ahead: 0, behind: 0, same: 1 });
    expect(g.commits.filter((c) => c.side).map((c) => [c.subject, c.side])).toEqual([
      ['Main after topic', 'same'],
      ['Main after topic', 'same']
    ]);
    run('branch', '-D', 'rebased');
  });

  it('flags a rewritten history: most commits are copies of the base', async () => {
    // A repository of its own: a few more commits, then main's history copied commit by commit
    // (same trees and messages, new hashes), as filter-repo or a forced rebase would
    const { dir: other, git: sh } = createFixtureRepo();
    for (const n of [1, 2, 3]) sh('commit', '-q', '--allow-empty', '-m', `More work ${n}`);
    let copy = '';
    for (const hash of sh('rev-list', '--first-parent', '--reverse', 'HEAD').trim().split('\n')) {
      const message = sh('log', '-1', '--format=%B', hash).trim();
      copy = sh(
        'commit-tree',
        `${hash}^{tree}`,
        ...(copy ? ['-p', copy] : []),
        '-m',
        message
      ).trim();
    }
    sh('branch', 'rewritten', copy);
    const g = await git.getGraph(query({ repo: other, base: 'rewritten' }));
    expect(g.compare).toMatchObject({ mergeBase: null, rewritten: true });
    expect(g.compare!.same).toBeGreaterThan(g.compare!.ahead);
  });

  it('ignores a base that does not exist', async () => {
    const g = await git.getGraph(query({ base: 'gone', focus: ['ahead'] }));
    expect(g.compare).toBeNull();
    expect(g.commits).toHaveLength(10);
  });
});

describe('worktrees', () => {
  it('lists the main worktree with its status', async () => {
    const [main] = await git.getWorktrees(dir);
    expect(main).toMatchObject({ branch: 'main', main: true, current: true, prunable: false });
    expect(main.headSubject).toBe('Main after topic');
    expect(main.headDate).toBe(1_700_000_000 + 8 * 60);
    expect(main.status).toEqual({ changes: 2, ahead: 0, behind: 0, upstream: null });
  });

  it('lists a linked worktree and marks its branch in the graph', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'treeline-wt-')), 'topic');
    execFileSync('git', ['worktree', 'add', '-q', path, 'topic'], { cwd: dir });
    execFileSync('git', ['branch', '-q', '-u', 'origin/main'], { cwd: path });
    writeFileSync(join(path, 'wip.txt'), 'wip\n');
    // A new folder counts its files, as the file list shows them
    mkdirSync(join(path, 'new'));
    writeFileSync(join(path, 'new', 'one.txt'), '1\n');
    writeFileSync(join(path, 'new', 'two.txt'), '2\n');

    const [, linked] = await git.getWorktrees(dir);
    expect(linked).toMatchObject({ branch: 'topic', main: false, current: false });
    expect(linked.status).toEqual({ changes: 3, ahead: 1, behind: 0, upstream: 'origin/main' });

    const g = await git.getGraph(query());
    const refs = g.commits.flatMap((c) => c.refs);
    expect(refs.find((r) => r.name === 'topic')?.worktree).toBe(linked.path);
    expect(g.heads.find((h) => h.ref.name === 'topic')?.ref.upstream).toEqual({
      name: 'origin/main',
      ahead: 1,
      behind: 0,
      gone: false
    });
    expect(refs.find((r) => r.name === 'main')?.worktree).toBeUndefined();
    // Seen from the linked worktree, it is the current one and main is elsewhere
    const fromLinked = await git.getWorktrees(path);
    expect(fromLinked.map((w) => w.current)).toEqual([false, true]);

    // Its card: compared with a base, and what it hasn't committed
    const details = await git.worktreeDetails(linked.path, 'main');
    expect(details.compare).toMatchObject({ base: 'main', ahead: 1, behind: 1, rewritten: false });
    expect(details.files.map((f) => `${f.status} ${f.path}`)).toEqual([
      'U new/one.txt',
      'U new/two.txt',
      'U wip.txt'
    ]);

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

describe('getGraph without tags', () => {
  it('leaves tag badges out', async () => {
    const g = await git.getGraph(query({ showTags: false }));
    expect(g.commits.some((c) => c.refs.some((r) => r.kind === 'tag'))).toBe(false);
    // The Tags row still has them
    expect(g.tags.map((t) => t.ref.name)).toContain('v1.0');
  });

  it('leaves stash rows out', async () => {
    const g = await git.getGraph(query({ showStashes: false }));
    expect(g.commits.some((c) => c.stashBase)).toBe(false);
  });
});

describe('getGraph with stale filters', () => {
  it('ignores shown branches that were deleted since', async () => {
    const g = await git.getGraph(query({ branches: ['topic', 'deleted-meanwhile'] }));
    expect(g.commits.some((c) => c.subject === 'Topic commit')).toBe(true);
    // Only deleted ones: everything, rather than an error
    const all = await git.getGraph(query({ branches: ['deleted-meanwhile'] }));
    expect(all.commits.length).toBe((await git.getGraph(query())).commits.length);
  });
});

describe('branchDetails', () => {
  const ada = { name: 'Ada', email: 'ada@example.com' };

  it('finds who a branch belongs to and whether it is merged', async () => {
    // The identity commits are made with, for the "mine" filters
    expect((await git.getGraph(query())).user).toEqual(ada);
    expect(await git.branchDetails(dir, 'refs/heads/topic', 'origin/main')).toEqual({
      authors: [{ ...ada, commits: 1 }],
      unique: 1
    });
    // Merged with a merge commit: its commits are the ones that merge brought in
    const merge = execFileSync('git', ['rev-parse', ':/Merge feature'], { cwd: dir })
      .toString()
      .trim();
    expect(await git.branchDetails(dir, 'refs/heads/feature', 'origin/main')).toEqual({
      authors: [{ ...ada, commits: 2 }],
      mergedBy: merge,
      unique: 0
    });
  });

  it('counts commits copied onto the base (cherry-pick, rebase and merge) as merged', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'treeline-copied-'));
    const sh = (author: string, ...args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: author,
          GIT_AUTHOR_EMAIL: `${author.toLowerCase()}@example.com`,
          GIT_COMMITTER_NAME: author,
          GIT_COMMITTER_EMAIL: `${author.toLowerCase()}@example.com`
        }
      }).toString();
    sh('Ada', 'init', '-q', '-b', 'main');
    sh('Ada', 'commit', '-q', '--allow-empty', '-m', 'Start');
    sh('Ada', 'checkout', '-q', '-b', 'side');
    for (const [author, file] of [
      ['Bob', 'x'],
      ['Bob', 'y'],
      ['Cy', 'z']
    ]) {
      writeFileSync(join(repo, file), `${file}\n`);
      sh(author, 'add', file);
      sh(author, 'commit', '-q', '-m', `Add ${file}`);
    }
    sh('Ada', 'checkout', '-q', 'main');
    sh('Ada', 'cherry-pick', 'side~2', 'side~1');
    const d = await git.branchDetails(repo, 'refs/heads/side', 'main');
    expect(d.authors.map((a) => [a.name, a.commits])).toEqual([
      ['Bob', 2],
      ['Cy', 1]
    ]);
    expect(d.unique).toBe(1);
    sh('Ada', 'cherry-pick', 'side');
    expect((await git.branchDetails(repo, 'refs/heads/side', 'main')).unique).toBe(0);
    // A branch sitting on the base's own history has no commits of its own: nobody's
    sh('Ada', 'branch', 'old', 'main~1');
    expect(await git.branchDetails(repo, 'refs/heads/old', 'main')).toEqual({
      authors: [],
      unique: 0
    });
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('worktreeDetails', () => {
  it("tells whether a worktree's commit is kept on another ref", async () => {
    const { dir: repo, git: sh } = createFixtureRepo();
    // Detached on a commit main contains: removing it loses nothing
    sh('worktree', 'add', '-q', '--detach', `${repo}-old`, 'main~1');
    expect((await git.worktreeDetails(`${repo}-old`, 'main')).kept).toBe(true);
    // On a branch only it has: its own branch doesn't count
    sh('worktree', 'add', '-q', '-b', 'solo', `${repo}-solo`, 'main');
    writeFileSync(join(`${repo}-solo`, 'solo.txt'), 'x\n');
    sh('-C', `${repo}-solo`, 'add', 'solo.txt');
    sh('-C', `${repo}-solo`, 'commit', '-q', '-m', 'Solo work');
    expect((await git.worktreeDetails(`${repo}-solo`, 'main')).kept).toBe(false);
    for (const wt of ['old', 'solo']) rmSync(`${repo}-${wt}`, { recursive: true, force: true });
  });
});

describe('commonDir', () => {
  it('is the same for a repository and its worktrees', async () => {
    const { dir: repo, git: sh } = createFixtureRepo();
    const wt = `${repo}-wt`;
    sh('worktree', 'add', '-q', wt, 'topic');
    const main = await git.commonDir(repo);
    expect(main).toMatch(/\.git$/);
    expect(await git.commonDir(wt)).toBe(main);
    expect(await git.commonDir(join(repo, '..'))).toBeNull();
    rmSync(wt, { recursive: true, force: true });
  });
});

describe('locate', () => {
  it('finds a commit under the filters, or says why it is not there', async () => {
    const all = await git.getGraph(query());
    const topic = all.commits.find((c) => c.subject === 'Topic commit')!;
    // Its row among the commits git log walks (the uncommitted and stash rows aside)
    const at = await git.locate(query(), topic.hash);
    const logRows = all.commits.filter((c) => c.hash !== '*' && !c.stashBase);
    expect(at).toEqual({ at: logRows.findIndex((c) => c.hash === topic.hash) });
    // Only main shown: hidden by that filter
    expect(await git.locate(query({ branches: ['main'] }), topic.hash)).toEqual({ hidden: true });
    // Another author: hidden too
    expect(await git.locate(query({ authors: ['Nobody'] }), topic.hash)).toEqual({ hidden: true });
  });
});

describe('detached worktrees in the graph', () => {
  it("shows a detached worktree's own commits, which no branch reaches", async () => {
    const { dir: repo, git: sh } = createFixtureRepo();
    const wt = `${repo}-loose`;
    sh('worktree', 'add', '-q', '--detach', wt, 'main');
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'Loose work'], { cwd: wt });
    const g = await git.getGraph({ ...query(), repo });
    const loose = g.commits.find((c) => c.subject === 'Loose work');
    expect(loose).toBeDefined();
    expect(await git.locate({ ...query(), repo }, loose!.hash)).toHaveProperty('at');
    rmSync(wt, { recursive: true, force: true });
  });
});

describe("other worktrees' uncommitted changes", () => {
  it('get a row right above the commit their worktree is on', async () => {
    const { dir: repo, git: sh } = createFixtureRepo();
    const wt = `${repo}-busy`;
    sh('worktree', 'add', '-q', wt, 'topic');
    writeFileSync(join(wt, 'draft.txt'), 'x\n');
    const g = await git.getGraph({ ...query(), repo });
    const i = g.commits.findIndex((c) => c.worktree);
    expect(g.commits[i]).toMatchObject({
      subject: 'Uncommitted Changes (1)',
      // The temp dir may sit behind a symlink: git reports the real path
      worktree: expect.stringMatching(/-busy$/),
      parents: [g.commits[i + 1].hash]
    });
    expect(g.commits[i + 1].subject).toBe('Topic commit');
    // Left out with worktrees off (Include menu)
    const off = await git.getGraph({ ...query(), repo, showWorktrees: false });
    expect(off.commits.some((c) => c.worktree)).toBe(false);
    rmSync(wt, { recursive: true, force: true });
  });
});
