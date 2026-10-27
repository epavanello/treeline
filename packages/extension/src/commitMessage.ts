/**
 * Commit messages written by the local Claude Code CLI (`claude -p`), or by
 * any model exposed through VS Code's Language Model API when the CLI isn't
 * installed. The result goes into the Source Control input box, so committing
 * stays VS Code's own flow (edit, then Cmd/Ctrl+Enter).
 */
import * as vscode from 'vscode';
import { claude, clean } from './claude';
import type { Git } from './git';

const PROMPT = `Write a git commit message for the changes on stdin. Match the language and conventions \
of the recent commit subjects listed first (prefixes such as "feat:", casing, tense). Reply with the \
message only: a subject line of at most 72 characters. Add a blank line and a short body only when the \
reason for the change isn't obvious from the subject. No code fences, quotes or commentary.`;

/** The subset of the built-in Git extension's repository we need. */
export interface ScmRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
}

export async function fillCommitMessage(git: Git, repo: string, scm: ScmRepository[]) {
  const message = await Promise.resolve(
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Writing a commit message with Claude…',
        cancellable: true
      },
      (_, token) => generate(git, repo, token)
    )
  ).catch((e: Error) => {
    void vscode.window.showErrorMessage(e.message);
    return null;
  });
  if (message === null) return; // cancelled or failed
  const target = scm.find((r) => r.rootUri.fsPath === repo);
  if (!target) {
    await vscode.env.clipboard.writeText(message);
    void vscode.window.showInformationMessage('Commit message copied to the clipboard.');
    return;
  }
  target.inputBox.value = message;
  await vscode.commands.executeCommand('workbench.view.scm');
}

async function generate(git: Git, repo: string, token: vscode.CancellationToken) {
  const ctx = await git.commitContext(repo);
  if (!ctx.diff.trim()) throw new Error('There are no changes to commit.');
  const input = `Recent commit subjects:\n${ctx.recent.join('\n')}\n\n${ctx.diff}`;
  const abort = new AbortController();
  token.onCancellationRequested(() => abort.abort());
  try {
    return await claude(PROMPT, input, abort.signal);
  } catch (e) {
    if (token.isCancellationRequested) return null;
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const [model] = await vscode.lm.selectChatModels();
  if (!model)
    throw new Error('Install Claude Code (`claude` on your PATH) or enable a language model.');
  const reply = await model.sendRequest(
    [vscode.LanguageModelChatMessage.User(`${PROMPT}\n\n${input}`)],
    {},
    token
  );
  let text = '';
  for await (const chunk of reply.text) text += chunk;
  return token.isCancellationRequested ? null : clean(text);
}
