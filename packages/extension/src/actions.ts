/**
 * Every write operation. Prompts use VS Code's native UI and appear only when
 * a name is needed or something would be lost: uncommitted changes, commits
 * that exist on no other branch, remote state, stashes. Everything else runs
 * straight away with git's defaults.
 */
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ago, type Action, type Upstream } from '@treeline/shared';
import type { Git } from './git';

const ask = (prompt: string, value = '') =>
  vscode.window.showInputBox({ prompt, value, ignoreFocusOut: true });

const confirm = async (message: string, button: string) =>
  (await vscode.window.showWarningMessage(message, { modal: true }, button)) === button;

/** Single-choice list. Returns the chosen item's `value`, or undefined if dismissed. */
async function pick<T>(title: string, items: { label: string; detail?: string; value: T }[]) {
  return (await vscode.window.showQuickPick(items, { title, ignoreFocusOut: true }))?.value;
}

/** The only remote, or the user's choice; undefined (with an error) when there are none. */
async function pickRemote(git: Git, repo: string) {
  const remotes = (await git.exec(repo, ['remote'])).split('\n').filter(Boolean);
  if (remotes.length <= 1) {
    if (!remotes.length) void vscode.window.showErrorMessage('This repository has no remotes.');
    return remotes[0];
  }
  return pick(
    'Push to remote',
    remotes.map((r) => ({ label: r, value: r }))
  );
}

/** Number of uncommitted changes (0 when the folder can't be read). */
const changes = (git: Git, dir: string, untracked = true) =>
  git.exec(dir, ['status', '--porcelain', ...(untracked ? [] : ['--untracked-files=no'])]).then(
    (s) => s.split('\n').filter(Boolean).length,
    () => 0
  );

/** Commits reachable from `branch` and from no other branch, remote branch or tag. */
const uniqueCommits = (git: Git, repo: string, branch: string) =>
  git
    .exec(repo, [
      'rev-list',
      '--count',
      `refs/heads/${branch}`,
      '--not',
      `--exclude=${branch}`,
      '--branches',
      '--remotes',
      '--tags'
    ])
    .then(Number, () => 0);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const short = (hash: string) => hash.slice(0, 8);
const folder = (dir: string) => path.basename(dir);

/** `../<repo>-<name>`, with a numeric suffix if that folder already exists. */
function siblingFolder(repo: string, name: string) {
  const base = path.join(path.dirname(repo), `${folder(repo)}-${name.replace(/[\\/:]/g, '-')}`);
  let dir = base;
  for (let i = 2; existsSync(dir); i++) dir = `${base}-${i}`;
  return dir;
}

/** After creating a worktree: say where, and offer to open it. */
const worktreeReady = (dir: string) =>
  void vscode.window
    .showInformationMessage(`Worktree ready at ${dir}`, 'Open in New Window', 'Open Terminal')
    .then((choice) =>
      choice === 'Open in New Window'
        ? openFolder(dir)
        : choice && vscode.window.createTerminal({ cwd: dir, name: folder(dir) }).show()
    );

/** A new branch name: asked natively, checked as you type (valid for git, not taken). */
const askBranchName = (git: Git, repo: string, title: string, taken: Set<string>) =>
  vscode.window.showInputBox({
    title,
    prompt: 'Name of the new branch (its worktree folder is named after it)',
    ignoreFocusOut: true,
    validateInput: async (v) =>
      !v
        ? undefined
        : taken.has(v)
          ? `${v} already exists`
          : await git.exec(repo, ['check-ref-format', '--branch', v]).then(
              () => undefined,
              () => 'Not a valid branch name'
            )
  });

const syncText = (u?: Upstream) =>
  !u
    ? 'not pushed'
    : u.gone
      ? 'upstream deleted'
      : [u.ahead && `↑${u.ahead}`, u.behind && `↓${u.behind}`].filter(Boolean).join(' ') ||
        'in sync';

const SEMVER = /^(v?)(\d+)\.(\d+)\.(\d+)$/;

export const openFolder = (dir: string) =>
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir), {
    forceNewWindow: true
  });

/** A git argument list, or a callback run after the preceding commands succeeded. */
type Step = string[] | (() => unknown);

