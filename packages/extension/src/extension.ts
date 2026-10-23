import * as vscode from 'vscode';
import { actionTarget, type Action } from '@treeline/shared';
import { runAction } from './actions';
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
  /** Actions whose git commands are running, by `actionTarget`: shown as busy in the UI. */
  const busy = new Map<string, Action>();
  const worktrees = new WorktreeView(git, repos, busy);
  /** Every action goes through here, from the graph or the Worktrees view. */
  const run = async (repo: string, action: Action) => {
    const key = actionTarget(action);
    const setBusy = (on: boolean) => {
      if (on) busy.set(key, action);
      else busy.delete(key);
      GraphPanel.post({ event: 'busy', key, busy: on });
      worktrees.refresh();
    };
    try {
      await runAction(git, repo, action, () => setBusy(true));
    } finally {
      if (busy.has(key)) setBusy(false);
      refresh();
    }
  };
  const services = {
    git,
    repos,
    run,
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
    ...registerWorktreeView(worktrees, repos, run),
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
