/**
 * The Worktrees view in the Source Control sidebar: every worktree with its
 * branch and local status, inline open/remove buttons, and a context menu.
 * Its commands reuse the graph's actions (actions.ts).
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Action, Worktree } from '@treeline/shared';
import { openFolder, runAction } from './actions';
import type { Git } from './git';
import type { Repos } from './repos';

class WorktreeItem extends vscode.TreeItem {
  constructor(
    readonly wt: Worktree,
    /** The main worktree: where git commands for this repository run. */
    readonly repo: string,
    open: boolean
  ) {
    super(path.basename(wt.path));
    const s = wt.status;
    const state = wt.prunable
      ? 'missing'
      : s && [
          s.changes ? `●${s.changes}` : '✓',
          (s.ahead || s.behind) && `↑${s.ahead} ↓${s.behind}`
        ];
    this.description = [wt.branch ?? `detached ${wt.head.slice(0, 7)}`, state]
      .flat()
      .filter(Boolean)
      .join('  ');
    this.iconPath = wt.prunable
      ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))
      : new vscode.ThemeIcon(
          open ? 'folder-opened' : wt.main ? 'repo' : 'folder',
          s?.changes ? new vscode.ThemeColor('gitDecoration.modifiedResourceForeground') : undefined
        );
    this.tooltip = new vscode.MarkdownString(
      [
        `**${wt.path}**`,
        wt.branch ? `Branch \`${wt.branch}\`` : `Detached at \`${wt.head.slice(0, 8)}\``,
        wt.prunable
          ? 'The folder is missing: prune to clean it up.'
          : s &&
            [
              s.changes ? `${s.changes} uncommitted changes` : 'No uncommitted changes',
              s.upstream ? `${s.ahead} ahead, ${s.behind} behind \`${s.upstream}\`` : 'No upstream'
            ].join(' · '),
        open ? '_Open in this window_' : ''
      ]
        .filter(Boolean)
        .join('\n\n')
    );
    // Flags for the `when` clauses in package.json, e.g. `viewItem =~ /;main;/`
    const flags = [
      'worktree',
      wt.main && 'main',
      open && 'open',
      wt.prunable && 'prunable',
      wt.branch && 'branch'
    ];
    this.contextValue = `;${flags.filter(Boolean).join(';')};`;
  }
}

class RepoItem extends vscode.TreeItem {
  constructor(
    label: string,
    readonly children: WorktreeItem[]
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon('repo');
  }
}

type Item = WorktreeItem | RepoItem;

export class WorktreeView implements vscode.TreeDataProvider<Item> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly git: Git,
    private readonly repos: Repos
  ) {}

  refresh() {
    this.changed.fire();
  }

  getTreeItem(item: Item) {
    return item;
  }

  async getChildren(item?: Item): Promise<Item[]> {
    if (item) return item instanceof RepoItem ? item.children : [];
    const repos = await this.repos.list();
    const open = new Set(repos.map((r) => r.path));
    // Several open folders can be worktrees of the same repository: group by main worktree
    const groups = new Map<string, Worktree[]>();
    for (const r of repos) {
      const wts = await this.git.getWorktrees(r.path);
      if (wts.length) groups.set(wts[0].path, wts);
    }
    const items = [...groups].map(([main, wts]) => ({
      main,
      items: wts.map((w) => new WorktreeItem(w, main, open.has(w.path)))
    }));
    if (items.length === 1) return items[0].items;
    return items.map((g) => new RepoItem(path.basename(g.main), g.items));
  }
}

/** `refresh` updates the graph and this view after an action. */
export function registerWorktreeView(
  view: WorktreeView,
  git: Git,
  repos: Repos,
  refresh: () => void
) {
  const run = async (repo: string, action: Action) => {
    await runAction(git, repo, action);
    refresh();
  };
  const firstRepo = async () => (await repos.list())[0]?.path;
  const cmd = (id: string, fn: (item: WorktreeItem) => unknown) =>
    vscode.commands.registerCommand(`treeline.worktree.${id}`, fn);

  return [
    vscode.window.createTreeView('treeline.worktrees', { treeDataProvider: view }),
    // Coming back from another window (where a worktree was edited) refreshes statuses
    vscode.window.onDidChangeWindowState((s) => s.focused && view.refresh()),
    cmd('open', (i) => openFolder(i.wt.path)),
    cmd('terminal', (i) =>
      vscode.window.createTerminal({ cwd: i.wt.path, name: path.basename(i.wt.path) }).show()
    ),
    cmd('reveal', (i) =>
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(i.wt.path))
    ),
    cmd('copyPath', (i) => vscode.env.clipboard.writeText(i.wt.path)),
    cmd('bringHere', (i) =>
      run(i.repo, { type: 'bringWorktreeHere', path: i.wt.path, branch: i.wt.branch! })
    ),
    cmd('remove', (i) =>
      i.wt.prunable
        ? run(i.repo, { type: 'pruneWorktrees' })
        : run(i.repo, { type: 'removeWorktree', path: i.wt.path })
    ),
    cmd('removeAndDelete', (i) =>
      run(i.repo, { type: 'removeWorktree', path: i.wt.path, deleteBranch: i.wt.branch! })
    ),
    vscode.commands.registerCommand('treeline.worktree.add', async () => {
      const repo = await firstRepo();
      if (repo) await run(repo, { type: 'addWorktree', target: 'HEAD' });
    }),
    vscode.commands.registerCommand('treeline.worktree.prune', async () => {
      const repo = await firstRepo();
      if (repo) await run(repo, { type: 'pruneWorktrees' });
    }),
    vscode.commands.registerCommand('treeline.worktree.refresh', () => view.refresh())
  ];
}
