/**
 * Context menu definitions, as data. Each item calls the host; prompts are
 * shown natively by VS Code, and only when needed (see extension/src/actions.ts).
 * A trailing "…" means the item asks something first. `hint` is the tooltip
 * shown when hovering the item: what it does, what to watch out for, the command.
 */
import {
  UNCOMMITTED,
  type Action,
  type Commit,
  type Ref,
  type RefSummary,
  type Worktree
} from '@treeline/shared';
import { app } from './app.svelte';
import type { Hint } from './components/Tip.svelte';
import { host } from './rpc';

export type MenuTarget =
  { kind: 'commit'; commit: Commit } | { kind: 'ref'; ref: Ref; commit: Commit };

export type MenuItem = { label: string; run: () => unknown; hint?: Hint } | 'separator';

const run = (action: Action) => () => app.repo && host.run(app.repo, action);
const copy = (text: string) => () => host.copy(text);
const sep = 'separator' as const;
/** Spread helper: `...when(cond, items)`. */
const when = (cond: unknown, items: MenuItem[]) => (cond ? items : []);
const short = (hash: string) => hash.slice(0, 8);
const repoName = () => app.repos.find((r) => r.path === app.repo)?.name ?? 'repo';
const REWRITES = 'Rewrites commits: if they were already pushed you will need to force push.';

