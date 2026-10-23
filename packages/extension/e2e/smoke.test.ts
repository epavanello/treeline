import * as assert from 'node:assert/strict';
import { realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { UNCOMMITTED, type GraphData, type GraphQuery } from '@treeline/shared';
import { openDiff, revisionUri } from '../src/diff';
import type { Git } from '../src/git';
import { createFixtureRepo } from '../test/fixture';

let dir: string;
let fixtureGit: (...args: string[]) => string;
let git: Git;

const text = async (uri: vscode.Uri) => (await vscode.workspace.openTextDocument(uri)).getText();

/** Opens the diff of `path` the way the details panel does; returns [left, right] contents. */
async function diff(path: string, from: string, to: string, files = [path]) {
  const commit = (await git.getGraph(query())).commits.find((c) => c.hash === to)!;
  const details = await git.getDetails(dir, commit);
  assert.deepEqual(details.files.map((f) => f.path).sort(), files.sort());
  await openDiff(git, { repo: dir, file: details.files.find((f) => f.path === path)!, from, to });
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  assert.ok(input instanceof vscode.TabInputTextDiff, 'active tab is not a diff');
  rightScheme = input.modified.scheme;
  return [await text(input.original), await text(input.modified)];
}
let rightScheme = '';

const query = (): GraphQuery => ({
  repo: dir,
  branches: [],
  authors: [],
  base: null,
  focus: false,
  showRemotes: true,
  maxCommits: 100
});
const hashOf = (subject: string) =>
  fixtureGit('log', '--all', '--format=%H', `--grep=^${subject}$`).trim();

describe('panel', () => {
  before(async () => {
    const fixture = createFixtureRepo();
    dir = realpathSync(fixture.dir);
    fixtureGit = fixture.git;
    const builtin = await vscode.extensions.getExtension('vscode.git')!.activate();
    await builtin.getAPI(1).openRepository(vscode.Uri.file(dir));
    ({ git } = await vscode.extensions.getExtension<{ git: Git }>('emanuele.treeline')!.activate());
  });

  afterEach(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

  it('opens and loads the graph', async () => {
    // The webview calls getGraph once its bundle has run under the CSP and the RPC round-trip works.
    const loaded = new Promise<[GraphQuery, GraphData]>((resolve) => {
      const getGraph = git.getGraph.bind(git);
      git.getGraph = async (q) => {
        const g = await getGraph(q);
        git.getGraph = getGraph;
        resolve([q, g]);
        return g;
      };
    });
    await vscode.commands.executeCommand('treeline.view');

    const [q, graph] = await loaded;
    assert.equal(q.repo, dir);
    assert.equal(graph.currentBranch, 'main');
    assert.equal(graph.commits.length, 10);
  });

  it('diffs a modified file', async () => {
    const hash = hashOf('Main moves on');
    const parent = fixtureGit('rev-parse', `${hash}^`).trim();
    assert.deepEqual(await diff('a.txt', parent, hash), ['Initial commit\n', 'Main moves on\n']);
  });

  it('uses the real file when the revision matches the working tree', async () => {
    const hash = hashOf('Feature work 2');
    await diff('c.txt', `${hash}^`, hash);
    assert.equal(rightScheme, 'file');
    await diff('a.txt', `${hashOf('Main moves on')}^`, hashOf('Main moves on'));
    assert.equal(rightScheme, 'treeline');
  });

  it('diffs an added file against an empty side', async () => {
    const hash = hashOf('Topic commit');
    const parent = fixtureGit('rev-parse', `${hash}^`).trim();
    assert.deepEqual(await diff('d.txt', parent, hash), ['', 'Topic commit\n']);
  });

  it('diffs uncommitted changes against the working tree', async () => {
    const files = await git.compare(dir, 'HEAD', UNCOMMITTED);
    await openDiff(git, {
      repo: dir,
      file: files.find((f) => f.path === 'b.txt')!,
      from: 'HEAD',
      to: UNCOMMITTED
    });
    const input = vscode.window.tabGroups.activeTabGroup.activeTab
      ?.input as vscode.TabInputTextDiff;
    assert.equal(input.modified.scheme, 'file');
    assert.deepEqual(
      [await text(input.original), await text(input.modified)],
      ['Add b\n', 'dirty\n']
    );
  });

  it('diffs a stashed untracked file from the stash third parent', async () => {
    writeFileSync(join(dir, 'stashed-new.txt'), 'untracked in stash\n');
    fixtureGit('stash', 'push', '-q', '--include-untracked', '-m', 'with untracked');
    const stash = fixtureGit('rev-parse', 'stash@{0}').trim();
    const base = fixtureGit('rev-parse', 'HEAD').trim();
    const [left, right] = await diff('stashed-new.txt', base, stash, [
      'b.txt',
      'new.txt',
      'stashed-new.txt'
    ]);
    assert.deepEqual([left, right], ['', 'untracked in stash\n']);
    fixtureGit('stash', 'pop', '-q');
  });

  it('diffs a deleted file and opens a file at a revision', async () => {
    rmSync(join(dir, 'a.txt'));
    fixtureGit('commit', '-q', '-am', 'Delete a');
    const hash = fixtureGit('rev-parse', 'HEAD').trim();
    assert.deepEqual(await diff('a.txt', `${hash}^`, hash, ['a.txt', 'b.txt']), [
      'Main after topic\n',
      ''
    ]);
    assert.equal(await text(revisionUri(dir, 'a.txt', `${hash}^`)), 'Main after topic\n');
  });
});
