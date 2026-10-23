import * as vscode from 'vscode';
import { actionTarget, type Action } from '@treeline/shared';
import { runAction } from './actions';
import { fillCommitMessage } from './commitMessage';
import { RevisionProvider, SCHEME } from './diff';
import { Git } from './git';
import { GraphPanel } from './panel';
import { getBuiltinGit, Repos } from './repos';

export async function activate(ctx: vscode.ExtensionContext) {
  const builtin = await getBuiltinGit();
  const git = new Git(builtin?.git.path ?? 'git');
  const refresh = () => GraphPanel.post({ event: 'refresh' });
  const repos = new Repos(git, builtin, refresh, () => GraphPanel.post({ event: 'repos' }));
  /** Every action goes through here: shown as busy once its prompts are answered, then a reload. */
  const run = async (repo: string, action: Action) => {
    const key = actionTarget(action);
    let started = false;
    try {
      await runAction(git, repo, action, () => {
        started = true;
        GraphPanel.post({ event: 'busy', key, busy: true });
      });
    } finally {
      if (started) GraphPanel.post({ event: 'busy', key, busy: false });
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
