/**
 * Read-only documents for file contents at a given revision, opened through
 * the built-in `vscode.diff` / `vscode.open` commands.
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import { UNCOMMITTED, type DiffTarget } from '@treeline/shared';
import type { Git } from './git';

export const SCHEME = 'treeline';

/** `rev === ''` produces an empty document (the missing side of an add/delete). */
export function revisionUri(repo: string, filePath: string, rev: string) {
  return vscode.Uri.from({
    scheme: SCHEME,
    path: '/' + filePath,
    query: JSON.stringify({ repo, rev })
  });
}

export class RevisionProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly git: Git) {}

  async provideTextDocumentContent(uri: vscode.Uri) {
    const { repo, rev } = JSON.parse(uri.query) as { repo: string; rev: string };
    if (!rev) return '';
    try {
      return await this.git.showFile(repo, rev, uri.path.slice(1));
    } catch (e) {
      void vscode.window.showErrorMessage(`Unable to load file: ${(e as Error).message}`);
      return '';
    }
  }
}

const label = (rev: string) =>
  rev === UNCOMMITTED ? 'Working Tree' : rev ? rev.slice(0, 8) : 'empty';

/**
 * The right side is the real file whenever it matches the working tree, so
 * language features (go to definition, errors, links) work on it: they don't
 * on virtual `treeline:` documents.
 */
export async function openDiff(git: Git, { repo, file, from, to }: DiffTarget) {
  const added = file.status === 'A' || file.status === 'U';
  const left = revisionUri(repo, file.oldPath, added ? '' : from);
  const onDisk =
    to === UNCOMMITTED ||
    (file.status !== 'D' &&
      file.status !== 'U' &&
      (await git.sameAsWorkingTree(repo, to, file.path)));
  const right =
    file.status === 'D'
      ? revisionUri(repo, file.path, '')
      : onDisk
        ? vscode.Uri.file(path.join(repo, file.path))
        : // Untracked files of a stash live in its third parent
          revisionUri(repo, file.path, file.status === 'U' ? `${to}^3` : to);
  const side = to !== UNCOMMITTED && onDisk ? `${label(to)} = Working Tree` : label(to);
  const title = `${path.basename(file.path)} (${label(added ? '' : from)} ↔ ${side})`;
  return vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true });
}