export function menuItems(target: MenuTarget): MenuItem[] {
  const current = app.data?.currentBranch;
  const here = current ?? 'HEAD';
  const compareWith = (name: string): MenuItem => ({
    label: `Compare ${here} with ${name}`,
    run: () => app.setBase(name),
    hint: `Makes ${name} the base of the compare bar: see what ${here} has that ${name} doesn't (↑, green) and what ${name} has that ${here} doesn't (↓, blue).`
  });
  const merge = (name: string, label = name): MenuItem => ({
    label: `Merge into ${here}`,
    run: run({ type: 'merge', target: name }),
    hint: {
      body: `Brings the commits of ${label} that ${here} doesn't have into ${here}: a fast-forward when possible, otherwise a merge commit. Existing commits are untouched.`,
      warn: 'Conflicts stop the merge so you can resolve them.',
      command: `git merge --no-edit ${name}`
    }
  });
  const rebase = (name: string, label: string): MenuItem => ({
    label,
    run: run({ type: 'rebase', target: name }),
    hint: {
      body: `Replays the commits of ${here} on top of ${name}, for a straight history that includes everything in ${name}.`,
      warn: `${REWRITES} Conflicts pause the rebase.`,
      command: `git rebase ${name}`
    }
  });

  if (target.kind === 'ref') {
    const { ref } = target;
    switch (ref.kind) {
      case 'head': {
        const { worktree, upstream: up } = ref;
        const isCurrent = ref.name === current;
        return [
          // A branch checked out in another worktree can't be checked out or deleted here
          ...when(!isCurrent && !worktree, [
            {
              label: 'Checkout',
              run: run({ type: 'checkoutBranch', name: ref.name }),
              hint: {
                body: `Switches this folder to ${ref.name}. Uncommitted changes come along when they don't conflict.`,
                command: `git checkout ${ref.name}`
              }
            },
            {
              label: 'Add Worktree',
              run: run({ type: 'addWorktree', target: ref.name, isBranch: true }),
              hint: {
                body: `Checks ${ref.name} out in a new folder next to this repository, to work on it in parallel without switching branches here. Offers to open it when ready.`,
                command: `git worktree add ../${repoName()}-${ref.name.replace(/\//g, '-')} ${ref.name}`
              }
            }
          ]),
          ...worktreeItems(app.data?.worktrees.find((w) => w.path === worktree)),
          sep,
          ...when(!isCurrent, [
            compareWith(ref.name),
            merge(ref.name),
            rebase(ref.name, `Rebase ${here} onto ${ref.name}`),
            sep
          ]),
          ...when(up && !up.gone, [
            {
              label: up?.behind ? `Pull ↓${up.behind}` : 'Pull',
              run: run({ type: 'updateBranch', name: ref.name }),
              hint: isCurrent
                ? {
                    body: `Brings in the new commits of ${up?.name}, with your pull settings (merge or rebase).`,
                    command: 'git pull'
                  }
                : worktree
                  ? {
                      body: `Pulls ${up?.name} inside the worktree where ${ref.name} is checked out.`,
                      command: `git -C ${worktree} pull`
                    }
                  : {
                      body: `Fast-forwards ${ref.name} to ${up?.name} without checking it out.`,
                      warn: `Refused if ${ref.name} has commits that ${up?.name} doesn't: check it out and pull there.`,
                      command: `git fetch <remote> ${ref.name}:${ref.name}`
                    }
            }
          ]),
          {
            label: up?.ahead ? `Push ↑${up.ahead}` : 'Push',
            run: run({ type: 'pushBranch', name: ref.name }),
            hint: {
              body: up
                ? `Uploads ${ref.name}'s new commits to ${up.name}.`
                : `Uploads ${ref.name} to the remote and sets it as its upstream, so later pushes and pulls know where to go.`,
              command: `git push --set-upstream <remote> ${ref.name}`
            }
          },
          {
            label: 'Force Push…',
            run: run({ type: 'pushBranch', name: ref.name, force: true }),
            hint: {
              body: `Replaces the remote ${ref.name} with yours, after a rebase or an amend. With lease: refuses if someone pushed meanwhile.`,
              warn: "Commits on the remote that you don't have are lost. Asks first.",
              command: `git push --force-with-lease --set-upstream <remote> ${ref.name}`
            }
          },
          sep,
          {
            label: 'Rename…',
            run: run({ type: 'renameBranch', name: ref.name }),
            hint: {
              body: `Renames the local branch. A branch on the remote keeps its old name.`,
              command: `git branch -m ${ref.name} <new name>`
            }
          },
          ...when(!isCurrent && !worktree, [
            {
              label: 'Delete',
              run: run({ type: 'deleteBranch', name: ref.name }),
              hint: {
                body: `Deletes the local branch. Asks first only if it has commits that no other branch, remote branch or tag contains.`,
                command: `git branch -D ${ref.name}`
              }
            }
          ]),
          sep,
          { label: 'Copy Branch Name', run: copy(ref.name) }
        ];
      }
      case 'remote': {
        const local = ref.remote ? ref.name.slice(ref.remote.length + 1) : ref.name;
        return [
          {
            label: 'Checkout',
            run: run({ type: 'checkoutBranch', name: ref.name, remote: ref.remote }),
            hint: {
              body: `Switches to your local ${local}, creating it to track ${ref.name} if it doesn't exist yet.`,
              command: `git checkout --track ${ref.name}`
            }
          },
          {
            label: 'Add Worktree…',
            run: run({ type: 'addWorktree', target: ref.name, suggest: local }),
            hint: {
              body: `Creates a local branch from ${ref.name} (name suggested, editable) in a new folder next to this repository.`,
              command: `git worktree add -b ${local} ../${repoName()}-${local.replace(/\//g, '-')} ${ref.name}`
            }
          },
          sep,
          compareWith(ref.name),
          merge(ref.name),
          ...when(ref.remote, [
            {
              label: `Pull into ${here}`,
              run: run({ type: 'pullBranch', name: ref.name, remote: ref.remote! }),
              hint: {
                body: `Downloads the latest ${local} from ${ref.remote} and merges it into ${here}.`,
                command: `git pull ${ref.remote} ${local}`
              }
            },
            sep,
            {
              label: 'Delete Remote Branch…',
              run: run({ type: 'deleteRemoteBranch', name: ref.name, remote: ref.remote! }),
              hint: {
                body: `Deletes ${local} on ${ref.remote}, for everyone. Your local branch, if any, stays.`,
                warn: 'Affects everyone using the remote. Asks first.',
                command: `git push ${ref.remote} --delete ${local}`
              }
            }
          ]),
          sep,
          { label: 'Copy Branch Name', run: copy(ref.name) }
        ];
      }
      case 'tag':
        return [
          compareWith(ref.name),
          sep,
          {
            label: 'Push Tag',
            run: run({ type: 'pushTag', name: ref.name }),
            hint: {
              body: 'Uploads the tag to the remote.',
              command: `git push <remote> ${ref.name}`
            }
          },
          {
            label: 'Delete Tag',
            run: run({ type: 'deleteTag', name: ref.name }),
            hint: {
              body: 'Deletes the local tag. A tag already pushed stays on the remote.',
              command: `git tag -d ${ref.name}`
            }
          },
          sep,
          { label: 'Copy Tag Name', run: copy(ref.name) }
        ];
      case 'stash':
        return stashItems(target.commit, ref.name);
    }
  }

  const { commit } = target;
  if (commit.hash === UNCOMMITTED) {
    return [
      {
        label: 'Generate Commit Message with Claude',
        run: () => app.repo && host.generateCommitMessage(app.repo),
        hint: {
          body: 'Writes a message for the staged changes (or all of them if nothing is staged) with your local Claude Code CLI, in the style of your recent commits, and puts it in the Source Control box. Review it, then commit with ⌘/Ctrl+Enter.',
          command: 'claude -p --model haiku < diff'
        }
      },
      {
        label: 'Open Source Control',
        run: () => host.openScm(),
        hint: 'Opens the Source Control view to stage files and commit.'
      },
      sep,
      {
        label: 'Stash…',
        run: run({ type: 'stashPush' }),
        hint: {
          body: 'Saves every uncommitted change, untracked files included, and leaves the working tree clean. The message is optional.',
          command: 'git stash push --include-untracked'
        }
      },
      {
        label: 'Unstage All',
        run: run({ type: 'unstageAll' }),
        hint: {
          body: 'Moves every staged change back to unstaged. Nothing is lost.',
          command: 'git reset'
        }
      },
      {
        label: 'Discard All Changes…',
        run: run({ type: 'discardAll' }),
        hint: {
          body: 'Throws away every uncommitted change and every untracked file.',
          warn: "Can't be undone. Asks first.",
          command: 'git reset --hard HEAD && git clean -fd'
        }
      }
    ];
  }
  const stash = commit.refs.find((r) => r.kind === 'stash');
  if (stash) return stashItems(commit, stash.name);

  const at = short(commit.hash);
  const mainline = commit.parents.length > 1 ? '-m 1 ' : '';
  return [
    {
      label: 'Create Branch…',
      run: run({ type: 'createBranch', hash: commit.hash }),
      hint: {
        body: `Creates a branch at ${at} and switches to it.`,
        command: `git checkout -b <name> ${at}`
      }
    },
    {
      label: 'Add Tag…',
      run: run({ type: 'addTag', hash: commit.hash }),
      hint: {
        body: `Tags ${at}. Suggests the next version after your latest one (patch, minor, major), or any name you type; then offers to push it.`,
        command: `git tag <name> ${at}`
      }
    },
    {
      label: 'Open in Temporary Worktree',
      run: run({ type: 'addWorktree', target: commit.hash, detach: true, open: true }),
      hint: {
        body: `Checks ${at} out in a new folder and opens it in a new window: a real checkout, so Go to Definition, errors and builds work on that version. Remove the worktree when you're done.`,
        command: `git worktree add --detach ../${repoName()}-${at} ${at}`
      }
    },
    {
      label: 'Add Worktree…',
      run: run({ type: 'addWorktree', target: commit.hash }),
      hint: {
        body: `Creates a new branch at ${at} in a new folder next to this repository (leave the name empty for a detached HEAD).`,
        command: `git worktree add -b <name> ../${repoName()}-<name> ${at}`
      }
    },
    sep,
    {
      label: 'Checkout (Detached)',
      run: run({ type: 'checkoutCommit', hash: commit.hash }),
      hint: {
        body: `Moves this folder to ${at} without a branch ("detached HEAD"): fine to look around or build. Create a branch before committing.`,
        command: `git checkout ${at}`
      }
    },
    {
      label: `Cherry Pick into ${here}`,
      run: run({ type: 'cherryPick', hash: commit.hash, parents: commit.parents.length }),
      hint: {
        body: `Copies the changes of ${at} onto ${here} as a new commit.${mainline ? ' For a merge commit, relative to its first parent.' : ''}`,
        warn: 'Conflicts stop the cherry-pick so you can resolve them.',
        command: `git cherry-pick ${mainline}${at}`
      }
    },
    {
      label: 'Revert',
      run: run({ type: 'revert', hash: commit.hash, parents: commit.parents.length }),
      hint: {
        body: `Adds a new commit to ${here} that undoes ${at}. History is kept, so it's safe on shared branches.`,
        command: `git revert --no-edit ${mainline}${at}`
      }
    },
    sep,
    merge(commit.hash, at),
    rebase(commit.hash, `Rebase ${here} onto this Commit`),
    {
      label: `Reset ${here} to this Commit…`,
      run: run({ type: 'reset', hash: commit.hash }),
      hint: {
        body: `Moves ${here} back (or forward) to ${at}. You pick: Soft keeps the changes staged, Mixed keeps them unstaged, Hard discards them.`,
        warn: 'Commits after it leave the branch (the reflog keeps them for a while). Hard asks first when there are uncommitted changes.',
        command: `git reset --soft|--mixed|--hard ${at}`
      }
    },
    sep,
    { label: 'Copy Commit Hash', run: copy(commit.hash) },
    { label: 'Copy Commit Subject', run: copy(commit.subject) }
  ];
}