/** Returns the steps to run, or null if the user cancelled. */
async function plan(git: Git, repo: string, a: Action): Promise<Step[] | null> {
  switch (a.type) {
    case 'checkoutBranch': {
      if (!a.remote) return [['checkout', a.name]];
      // Remote branch: switch to the local branch of the same name, creating it if needed
      const local = a.name.slice(a.remote.length + 1);
      const exists = await git
        .exec(repo, ['rev-parse', '--verify', '-q', `refs/heads/${local}`])
        .then(
          () => true,
          () => false
        );
      return [exists ? ['checkout', local] : ['checkout', '--track', a.name]];
    }
    case 'checkoutCommit':
      return [['checkout', a.hash]];
    case 'createBranch': {
      const name = await ask(`New branch at ${short(a.hash)} (it will be checked out)`);
      return name ? [['checkout', '-b', name, a.hash]] : null;
    }
    case 'renameBranch': {
      const name = await ask(`Rename branch ${a.name}`, a.name);
      return name && name !== a.name ? [['branch', '-m', a.name, name]] : null;
    }
    case 'deleteBranch': {
      const only = await uniqueCommits(git, repo, a.name);
      if (
        only &&
        !(await confirm(
          `${a.name} has ${plural(only, 'commit')} that no other branch contains. Delete it anyway?`,
          'Delete Branch'
        ))
      )
        return null;
      return [['branch', '-D', a.name]];
    }
    case 'deleteRemoteBranch': {
      const branch = a.name.slice(a.remote.length + 1);
      return (await confirm(`Delete ${branch} on ${a.remote}?`, 'Delete'))
        ? [['push', a.remote, '--delete', branch]]
        : null;
    }
    case 'pushBranch': {
      const remote = await pickRemote(git, repo);
      if (!remote) return null;
      if (
        a.force &&
        !(await confirm(
          `Force push ${a.name} to ${remote}? Commits on ${remote}/${a.name} that you don't have locally will be lost.`,
          'Force Push'
        ))
      )
        return null;
      return [
        ['push', ...(a.force ? ['--force-with-lease'] : []), '--set-upstream', remote, a.name]
      ];
    }
    case 'pullBranch':
      return [['pull', a.remote, a.name.slice(a.remote.length + 1)]];
    case 'updateBranch': {
      const wt = (await git.getWorktrees(repo)).find((w) => w.branch === a.name);
      if (wt) return [wt.current ? ['pull'] : ['-C', wt.path, 'pull']];
      // Not checked out anywhere: fast-forward it straight from the remote (refused if it diverged)
      const config = (key: string) =>
        git.exec(repo, ['config', `branch.${a.name}.${key}`]).then(
          (s) => s.trim(),
          () => ''
        );
      const [remote, merge] = await Promise.all([config('remote'), config('merge')]);
      if (!remote || !merge) {
        void vscode.window.showErrorMessage(`${a.name} has no upstream branch to pull from.`);
        return null;
      }
      return [['fetch', remote, `${merge}:refs/heads/${a.name}`]];
    }
    case 'merge':
      return [['merge', '--no-edit', a.target]];
    case 'rebase':
      return [['rebase', a.target]];
    case 'cherryPick':
    case 'revert': {
      // Merge commits: relative to their first parent, which is what's wanted almost always
      const mainline = a.parents > 1 ? ['-m', '1'] : [];
      return a.type === 'revert'
        ? [['revert', '--no-edit', ...mainline, a.hash]]
        : [['cherry-pick', ...mainline, a.hash]];
    }
    case 'reset': {
      const mode = await pick(`Reset the current branch to ${short(a.hash)}`, [
        { label: 'Soft', detail: 'Keep all changes, staged', value: '--soft' },
        { label: 'Mixed', detail: 'Keep all changes, unstaged', value: '--mixed' },
        { label: 'Hard', detail: 'Discard all changes', value: '--hard' }
      ]);
      if (!mode) return null;
      const dirty = mode === '--hard' ? await changes(git, repo, false) : 0;
      if (
        dirty &&
        !(await confirm(`A hard reset discards ${plural(dirty, 'uncommitted change')}.`, 'Reset'))
      )
        return null;
      return [['reset', mode, a.hash]];
    }
    case 'addTag': {
      const tags = (await git.listRefs(repo)).filter((r) => r.ref.kind === 'tag');
      const taken = new Set(tags.map((t) => t.ref.name));
      // Suggest the next versions after the highest semver tag
      const latest = tags
        .map((t) => t.ref.name.match(SEMVER))
        .filter((m) => !!m)
        .sort((x, y) => +y[2] - +x[2] || +y[3] - +x[3] || +y[4] - +x[4])[0];
      const OTHER = '$(edit) Other name…';
      let name: string | undefined = OTHER;
      if (latest) {
        const [, v, ...numbers] = latest;
        const [maj, min, pat] = numbers.map(Number);
        const next = [
          [`${v}${maj}.${min}.${pat + 1}`, 'patch: fixes'],
          [`${v}${maj}.${min + 1}.0`, 'minor: new features'],
          [`${v}${maj + 1}.0.0`, 'major: breaking changes']
        ].filter(([n]) => !taken.has(n));
        name = (
          await vscode.window.showQuickPick(
            [...next.map(([label, description]) => ({ label, description })), { label: OTHER }],
            {
              title: `Tag ${short(a.hash)}`,
              placeHolder: `Latest: ${latest[0]}`,
              ignoreFocusOut: true
            }
          )
        )?.label;
      }
      if (name === OTHER)
        name = await vscode.window.showInputBox({
          title: `Tag ${short(a.hash)}`,
          prompt: 'Tag name',
          ignoreFocusOut: true,
          validateInput: (v) => (taken.has(v) ? `${v} already exists` : undefined)
        });
      if (!name) return null;
      const tag = name;
      return [
        ['tag', tag, a.hash],
        () =>
          void vscode.window
            .showInformationMessage(`Tagged ${short(a.hash)} as ${tag}.`, 'Push to Remote')
            .then((push) => push && runAction(git, repo, { type: 'pushTag', name: tag }))
      ];
    }
    case 'deleteTag':
      return [['tag', '-d', a.name]];
    case 'pushTag': {
      const remote = await pickRemote(git, repo);
      return remote ? [['push', remote, a.name]] : null;
    }
    case 'stashPush': {
      const message = await ask('Stash message (optional, includes untracked files)');
      if (message === undefined) return null;
      return [['stash', 'push', '--include-untracked', ...(message ? ['-m', message] : [])]];
    }
    case 'stashApply':
      return [['stash', 'apply', a.selector]];
    case 'stashPop':
      return [['stash', 'pop', a.selector]];
    case 'stashDrop':
      return (await confirm(`Drop ${a.selector}? Its changes will be lost.`, 'Drop'))
        ? [['stash', 'drop', a.selector]]
        : null;
    case 'stashBranch': {
      const name = await ask(`Create a branch from ${a.selector}`);
      return name ? [['stash', 'branch', name, a.selector]] : null;
    }
    case 'unstageAll':
      return [['reset', '-q']];
    case 'discardAll': {
      const n = await changes(git, repo);
      return (await confirm(
        `Discard ${plural(n, 'uncommitted change')}, including untracked files? This can't be undone.`,
        'Discard All'
      ))
        ? [
            ['reset', '--hard', 'HEAD'],
            ['clean', '-fd']
          ]
        : null;
    }
    case 'fetch':
      return [['fetch', '--all', '--prune']];

    case 'newWorktree': {
      const [refs, worktrees, base] = await Promise.all([
        git.listRefs(repo),
        git.getWorktrees(repo),
        a.base ? Promise.resolve(a.base) : git.defaultBase(repo)
      ]);
      const checkedOut = new Set(worktrees.map((w) => w.branch));
      const locals = refs.filter((r) => r.ref.kind === 'head');
      const localNames = new Set(locals.map((r) => r.ref.name));
      const remotes = refs.filter((r) => r.ref.kind === 'remote');
      const localOf = (remote: string, name: string) => name.slice(remote.length + 1);
      type Choice = { branch?: string; remote?: string; from?: string | null };
      const sep = (label: string) => ({ label, kind: vscode.QuickPickItemKind.Separator });
      const items: (vscode.QuickPickItem & { choice?: Choice })[] = [
        ...(base ? [{ label: `$(add) New branch from ${base}…`, choice: { from: base } }] : []),
        { label: '$(git-branch) New branch from another branch…', choice: { from: null } },
        sep('Local branches'),
        ...locals
          .filter((r) => !checkedOut.has(r.ref.name))
          .map((r) => ({
            label: `$(git-branch) ${r.ref.name}`,
            description: `${ago(r.date)} · ${syncText(r.ref.upstream)}`,
            choice: { branch: r.ref.name }
          })),
        sep('Remote branches'),
        // A remote branch whose local branch exists is listed (or busy) as that local branch
        ...remotes
          .filter((r) => r.ref.remote && !localNames.has(localOf(r.ref.remote, r.ref.name)))
          .map((r) => ({
            label: `$(cloud) ${r.ref.name}`,
            description: `${ago(r.date)} · creates a local branch tracking it`,
            choice: { remote: r.ref.name }
          }))
      ];
      const choice = (
        await vscode.window.showQuickPick(items, {
          title: 'New worktree',
          placeHolder: 'Check out a branch in a new folder, or start a new branch',
          matchOnDescription: true,
          ignoreFocusOut: true
        })
      )?.choice;
      if (!choice) return null;

      if (choice.branch) {
        const dir = siblingFolder(repo, choice.branch);
        return [['worktree', 'add', dir, choice.branch], () => worktreeReady(dir)];
      }
      if (choice.remote) {
        const remote = remotes.find((r) => r.ref.name === choice.remote)!.ref.remote!;
        const local = localOf(remote, choice.remote);
        const dir = siblingFolder(repo, local);
        return [
          ['worktree', 'add', '--track', '-b', local, dir, choice.remote],
          () => worktreeReady(dir)
        ];
      }
      const from =
        choice.from ??
        (
          await vscode.window.showQuickPick(
            [...locals, ...remotes].map((r) => ({
              label: r.ref.name,
              description: ago(r.date)
            })),
            { title: 'New branch from…', ignoreFocusOut: true }
          )
        )?.label;
      if (!from) return null;
      const name = await askBranchName(git, repo, `New worktree branch from ${from}`, localNames);
      if (!name) return null;
      const dir = siblingFolder(repo, name);
      const fromRemote = remotes.find((r) => r.ref.name === from)?.ref.remote;
      return [
        // Start from the remote's latest state, not from whenever it was last fetched
        ...(fromRemote ? [['fetch', fromRemote, localOf(fromRemote, from)]] : []),
        // --no-track: the new branch must not push to the branch it started from
        ['worktree', 'add', '--no-track', '-b', name, dir, from],
        () => worktreeReady(dir)
      ];
    }
    case 'addWorktree': {
      const branch = a.isBranch
        ? a.target
        : a.detach
          ? ''
          : await ask('Branch for the new worktree (leave empty for a detached HEAD)', a.suggest);
      if (branch === undefined) return null;
      const dir = siblingFolder(
        repo,
        branch || (/^[0-9a-f]{40}$/.test(a.target) ? short(a.target) : a.target)
      );
      const add = a.isBranch
        ? ['worktree', 'add', dir, a.target]
        : ['worktree', 'add', ...(branch ? ['-b', branch] : ['--detach']), dir, a.target];
      return [add, a.open ? () => openFolder(dir) : () => worktreeReady(dir)];
    }
    case 'removeWorktree': {
      // One confirmation, only if something would be lost, listing everything that would be
      const [dirty, only] = await Promise.all([
        changes(git, a.path),
        a.deleteBranch ? uniqueCommits(git, repo, a.deleteBranch) : 0
      ]);
      const lost = [
        dirty && plural(dirty, 'uncommitted change'),
        only && `${plural(only, 'commit')} that only ${a.deleteBranch} contains`
      ].filter(Boolean);
      if (
        lost.length &&
        !(await confirm(
          `Remove ${folder(a.path)}${a.deleteBranch ? ` and delete ${a.deleteBranch}` : ''}? You'll lose ${lost.join(' and ')}.`,
          'Remove'
        ))
      )
        return null;
      return [
        ['worktree', 'remove', ...(dirty ? ['--force'] : []), a.path],
        ...(a.deleteBranch ? [['branch', '-D', a.deleteBranch]] : [])
      ];
    }
    case 'bringWorktreeHere': {
      const main = (await git.getWorktrees(repo))[0].path;
      const [dirty, mainDirty] = await Promise.all([changes(git, a.path), changes(git, main)]);
      if (mainDirty) {
        void vscode.window.showErrorMessage(
          `${folder(main)} has uncommitted changes: commit or stash them before bringing ${a.branch} there.`
        );
        return null;
      }
      // Uncommitted work travels through a stash (stashes are shared by all worktrees)
      return [
        ...(dirty
          ? [['-C', a.path, 'stash', 'push', '--include-untracked', '-m', `move ${a.branch}`]]
          : []),
        ['worktree', 'remove', a.path],
        ['-C', main, 'checkout', a.branch],
        ...(dirty ? [['-C', main, 'stash', 'pop']] : []),
        () =>
          void vscode.window.showInformationMessage(
            `${a.branch} is now checked out in ${folder(main)}${dirty ? ', with its uncommitted changes' : ''}.`
          )
      ];
    }
    case 'pruneWorktrees':
      return [['worktree', 'prune']];
  }
}

/** `onStart` fires once the prompts are answered and git is about to run (not if cancelled). */
export async function runAction(
  git: Git,
  repo: string,
  action: Action,
  onStart?: () => void
): Promise<void> {
  const steps = await plan(git, repo, action);
  if (!steps) return;
  onStart?.();
  const first = steps.find((s): s is string[] => Array.isArray(s))!;
  const name = `git ${first[0] === '-C' ? first[2] : first[0]}`;
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: name },
      async () => {
        for (const step of steps) await (Array.isArray(step) ? git.exec(repo, step) : step());
      }
    );
  } catch (e) {
    void vscode.window.showErrorMessage(`${name} failed: ${(e as Error).message}`);
  }
}
