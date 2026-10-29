import * as vscode from 'vscode';
import { actionTarget, type Action, type Settings } from '@treeline/shared';
import { runAction } from './actions';
import { BranchDetailsCache } from './branchDetails';
import { hasClaude, Summaries } from './claude';
import { ClaudeSessions } from './sessions';
import { fillCommitMessage } from './commitMessage';
import { RevisionProvider, SCHEME } from './diff';
import { Git } from './git';
import { GraphPanel } from './panel';
import { Pulls } from './pulls';
import { getBuiltinGit, Repos } from './repos';

export async function activate(ctx: vscode.ExtensionContext) {
  const builtin = await getBuiltinGit();
  // Timings and slow git commands, for diagnosing big repositories (View → Output → Treeline)
  const log = vscode.window.createOutputChannel('Treeline', { log: true });
  const git = new Git(builtin?.git.path ?? 'git', (args, ms) =>
    log.info(`git ${args.join(' ').slice(0, 200)}: ${ms} ms`)
  );
  const branchDetails = new BranchDetailsCache(git, {
    get: () => ctx.workspaceState.get('branchDetails'),
    set: (value) => ctx.workspaceState.update('branchDetails', value)
  });
  const summaries = new Summaries(git, {
    get: () => ctx.workspaceState.get('summaries'),
    set: (value) => ctx.workspaceState.update('summaries', value)
  });
  const refresh = () => GraphPanel.post({ event: 'refresh' });
  const repos = new Repos(git, builtin, refresh, () => GraphPanel.post({ event: 'repos' }));
  // Pull requests: the gh CLI first; else the editor's GitHub account, silently once granted
  const pulls = new Pulls(git, async (ask) => {
    const scopes = ['repo'];
    const session = await vscode.authentication.getSession(
      'github',
      scopes,
      ask ? { createIfNone: true } : { silent: true }
    );
    return session?.accessToken;
  });
  // What changes the remote's branches, or what we know of them, makes pull requests worth asking again
  const touchesRemote = new Set<Action['type']>([
    'fetch',
    'pushBranch',
    'deleteRemoteBranch',
    'deleteBranches'
  ]);
  /** Every action goes through here: shown as busy once its prompts are answered, then a reload. */
  const run = async (repo: string, action: Action) => {
    const key = actionTarget(action);
    const began = Date.now();
    let started = false;
    try {
      await runAction(git, repo, action, () => {
        started = true;
        GraphPanel.post({ event: 'busy', key, busy: true });
      });
    } finally {
      if (started) GraphPanel.post({ event: 'busy', key, busy: false });
      if (started && touchesRemote.has(action.type)) pulls.invalidate(repo);
      if (started) log.info(`${action.type} ${key}: done in ${Date.now() - began} ms, reloading`);
      refresh();
    }
  };
  // Checked once: installing Claude Code takes a window reload to show its features
  const claudeFound = hasClaude();
  const settings = async (): Promise<Settings> => {
    if (!vscode.workspace.getConfiguration('treeline').get('claude.enabled', true))
      return { claude: false, commitMessage: false };
    const claude = await claudeFound;
    return {
      claude,
      commitMessage: claude || (await vscode.lm.selectChatModels()).length > 0
    };
  };
  /** The ✨ button and command follow `commitMessage`; the webview asks `settings` again. */
  const settingsChanged = async () => {
    const s = await settings();
    await vscode.commands.executeCommand('setContext', 'treeline.commitMessage', s.commitMessage);
    GraphPanel.post({ event: 'settings' });
  };
  void settingsChanged();
  const services = {
    git,
    repos,
    pulls,
    branchDetails,
    summaries,
    claudeSessions: new ClaudeSessions(),
    log,
    run,
    commitMessage: (repo: string) => fillCommitMessage(git, repo, builtin?.repositories ?? []),
    settings
  };

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  status.text = '$(git-branch) Git Graph';
  status.tooltip = 'View Git Graph';
  status.command = 'treeline.view';
  status.show();

  ctx.subscriptions.push(
    log,
    repos,
    status,
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new RevisionProvider(git)),
    // Diffs in the panel are colored with the theme's colors
    vscode.window.onDidChangeActiveColorTheme(() => GraphPanel.post({ event: 'theme' })),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('editor.tokenColorCustomizations'))
        GraphPanel.post({ event: 'theme' });
      if (e.affectsConfiguration('treeline.claude')) void settingsChanged();
    }),
    vscode.lm.onDidChangeChatModels(() => void settingsChanged()),
    vscode.commands.registerCommand('treeline.view', () => GraphPanel.show(ctx, services)),
    vscode.commands.registerCommand('treeline.fetch', async () => {
      for (const repo of await repos.list()) {
        await git.exec(repo.path, ['fetch', '--all', '--prune']).catch(() => {});
        pulls.invalidate(repo.path);
      }
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