/** The loaded commit a branch or tag points to, or a stand-in carrying what the menus need. */
export const refCommit = (r: RefSummary): Commit =>
  app.data?.commits.find((c) => c.hash === r.hash) ?? {
    hash: r.hash,
    parents: [],
    author: '',
    email: '',
    date: r.date,
    subject: r.subject,
    refs: []
  };

/** Actions on a worktree: from the worktree strip and from the badge of the branch it has checked out. */
export function worktreeItems(w: Worktree | undefined): MenuItem[] {
  if (!w) return [];
  if (w.prunable)
    return [
      {
        label: 'Prune Missing Worktrees',
        run: run({ type: 'pruneWorktrees' }),
        hint: {
          body: "Forgets worktrees whose folder was deleted by hand. Branches aren't touched.",
          command: 'git worktree prune'
        }
      }
    ];
  const other = !w.main && !w.current;
  const main = app.data?.worktrees[0]?.path.split(/[\\/]/).pop() ?? 'the main folder';
  return [
    ...when(!w.current, [
      {
        label: 'Open Worktree in New Window',
        run: () => host.openFolder(w.path),
        hint: `Opens ${w.path} in a new editor window.`
      }
    ]),
    ...when(other && w.branch, [
      {
        label: 'Bring to Main Worktree',
        run: run({ type: 'bringWorktreeHere', path: w.path, branch: w.branch! }),
        hint: {
          body: `Removes this worktree and checks ${w.branch} out in ${main}, carrying its uncommitted changes along (through a stash). Nothing to confirm.`,
          warn: `${main} must have no uncommitted changes of its own.`,
          command: `git stash -u · git worktree remove · git checkout ${w.branch} · git stash pop`
        }
      }
    ]),
    ...when(other, [
      {
        label: 'Remove Worktree',
        run: run({ type: 'removeWorktree', path: w.path }),
        hint: {
          body: 'Deletes the worktree folder; the branch stays. Asks first only if the folder has uncommitted changes.',
          command: `git worktree remove ${w.path}`
        }
      },
      ...when(w.branch, [
        {
          label: 'Remove Worktree and Delete Branch',
          run: run({ type: 'removeWorktree', path: w.path, deleteBranch: w.branch! }),
          hint: {
            body: `Deletes the folder and ${w.branch} in one go. Asks once, listing what would be lost: uncommitted changes, commits that only this branch has.`,
            command: `git worktree remove ${w.path} && git branch -D ${w.branch}`
          }
        }
      ])
    ]),
    sep,
    { label: 'Copy Worktree Path', run: copy(w.path) }
  ];
}

function stashItems(commit: Commit, selector: string): MenuItem[] {
  return [
    {
      label: 'Apply Stash',
      run: run({ type: 'stashApply', selector }),
      hint: {
        body: 'Restores the stashed changes into the working tree and keeps the stash.',
        command: `git stash apply ${selector}`
      }
    },
    {
      label: 'Pop Stash',
      run: run({ type: 'stashPop', selector }),
      hint: {
        body: 'Restores the stashed changes and deletes the stash when they apply cleanly.',
        command: `git stash pop ${selector}`
      }
    },
    {
      label: 'Create Branch from Stash…',
      run: run({ type: 'stashBranch', selector }),
      hint: {
        body: 'Creates a branch at the commit the stash was taken on, restores the stash there and drops it. Handy when it no longer applies cleanly.',
        command: `git stash branch <name> ${selector}`
      }
    },
    {
      label: 'Drop Stash…',
      run: run({ type: 'stashDrop', selector }),
      hint: {
        body: 'Deletes the stash.',
        warn: 'Its changes are lost. Asks first.',
        command: `git stash drop ${selector}`
      }
    },
    sep,
    { label: 'Copy Stash Name', run: copy(selector) },
    { label: 'Copy Stash Hash', run: copy(commit.hash) }
  ];
}
