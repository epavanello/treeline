/**
 * Every `Action` run through the real `runAction` inside VS Code, with the
 * native prompts answered from a script, then checked against the repo.
 */
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import type { Action } from '@treeline/shared';
import { runAction } from '../src/actions';
import { Git } from '../src/git';
import { createFixtureRepo } from '../test/fixture';

/**
 * Answers, in order: input box → string | undefined (true = accept the default),
 * quick pick → label(s), modal → boolean (true = its first button) or the button's label.
 */
type Answer = string | string[] | boolean | undefined;

const window = vscode.window as unknown as Record<string, unknown>;
const stubbed = [
  'showInputBox',
  'showQuickPick',
  'showWarningMessage',
  'showErrorMessage',
  'showInformationMessage'
];
const originals = Object.fromEntries(stubbed.map((k) => [k, window[k]]));
let answers: Answer[] = [];
let errors: string[] = [];
let infos: string[] = [];

const next = () => {
  assert.ok(answers.length, 'unexpected prompt');
  return answers.shift();
};

let dir: string;
let sh: (...args: string[]) => string;
const git = new Git();
const rev = (r: string) => sh('rev-parse', r);
const subject = (r = 'HEAD') => sh('log', '-1', '--format=%s', r);
const status = () => sh('status', '--porcelain');
const branch = () => sh('branch', '--show-current');
const stashes = () => sh('stash', 'list').split('\n').filter(Boolean);
const remoteRefs = () => sh('ls-remote', 'origin');

async function run(action: Action, script: Answer[]) {
  answers = script;
  errors = [];
  await runAction(git, dir, action);
  assert.deepEqual(answers, [], 'unused answers');
  return errors;
}
const act = async (action: Action, ...script: Answer[]) =>
  assert.deepEqual(await run(action, script), []);

