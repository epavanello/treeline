import * as path from 'node:path';
import * as vscode from 'vscode';
import type { HostApi, HostEvent, RpcRequest, RpcResponse } from '@treeline/shared';
import { DEFAULT_VIEW, type Action, type ViewSettings } from '@treeline/shared';
import { openFolder, resumeClaudeSession } from './actions';
import { openDiff, revisionUri } from './diff';
import { activeTheme, grammarsFor } from './theme';
import type { BranchDetailsCache } from './branchDetails';
import type { Summaries } from './claude';
import type { Git } from './git';
import type { Pulls } from './pulls';
import type { Repos } from './repos';
import type { ClaudeSessions } from './sessions';

export interface Services {
  git: Git;
  repos: Repos;
  pulls: Pulls;
  branchDetails: BranchDetailsCache;
  summaries: Summaries;
  claudeSessions: ClaudeSessions;
  log: vscode.LogOutputChannel;
  /** Runs an action, showing it as busy, then reloads the graph. */
  run: (repo: string, action: Action) => Promise<void>;
  commitMessage: (repo: string) => Promise<void>;
}

/** The single Git Graph webview panel. */
export class GraphPanel {
  private static current: GraphPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static show(ctx: vscode.ExtensionContext, services: Services) {
    if (GraphPanel.current) return GraphPanel.current.panel.reveal();
    const panel = vscode.window.createWebviewPanel(
      'treeline.graph',
      'Git Graph',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'webview')]
      }
    );
    GraphPanel.current = new GraphPanel(ctx, panel, services);
    // Its editor group stays the graph's: files and diffs opened from it go to the group beside
    void vscode.commands.executeCommand('workbench.action.lockEditorGroup');
  }

  static post(event: HostEvent) {
    void GraphPanel.current?.panel.webview.postMessage(event);
  }

  private constructor(
    ctx: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    {
      git,
      repos,
      pulls,
      branchDetails,
      summaries,
      claudeSessions,
      log,
      run,
      commitMessage
    }: Services
  ) {
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'icon.svg');
    panel.webview.html = html(panel.webview, ctx.extensionUri);

    /** Logs what took a second or more. */
    const timed = async <T>(what: string, work: Promise<T>) => {
      const started = Date.now();
      const result = await work;
      const ms = Date.now() - started;
      if (ms >= 1000) log.info(`${what}: ${ms} ms`);
      return result;
    };
    const api: HostApi = {
      getRepos: () => repos.list(),
      getGraph: (q) => timed(`graph of ${path.basename(q.repo)}`, git.getGraph(q)),
      getDetails: (repo, commit) => git.getDetails(repo, commit),
      locate: (q, hash) => git.locate(q, hash),
      compare: (repo, from, to) => git.compare(repo, from, to),
      getWorktreeDetails: (path, base) => git.worktreeDetails(path, base),
      getBranchDetails: (repo, refs, base) => branchDetails.get(repo, refs, base),
      log: async (message) => log.info(message),
      getPullRequests: (repo, fresh) =>
        timed(`pull requests of ${path.basename(repo)}`, pulls.get(repo, fresh)),
      connectGitHub: (repo) => pulls.get(repo, true, true),
      openUrl: async (url) => {
        // Only web pages: the URL comes from the webview
        if (/^https:\/\//.test(url)) await vscode.env.openExternal(vscode.Uri.parse(url));
      },
      getClaudeSessions: (folders) => timed('Claude sessions', claudeSessions.list(folders)),
      resumeClaudeSession,
      run,
      openDiff: async (target) => void (await openDiff(git, target)),
      generateCommitMessage: commitMessage,
      summarize: (repo, rev, cachedOnly) =>
        timed(
          `summary of ${rev?.slice(0, 8) ?? path.basename(repo)}`,
          summaries.get(repo, rev, cachedOnly)
        ),
      openFile: async (repo, file, hash) => {
        const uri = hash ? revisionUri(repo, file, hash) : vscode.Uri.file(path.join(repo, file));
        await vscode.commands.executeCommand('vscode.open', uri, { preview: true });
      },
      openScm: async () => void (await vscode.commands.executeCommand('workbench.view.scm')),
      openFolder: async (folder) => void (await openFolder(folder)),
      copy: async (text) => vscode.env.clipboard.writeText(text),
      getView: async () => {
        // Saved settings may predate newer fields: fill them in from the defaults
        const saved =
          ctx.globalState.get<Partial<ViewSettings> & { fileTree?: boolean }>('view') ?? {};
        return {
          ...DEFAULT_VIEW,
          // Before `files`, a folder tree was `fileTree: true`
          files: saved.fileTree ? 'tree' : DEFAULT_VIEW.files,
          ...saved,
          columns: { ...DEFAULT_VIEW.columns, ...saved.columns },
          widths: { ...DEFAULT_VIEW.widths, ...saved.widths }
        };
      },
      branchStack: (repo, branch, base) => git.stack(repo, branch, base),
      getPatch: (repo, from, to) => timed('patch', git.patch(repo, from, to)),
      getCodeTheme: () => activeTheme(),
      getGrammars: (file) => grammarsFor(file),
      setView: async (view) => void (await ctx.globalState.update('view', view)),
      getRepoView: async (repo) => {
        const key = await git.commonDir(repo);
        return (
          (key &&
            ctx.globalState.get<Record<string, Record<string, unknown>>>('repoViews')?.[key]) ||
          null
        );
      },
      setRepoView: async (repo, view) => {
        const key = await git.commonDir(repo);
        if (!key) return;
        const all = ctx.globalState.get<Record<string, Record<string, unknown>>>('repoViews') ?? {};
        await ctx.globalState.update('repoViews', { ...all, [key]: view });
      }
    };

    panel.webview.onDidReceiveMessage(
      async ({ id, method, args }: RpcRequest) => {
        const reply: RpcResponse = { id };
        try {
          reply.result = await (api[method] as (...a: unknown[]) => Promise<unknown>)(...args);
        } catch (e) {
          reply.error = (e as Error).message;
          log.warn(`${method} failed: ${reply.error}`);
        }
        void panel.webview.postMessage(reply);
      },
      null,
      this.disposables
    );
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private dispose() {
    GraphPanel.current = undefined;
    this.disposables.forEach((d) => d.dispose());
  }
}

function html(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const asset = (f: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', f));
  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join(
    ''
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}' ${webview.cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${asset('index.css')}" />
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${asset('index.js')}"></script>
</body>
</html>`;
}
