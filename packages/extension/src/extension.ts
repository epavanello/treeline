import * as vscode from 'vscode';
import { fillCommitMessage } from './commitMessage';
import { RevisionProvider, SCHEME } from './diff';
import { Git } from './git';
import { GraphPanel } from './panel';
import { getBuiltinGit, Repos } from './repos';
import { registerWorktreeView, WorktreeView } from './worktreeView';

export async function activate(ctx: vscode.ExtensionContext) {
  const builtin = await getBuiltinGit();
  const git = new Git(builtin?.git.path ?? 'git');
  /** After any change: reload the graph and the Worktrees view. */
  const refresh = () => (GraphPanel.post({ event: 'refresh' }), worktrees.refresh());
  const repos = new Repos(git, builtin, refresh, () => {
    GraphPanel.post({ event: 'repos' });
    worktrees.refresh();
  });
  const worktrees = new WorktreeView(git, repos);
  const services = {
    git,
    repos,
    refresh,
    commitMessage: (repo: string) => fillCommitMessage(git, repo, builtin?.repositories ?? [])
  };

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  status.text = '$(git-branch) Git Graph';
  status.tooltip = 'View Git Graph';
  status.command = 'treeline.view';
  status.show();

  ctx.subscriptions.push(
    repos,
    status,
    ...registerWorktreeView(worktrees, git, repos, refresh),
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new RevisionProvider(git)),
    vscode.commands.registerCommand('treeline.view', () => GraphPanel.show(ctx, services)),
    vscode.commands.registerCommand('treeline.fetch', async () => {
      for (const repo of await repos.list())
        await git.exec(repo.path, ['fetch', '--all', '--prune']).catch(() => {});
      refresh();
    }),
    // From the Source Control title bar (a SourceControl argument) or the command palette
    vscode.commands.registerCommand(
      'treeline.generateCommitMessage',
      async (scm?: { rootUri?: vscode.Uri }) => {
        const repo = scm?.rootUri?.fsPath ?? (await repos.list())[0]?.path;
        if (repo) await services.commitMessage(repo);
      }
    )
  );
  // Exposed for the e2e tests (e2e/), which observe graph loads through it.
  return { git };
}

export function deactivate() {}