describe('actions', () => {
  before(() => {
    const fixture = createFixtureRepo();
    dir = fixture.dir;
    sh = (...args) => fixture.git(...args).trim();
    const remote = mkdtempSync(join(tmpdir(), 'treeline-remote-'));
    execFileSync('git', ['init', '-q', '--bare', remote]);
    sh('remote', 'set-url', 'origin', remote);
    sh('push', '-q', 'origin', 'main');

    window.showInputBox = async (opts?: vscode.InputBoxOptions) => {
      const a = next();
      return a === true ? opts?.value : a;
    };
    window.showQuickPick = async (
      items: vscode.QuickPickItem[],
      opts?: vscode.QuickPickOptions
    ) => {
      const a = next();
      return opts?.canPickMany
        ? items.filter((i) => (a as string[]).includes(i.label))
        : items.find((i) => i.label === a);
    };
    window.showWarningMessage = async (_: string, __: unknown, ...buttons: string[]) => {
      const a = next();
      return typeof a === 'string' ? a : a ? buttons[0] : undefined;
    };
    window.showErrorMessage = async (message: string) => void errors.push(message);
    window.showInformationMessage = async (message: string) => void infos.push(message);
    assert.equal(vscode.window.showErrorMessage, window.showErrorMessage, 'prompts not stubbed');
  });

  after(() => Object.assign(window, originals));

  it('runs nothing when a prompt is dismissed', async () => {
    const head = rev('HEAD');
    await act({ type: 'createBranch', hash: head }, undefined);
    await act({ type: 'reset', hash: rev('HEAD~1') }, undefined);
    assert.equal(rev('HEAD'), head);
  });

  it('stashes and handles uncommitted changes', async () => {
    await act({ type: 'stashPush' }, '');
    assert.equal(status(), '');
    assert.equal(stashes().length, 2);

    await act({ type: 'stashApply', selector: 'stash@{0}' });
    assert.equal(status(), 'M b.txt\n?? new.txt');
    sh('add', 'b.txt');
    await act({ type: 'unstageAll' });
    assert.equal(status(), 'M b.txt\n?? new.txt');
    await act({ type: 'discardAll' }, true);
    assert.equal(status(), '');

    await act({ type: 'stashPop', selector: 'stash@{0}' });
    assert.equal(stashes().length, 1);
    await act({ type: 'stashPush' }, 'second');
    assert.match(stashes()[0], /second/);
    assert.equal(status(), '');

    await act({ type: 'stashDrop', selector: 'stash@{0}' }, false);
    await act({ type: 'stashDrop', selector: 'stash@{0}' }, true);
    assert.match(stashes().join(), /^stash@\{0\}: On main: wip on main$/);

    await act({ type: 'stashBranch', selector: 'stash@{0}' }, 'from-stash');
    assert.equal(branch(), 'from-stash');
    assert.equal(stashes().length, 0);
    assert.equal(status(), 'M a.txt');
    await act({ type: 'discardAll' }, true);
    await act({ type: 'checkoutBranch', name: 'main' });
    assert.equal(branch(), 'main');
  });

  it('manages branches, asking only before losing commits', async () => {
    const base = rev('HEAD~1');
    await act({ type: 'createBranch', hash: base }, 'b1');
    assert.equal(branch(), 'b1');
    assert.equal(rev('b1'), base);
    await act({ type: 'checkoutBranch', name: 'main' });
    await act({ type: 'renameBranch', name: 'b1' }, 'b1-renamed');
    await act({ type: 'deleteBranch', name: 'b1-renamed' }); // its commits are on main
    assert.equal(sh('branch', '--list', 'b1*'), '');

    sh('checkout', '-q', '-b', 'solo');
    sh('commit', '-q', '--allow-empty', '-m', 'Solo work');
    sh('checkout', '-q', 'main');
    await act({ type: 'deleteBranch', name: 'solo' }, false);
    assert.ok(rev('solo'));
    await act({ type: 'deleteBranch', name: 'solo' }, true);
    assert.equal(sh('branch', '--list', 'solo'), '');

    await act({ type: 'checkoutCommit', hash: base });
    assert.equal(branch(), '');
    await act({ type: 'checkoutBranch', name: 'main' });
  });

  it('reports git failures', async () => {
    const errs = await run({ type: 'checkoutBranch', name: 'nope' }, []);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /^git checkout failed: /);
  });

  it('merges, rebases and resets', async () => {
    const start = rev('HEAD');
    await act({ type: 'merge', target: 'topic' });
    assert.equal(sh('rev-list', '--parents', '-n1', 'HEAD').split(' ').length, 3);
    await act({ type: 'reset', hash: start }, 'Hard'); // clean tree: nothing to confirm
    assert.equal(rev('HEAD'), start);

    writeFileSync(join(dir, 'a.txt'), 'scratch\n');
    await act({ type: 'reset', hash: start }, 'Hard', true);
    assert.equal(status(), '');

    await act({ type: 'checkoutBranch', name: 'topic' });
    await act({ type: 'rebase', target: 'main' });
    sh('merge-base', '--is-ancestor', 'main', 'topic');
    await act({ type: 'checkoutBranch', name: 'main' });

    await act({ type: 'reset', hash: rev('HEAD~1') }, 'Soft');
    assert.equal(status(), 'M  a.txt');
    await act({ type: 'reset', hash: start }, 'Mixed');
    assert.equal(rev('HEAD'), start);
    assert.equal(status(), '');
  });

  it('cherry-picks and reverts', async () => {
    const topic = rev('topic');
    await act({ type: 'cherryPick', hash: topic, parents: 1 });
    assert.equal(subject(), 'Topic commit');
    await act({ type: 'revert', hash: rev('HEAD'), parents: 1 });
    assert.equal(subject(), 'Revert "Topic commit"');
    const merge = sh('log', '--merges', '-1', '--format=%H');
    await act({ type: 'revert', hash: merge, parents: 2 });
    assert.equal(subject(), 'Revert "Merge feature"');
    assert.equal(existsSync(join(dir, 'c.txt')), false);
  });

  it('tags', async () => {
    await act({ type: 'addTag', hash: rev('HEAD') }, 'light');
    assert.equal(sh('cat-file', '-t', 'light'), 'commit');
    await act({ type: 'deleteTag', name: 'light' });
    assert.equal(sh('tag', '--list', 'light'), '');
    await act({ type: 'addTag', hash: rev('HEAD') }, 'release');
    await act({ type: 'pushTag', name: 'release' });
    assert.match(remoteRefs(), /refs\/tags\/release/);

    // With a semver tag around, the next versions are suggested; any other name can be typed
    sh('tag', 'v1.2.3', 'HEAD~1');
    await act({ type: 'addTag', hash: rev('HEAD') }, 'v1.3.0');
    assert.equal(rev('v1.3.0^{commit}'), rev('HEAD'));
    assert.match(infos.at(-1)!, /as v1\.3\.0/);
    await act({ type: 'addTag', hash: rev('HEAD') }, '$(edit) Other name…', 'custom');
    assert.equal(sh('tag', '--list', 'custom'), 'custom');
  });

  it('pushes, pulls and fetches', async () => {
    await act({ type: 'pushBranch', name: 'main' });
    assert.equal(rev('main@{upstream}'), rev('main'));

    sh('branch', 'pushed');
    await act({ type: 'pushBranch', name: 'pushed' });
    assert.match(remoteRefs(), /refs\/heads\/pushed/);
    await act({ type: 'deleteRemoteBranch', name: 'origin/pushed', remote: 'origin' }, true);
    assert.doesNotMatch(remoteRefs(), /refs\/heads\/pushed/);

    sh('push', '-q', 'origin', 'main:remote-only');
    await act({ type: 'fetch' });
    await act({ type: 'checkoutBranch', name: 'origin/remote-only', remote: 'origin' });
    assert.equal(branch(), 'remote-only');
    assert.equal(sh('rev-parse', '--abbrev-ref', 'remote-only@{upstream}'), 'origin/remote-only');
    await act({ type: 'checkoutBranch', name: 'origin/main', remote: 'origin' });
    assert.equal(branch(), 'main'); // the existing local branch

    sh('checkout', '-q', 'remote-only');
    writeFileSync(join(dir, 'e.txt'), 'upstream\n');
    sh('add', 'e.txt');
    sh('commit', '-q', '-m', 'Upstream change');
    sh('push', '-q', 'origin', 'remote-only:main');
    sh('checkout', '-q', 'main');
    await act({ type: 'pullBranch', name: 'origin/main', remote: 'origin' });
    assert.equal(subject('main'), 'Upstream change');

    sh('commit', '-q', '--amend', '-m', 'Amended');
    await act({ type: 'pushBranch', name: 'main', force: true }, false);
    assert.notEqual(rev('origin/main'), rev('main'));
    await act({ type: 'pushBranch', name: 'main', force: true }, true);
    assert.equal(rev('origin/main'), rev('main'));

    // Pull: a branch that isn't checked out is fast-forwarded, the current one is pulled
    sh('branch', '-q', '--track', 'follower', 'origin/main');
    sh('checkout', '-q', '-b', 'mover', 'origin/main');
    writeFileSync(join(dir, 'f.txt'), 'moved\n');
    sh('add', 'f.txt');
    sh('commit', '-q', '-m', 'Remote moves');
    sh('push', '-q', 'origin', 'mover:main');
    sh('checkout', '-q', 'main');
    await act({ type: 'updateBranch', name: 'follower' });
    assert.equal(subject('follower'), 'Remote moves');
    assert.equal(branch(), 'main');
    await act({ type: 'updateBranch', name: 'main' });
    assert.equal(subject('main'), 'Remote moves');
  });

  it('adds, brings here and removes worktrees', async () => {
    const sibling = (name: string) => join(dirname(dir), `${basename(dir)}-${name}`);
    const worktrees = async () =>
      new Map((await git.getWorktrees(dir)).map((w) => [basename(w.path), w.branch]));

    await act({ type: 'addWorktree', target: 'topic', isBranch: true });
    assert.match(infos.at(-1)!, /^Worktree ready at /);
    await act({ type: 'addWorktree', target: rev('HEAD') }, 'wt-branch');
    const detachedAt = rev('HEAD~1');
    await act({ type: 'addWorktree', target: detachedAt, detach: true });
    assert.deepEqual(
      await worktrees(),
      new Map([
        [basename(dir), 'main'],
        [basename(sibling('topic')), 'topic'],
        [basename(sibling('wt-branch')), 'wt-branch'],
        [basename(sibling(detachedAt.slice(0, 8))), null]
      ])
    );

    // Bring a dirty worktree's branch to the main worktree: no prompt, changes travel along
    writeFileSync(join(sibling('wt-branch'), 'wip.txt'), 'wip\n');
    await act({ type: 'bringWorktreeHere', path: sibling('wt-branch'), branch: 'wt-branch' });
    assert.equal(branch(), 'wt-branch');
    assert.equal(readFileSync(join(dir, 'wip.txt'), 'utf8'), 'wip\n');
    assert.equal(existsSync(sibling('wt-branch')), false);
    assert.equal(stashes().length, 0);
    await act({ type: 'discardAll' }, true);
    await act({ type: 'checkoutBranch', name: 'main' });

    // Removing a clean worktree loses nothing: no prompt
    await act({ type: 'removeWorktree', path: sibling('topic') });
    assert.equal(existsSync(sibling('topic')), false);

    // One confirmation listing what would be lost, then worktree and branch are gone
    await act({ type: 'addWorktree', target: rev('HEAD') }, 'doomed');
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'Doomed work'], {
      cwd: sibling('doomed')
    });
    writeFileSync(join(sibling('doomed'), 'scratch.txt'), 'x\n');
    await act({ type: 'removeWorktree', path: sibling('doomed'), deleteBranch: 'doomed' }, false);
    assert.equal(existsSync(sibling('doomed')), true);
    await act({ type: 'removeWorktree', path: sibling('doomed'), deleteBranch: 'doomed' }, true);
    assert.equal(existsSync(sibling('doomed')), false);
    assert.equal(sh('branch', '--list', 'doomed'), '');

    rmSync(sibling(detachedAt.slice(0, 8)), { recursive: true });
    await act({ type: 'pruneWorktrees' });
    assert.equal((await worktrees()).size, 1);
  });

  it('cleans up worktrees and branches in bulk, after one confirmation', async () => {
    const sibling = (name: string) => join(dirname(dir), `${basename(dir)}-${name}`);
    await act({ type: 'addWorktree', target: rev('HEAD') }, 'bulk-a');
    await act({ type: 'addWorktree', target: rev('HEAD') }, 'bulk-b');
    writeFileSync(join(sibling('bulk-b'), 'wip.txt'), 'x\n');
    // As the graph lists them (real paths: the temp dir may sit behind a symlink)
    const paths = (await git.getWorktrees(dir))
      .map((w) => w.path)
      .filter((p) => /bulk-[ab]$/.test(p));
    assert.equal(paths.length, 2);
    await act({ type: 'removeWorktrees', paths }, false);
    assert.equal(existsSync(sibling('bulk-a')), true);
    // Uncommitted changes don't stop it once confirmed; the branches go too when asked
    await act({ type: 'removeWorktrees', paths }, 'Remove and Delete Their Branches');
    assert.equal(existsSync(sibling('bulk-a')), false);
    assert.equal(existsSync(sibling('bulk-b')), false);
    assert.equal(sh('branch', '--list', 'bulk-a', 'bulk-b'), '');

    // A worktree, its branch and the branch's copy on the remote: always asks (it's everyone's)
    await act({ type: 'addWorktree', target: rev('HEAD') }, 'bulk-f');
    sh('push', '-q', 'origin', 'bulk-f');
    const fPath = (await git.getWorktrees(dir)).find((w) => w.branch === 'bulk-f')!.path;
    const everywhere = {
      type: 'removeWorktree',
      path: fPath,
      deleteBranch: 'bulk-f',
      deleteRemote: { name: 'origin/bulk-f', remote: 'origin' }
    } as const;
    await act(everywhere, false);
    assert.equal(existsSync(fPath), true);
    await act(everywhere, true);
    assert.equal(existsSync(fPath), false);
    assert.equal(sh('branch', '--list', 'bulk-f'), '');
    assert.doesNotMatch(remoteRefs(), /bulk-f/);

    // Local branches and a remote one together
    sh('branch', 'bulk-c');
    sh('branch', 'bulk-d');
    sh('push', '-q', 'origin', 'bulk-d');
    const remote = [{ name: 'origin/bulk-d', remote: 'origin' }];
    await act({ type: 'deleteBranches', local: ['bulk-c', 'bulk-d'], remote }, false);
    assert.match(remoteRefs(), /refs\/heads\/bulk-d/);
    await act({ type: 'deleteBranches', local: ['bulk-c', 'bulk-d'], remote }, true);
    assert.equal(sh('branch', '--list', 'bulk-c', 'bulk-d'), '');
    assert.doesNotMatch(remoteRefs(), /bulk-d/);

    // Keeping the remote copies
    sh('branch', 'bulk-e');
    sh('push', '-q', 'origin', 'bulk-e');
    const kept = [{ name: 'origin/bulk-e', remote: 'origin' }];
    await act({ type: 'deleteBranches', local: ['bulk-e'], remote: kept }, 'Delete Only Local');
    assert.equal(sh('branch', '--list', 'bulk-e'), '');
    assert.match(remoteRefs(), /refs\/heads\/bulk-e/);
  });

  it('picks what a new worktree checks out', async () => {
    const sibling = (name: string) => join(dirname(dir), `${basename(dir)}-${name}`);
    const branchAt = (path: string) =>
      execFileSync('git', ['branch', '--show-current'], { cwd: path }).toString().trim();

    // A new branch from the default base (origin/main), fetched first and not tracking it
    await act({ type: 'newWorktree' }, '$(add) New branch from origin/main…', 'fresh');
    assert.equal(branchAt(sibling('fresh')), 'fresh');
    assert.equal(rev('fresh'), rev('origin/main'));
    assert.throws(() => sh('rev-parse', '--abbrev-ref', 'fresh@{upstream}'));

    // A free local branch; one already checked out isn't offered
    await act({ type: 'newWorktree' }, '$(git-branch) feature');
    assert.equal(branchAt(sibling('feature')), 'feature');
    const count = (await git.getWorktrees(dir)).length;
    await act({ type: 'newWorktree' }, '$(git-branch) fresh');
    assert.equal((await git.getWorktrees(dir)).length, count);

    // A remote branch: checked out as a local branch tracking it
    sh('push', '-q', 'origin', 'main:remote-fresh');
    sh('fetch', '-q');
    await act({ type: 'newWorktree' }, '$(cloud) origin/remote-fresh');
    assert.equal(branchAt(sibling('remote-fresh')), 'remote-fresh');
    assert.equal(sh('rev-parse', '--abbrev-ref', 'remote-fresh@{upstream}'), 'origin/remote-fresh');

    // A new branch from any other branch
    await act(
      { type: 'newWorktree' },
      '$(git-branch) New branch from another branch…',
      'topic',
      'from-topic'
    );
    assert.equal(rev('from-topic'), rev('topic'));
  });

  it('writes a commit message with the local Claude CLI', async () => {
    // A fake `claude` on the PATH that records its stdin
    const bin = mkdtempSync(join(tmpdir(), 'treeline-bin-'));
    const captured = join(bin, 'stdin.txt');
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\ncat > '${captured}'\necho 'feat: add notes'\n`);
    chmodSync(join(bin, 'claude'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      const root = realpathSync(dir);
      const builtin = await vscode.extensions.getExtension('vscode.git')!.activate();
      const repo = await builtin.getAPI(1).openRepository(vscode.Uri.file(root));
      await vscode.extensions.getExtension('epavanello.treeline')!.activate();
      writeFileSync(join(dir, 'notes.txt'), 'notes\n');
      errors = [];

      await vscode.commands.executeCommand('treeline.generateCommitMessage', {
        rootUri: vscode.Uri.file(root)
      });
      assert.deepEqual(errors, []);
      assert.equal(repo.inputBox.value, 'feat: add notes');
      const prompt = readFileSync(captured, 'utf8');
      assert.match(prompt, /Recent commit subjects:\nRemote moves\nAmended/);
      assert.match(prompt, /New files:\nnotes\.txt/);
    } finally {
      process.env.PATH = path;
    }
  });
});
