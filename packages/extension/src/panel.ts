import * as path from 'node:path';
import * as vscode from 'vscode';
import type { HostApi, HostEvent, RpcRequest, RpcResponse } from '@treeline/shared';
import type { Action, ViewSettings } from '@treeline/shared';
import { openFolder } from './actions';
import { openDiff, revisionUri } from './diff';
import type { Git } from './git';
import type { Repos } from './repos';

export interface Services {
  git: Git;
  repos: Repos;
  /** Runs an action, showing it as busy, then reloads the graph and the Worktrees view. */
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
  }

  static post(event: HostEvent) {
    void GraphPanel.current?.panel.webview.postMessage(event);
  }

  private constructor(
    ctx: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    { git, repos, run, commitMessage }: Services
  ) {
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'resources', 'icon.svg');
    panel.webview.html = html(panel.webview, ctx.extensionUri);

    const api: HostApi = {
      getRepos: () => repos.list(),
      getGraph: (q) => git.getGraph(q),
      getDetails: (repo, commit) => git.getDetails(repo, commit),
      compare: (repo, from, to) => git.compare(repo, from, to),
      run,
      openDiff: async (target) => void (await openDiff(git, target)),
      generateCommitMessage: commitMessage,
      openFile: async (repo, file, hash) => {
        const uri = hash ? revisionUri(repo, file, hash) : vscode.Uri.file(path.join(repo, file));
        await vscode.commands.executeCommand('vscode.open', uri, { preview: true });
      },
      openScm: async () => void (await vscode.commands.executeCommand('workbench.view.scm')),
      openFolder: async (folder) => void (await openFolder(folder)),
      copy: async (text) => vscode.env.clipboard.writeText(text),
      getView: async () => ({
        worktrees: true,
        branches: true,
        tags: true,
        ...ctx.globalState.get<Partial<ViewSettings>>('view')
      }),
      setView: async (view) => void (await ctx.globalState.update('view', view))
    };

    panel.webview.onDidReceiveMessage(
      async ({ id, method, args }: RpcRequest) => {
        const reply: RpcResponse = { id };
        try {
          reply.result = await (api[method] as (...a: unknown[]) => Promise<unknown>)(...args);
        } catch (e) {
          reply.error = (e as Error).message;
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
