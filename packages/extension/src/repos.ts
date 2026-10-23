/**
 * Repository discovery and change events, delegated to VS Code's built-in
 * Git extension (`vscode.git`, API v1) — the same source the Source Control
 * view uses. Falls back to workspace folders + a file watcher if it is
 * unavailable (e.g. disabled by the user).
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Repo } from '@treeline/shared';
import type { Git } from './git';

/** The subset of the built-in Git extension API we rely on. */
interface BuiltinGitApi {
  state: 'uninitialized' | 'initialized';
  onDidChangeState: vscode.Event<string>;
  git: { path: string };
  repositories: {
    rootUri: vscode.Uri;
    inputBox: { value: string };
    state: { onDidChange: vscode.Event<void> };
  }[];
  onDidOpenRepository: vscode.Event<unknown>;
  onDidCloseRepository: vscode.Event<unknown>;
}

export async function getBuiltinGit(): Promise<BuiltinGitApi | null> {
  try {
    const ext = vscode.extensions.getExtension<{ getAPI(v: 1): BuiltinGitApi }>('vscode.git');
    if (!ext) return null;
    const api = (ext.isActive ? ext.exports : await ext.activate()).getAPI(1);
    if (api.state !== 'initialized') {
      // Don't block activation forever if the Git extension never finishes initialising.
      await Promise.race([
        new Promise<void>((resolve) => {
          const sub = api.onDidChangeState(
            (s) => s === 'initialized' && (sub.dispose(), resolve())
          );
        }),
        new Promise((resolve) => setTimeout(resolve, 10_000))
      ]);
    }
    return api;
  } catch {
    return null;
  }
}

export class Repos implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private repoSubs: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly git: Git,
    private readonly builtin: BuiltinGitApi | null,
    /** Fired (debounced) when any repo's state changes on disk. */
    private readonly onChange: () => void,
    /** Fired when repositories are opened or closed. */
    private readonly onReposChange: () => void
  ) {
    if (builtin) {
      this.disposables.push(
        builtin.onDidOpenRepository(() => this.resubscribe()),
        builtin.onDidCloseRepository(() => this.resubscribe())
      );
      this.resubscribe(false);
    } else {
      const watcher = vscode.workspace.createFileSystemWatcher('**/*');
      const changed = (uri: vscode.Uri) =>
        !/[\\/]\.git[\\/](objects|logs)[\\/]/.test(uri.fsPath) && this.changed();
      this.disposables.push(
        watcher,
        watcher.onDidChange(changed),
        watcher.onDidCreate(changed),
        watcher.onDidDelete(changed),
        vscode.workspace.onDidChangeWorkspaceFolders(() => this.onReposChange())
      );
    }
  }

  private resubscribe(notify = true) {
    this.repoSubs.forEach((d) => d.dispose());
    this.repoSubs = this.builtin!.repositories.map((r) =>
      r.state.onDidChange(() => this.changed())
    );
    if (notify) this.onReposChange();
  }

  private changed() {
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onChange, 400);
  }

  async list(): Promise<Repo[]> {
    let roots: string[];
    if (this.builtin) {
      roots = this.builtin.repositories.map((r) => r.rootUri.fsPath);
    } else {
      const folders = vscode.workspace.workspaceFolders ?? [];
      roots = (await Promise.all(folders.map((f) => this.git.toplevel(f.uri.fsPath)))).filter(
        (r): r is string => !!r
      );
    }
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    const unique = [...new Set(roots)].sort((a, b) => a.localeCompare(b));
    // The repo containing the active editor comes first, so it opens by default.
    const owner =
      active &&
      unique.filter((r) => active.startsWith(r + path.sep)).sort((a, b) => b.length - a.length)[0];
    if (owner) (unique.splice(unique.indexOf(owner), 1), unique.unshift(owner));
    return unique.map((p) => ({ path: p, name: path.basename(p) }));
  }

  dispose() {
    clearTimeout(this.timer);
    [...this.disposables, ...this.repoSubs].forEach((d) => d.dispose());
  }
}
