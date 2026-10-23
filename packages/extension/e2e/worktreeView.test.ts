import * as assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { Git } from '../src/git';
import type { Repos } from '../src/repos';
import { WorktreeView } from '../src/worktreeView';
import { createFixtureRepo } from '../test/fixture';

/** The `view/item/context` menu items whose `viewItem =~ /…/` clauses all match. */
function menu(contextValue: string, inline: boolean) {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  return (
    pkg.contributes.menus['view/item/context'] as { command: string; when: string; group: string }[]
  )
    .filter((m) => m.group.startsWith('inline') === inline)
    .filter((m) =>
      [...m.when.matchAll(/viewItem =~ \/(.+?)\/(?= |$)/g)].every(([, re]) =>
        new RegExp(re).test(contextValue)
      )
    )
    .map((m) => m.command.replace('treeline.worktree.', ''));
}

describe('worktree view', () => {
  it('lists worktrees with their status and the right actions', async () => {
    const fixture = createFixtureRepo();
    const dir = realpathSync(fixture.dir);
    const linked = join(realpathSync(mkdtempSync(join(tmpdir(), 'treeline-wt-'))), 'topic');
    fixture.git('worktree', 'add', '-q', linked, 'topic');
    writeFileSync(join(linked, 'wip.txt'), 'wip\n');

    const repos = { list: async () => [{ path: dir, name: basename(dir) }] } as unknown as Repos;
    const items = (await new WorktreeView(
      new Git(),
      repos,
      new Map()
    ).getChildren()) as vscode.TreeItem[];
    assert.deepEqual(
      items.map((i) => [i.label, i.description, i.contextValue]),
      [
        [basename(dir), 'main  ✎2', ';worktree;main;open;branch;'],
        ['topic', 'topic  ✎1', ';worktree;branch;']
      ]
    );

    // While an action runs on a worktree, its row says so with a spinner
    const busy = new Map([[linked, { type: 'removeWorktree' as const, path: linked }]]);
    const [, removing] = (await new WorktreeView(
      new Git(),
      repos,
      busy
    ).getChildren()) as vscode.TreeItem[];
    assert.equal(removing.description, 'topic  Removing…');
    assert.equal((removing.iconPath as vscode.ThemeIcon).id, 'loading~spin');

    // The worktree open in this window: no inline buttons, no remove / bring here
    assert.deepEqual(menu(items[0].contextValue!, true), []);
    assert.deepEqual(menu(items[0].contextValue!, false), ['terminal', 'reveal', 'copyPath']);
    assert.deepEqual(menu(items[1].contextValue!, true), ['open', 'remove']);
    assert.deepEqual(menu(items[1].contextValue!, false), [
      'open',
      'terminal',
      'reveal',
      'copyPath',
      'bringHere',
      'remove',
      'removeAndDelete'
    ]);
  });
});
