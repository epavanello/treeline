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
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpToLine,
  Cherry,
  Copy,
  Crosshair,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  FolderInput,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  FolderX,
  GitBranchPlus,
  GitCommitHorizontal,
  GitCompare,
  GitMerge,
  GitPullRequest,
  Layers,
  ListFilter,
  ListMinus,
  LogIn,
  Minus,
  PackageOpen,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  Undo2
} from '@lucide/svelte';
import { app } from './app.svelte';
import type { Hint } from './components/Tip.svelte';
import { isBase, pullsOf } from './filters';
import { host } from './rpc';

export type MenuTarget =
  { kind: 'commit'; commit: Commit } | { kind: 'ref'; ref: Ref; commit: Commit };

type Icon = typeof Copy;
/**
 * An action, a submenu (`items`) or a separator. `icon` sits before the label; `destructive` items
 * (deleting, discarding) are drawn in the warning color.
 */
export type MenuItem =
  | { label: string; run: () => unknown; hint?: Hint; icon?: Icon; destructive?: boolean }
  | { label: string; items: MenuItem[]; icon?: Icon; destructive?: boolean }
  | 'separator';

const run = (action: Action) => () => app.run(action);
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
  const compareWith = (name: string, label = `Compare ${here} with ${name}`): MenuItem => ({
    label,
    icon: GitCompare,
    run: () => app.setBase(name),
    hint: `Makes ${name} the base of the compare bar: see what ${here} has that ${name} doesn't (↑, green) and what ${name} has that ${here} doesn't (↓, blue).`
  });
  const merge = (name: string, label = name): MenuItem => ({
    label: `Merge into ${here}`,
    icon: GitMerge,
    run: run({ type: 'merge', target: name }),
    hint: {
      body: `Brings the commits of ${label} that ${here} doesn't have into ${here}: a fast-forward when possible, otherwise a merge commit. Existing commits are untouched.`,
      warn: 'Conflicts stop the merge so you can resolve them.',
      command: `git merge --no-edit ${name}`
    }
  });
  const rebase = (name: string, label: string): MenuItem => ({
    label,
    icon: Layers,
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
              icon: LogIn,
              run: run({ type: 'checkoutBranch', name: ref.name }),
              hint: {
                body: `Switches this folder to ${ref.name}. Uncommitted changes come along when they don't conflict.`,
                command: `git checkout ${ref.name}`
              }
            },
            {
              label: 'Add Worktree',
              icon: FolderPlus,
              run: run({ type: 'addWorktree', target: ref.name, isBranch: true }),
              hint: {
                body: `Checks ${ref.name} out in a new folder next to this repository, to work on it in parallel without switching branches here. Offers to open it when ready.`,
                command: `git worktree add ../${repoName()}-${ref.name.replace(/\//g, '-')} ${ref.name}`
              }
            }
          ]),
          ...worktreeItems(app.data?.worktrees.find((w) => w.path === worktree)),
          sep,
          visibility(ref.name),
          ...when(!isCurrent, [
            {
              label: `With ${here}`,
              icon: GitCompare,
              items: [
                compareWith(ref.name, 'Compare'),
                merge(ref.name),
                rebase(ref.name, `Rebase ${here} onto it`)
              ]
            }
          ]),
          sep,
          ...when(up && !up.gone, [
            {
              label: up?.behind ? `Pull ↓${up.behind}` : 'Pull',
              icon: ArrowDownToLine,
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
            icon: ArrowUpFromLine,
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
            icon: ArrowUpToLine,
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
            icon: Pencil,
            run: run({ type: 'renameBranch', name: ref.name }),
            hint: {
              body: `Renames the local branch. A branch on the remote keeps its old name.`,
              command: `git branch -m ${ref.name} <new name>`
            }
          },
          ...deleteItems(ref),
          ...pullItems(ref),
          sep,
          { label: 'Copy Branch Name', icon: Copy, run: copy(ref.name) }
        ];
      }
      case 'remote': {
        const local = ref.remote ? ref.name.slice(ref.remote.length + 1) : ref.name;
        return [
          {
            label: 'Checkout',
            icon: LogIn,
            run: run({ type: 'checkoutBranch', name: ref.name, remote: ref.remote }),
            hint: {
              body: `Switches to your local ${local}, creating it to track ${ref.name} if it doesn't exist yet.`,
              command: `git checkout --track ${ref.name}`
            }
          },
          {
            label: 'Add Worktree…',
            icon: FolderPlus,
            run: run({ type: 'addWorktree', target: ref.name, suggest: local }),
            hint: {
              body: `Creates a local branch from ${ref.name} (name suggested, editable) in a new folder next to this repository.`,
              command: `git worktree add -b ${local} ../${repoName()}-${local.replace(/\//g, '-')} ${ref.name}`
            }
          },
          sep,
          visibility(ref.name),
          {
            label: `With ${here}`,
            icon: GitCompare,
            items: [
              compareWith(ref.name, 'Compare'),
              merge(ref.name),
              ...when(ref.remote, [
                {
                  label: `Pull into ${here}`,
                  icon: ArrowDownToLine,
                  run: run({ type: 'pullBranch', name: ref.name, remote: ref.remote! }),
                  hint: {
                    body: `Downloads the latest ${local} from ${ref.remote} and merges it into ${here}.`,
                    command: `git pull ${ref.remote} ${local}`
                  }
                }
              ])
            ]
          },
          ...deleteItems(ref),
          ...pullItems(ref),
          sep,
          { label: 'Copy Branch Name', icon: Copy, run: copy(ref.name) }
        ];
      }
      case 'tag':
        return [
          compareWith(ref.name),
          sep,
          {
            label: 'Push Tag',
            icon: ArrowUpFromLine,
            run: run({ type: 'pushTag', name: ref.name }),
            hint: {
              body: 'Uploads the tag to the remote.',
              command: `git push <remote> ${ref.name}`
            }
          },
          {
            label: 'Delete Tag',
            icon: Trash2,
            destructive: true,
            run: run({ type: 'deleteTag', name: ref.name }),
            hint: {
              body: 'Deletes the local tag. A tag already pushed stays on the remote.',
              command: `git tag -d ${ref.name}`
            }
          },
          sep,
          { label: 'Copy Tag Name', icon: Copy, run: copy(ref.name) }
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
        icon: Sparkles,
        run: () => app.repo && host.generateCommitMessage(app.repo),
        hint: {
          body: 'Writes a message for the staged changes (or all of them if nothing is staged) with your local Claude Code CLI, in the style of your recent commits, and puts it in the Source Control box. Review it, then commit with ⌘/Ctrl+Enter.',
          command: 'claude -p --model haiku < diff'
        }
      },
      {
        label: 'Open Source Control',
        icon: GitCommitHorizontal,
        run: () => host.openScm(),
        hint: 'Opens the Source Control view to stage files and commit.'
      },
      sep,
      {
        label: 'Stash…',
        icon: Archive,
        run: run({ type: 'stashPush' }),
        hint: {
          body: 'Saves every uncommitted change, untracked files included, and leaves the working tree clean. The message is optional.',
          command: 'git stash push --include-untracked'
        }
      },
      {
        label: 'Unstage All',
        icon: ListMinus,
        run: run({ type: 'unstageAll' }),
        hint: {
          body: 'Moves every staged change back to unstaged. Nothing is lost.',
          command: 'git reset'
        }
      },
      {
        label: 'Discard All Changes…',
        icon: Trash2,
        destructive: true,
        run: run({ type: 'discardAll' }),
        hint: {
          body: 'Throws away every uncommitted change and every untracked file.',
          warn: "Can't be undone. Asks first.",
          command: 'git reset --hard HEAD && git clean -fd'
        }
      }
    ];
  }
  if (commit.worktree)
    return worktreeItems(app.data?.worktrees.find((w) => w.path === commit.worktree));
  const stash = commit.refs.find((r) => r.kind === 'stash');
  if (stash) return stashItems(commit, stash.name);

  const at = short(commit.hash);
  const mainline = commit.parents.length > 1 ? '-m 1 ' : '';
  return [
    {
      label: 'Create Branch…',
      icon: GitBranchPlus,
      run: run({ type: 'createBranch', hash: commit.hash }),
      hint: {
        body: `Creates a branch at ${at} and switches to it.`,
        command: `git checkout -b <name> ${at}`
      }
    },
    {
      label: 'Add Tag…',
      icon: Tag,
      run: run({ type: 'addTag', hash: commit.hash }),
      hint: {
        body: `Tags ${at}. Suggests the next version after your latest one (patch, minor, major), or any name you type; then offers to push it.`,
        command: `git tag <name> ${at}`
      }
    },
    {
      label: 'Open in Temporary Worktree',
      icon: FolderOpen,
      run: run({ type: 'addWorktree', target: commit.hash, detach: true, open: true }),
      hint: {
        body: `Checks ${at} out in a new folder and opens it in a new window: a real checkout, so Go to Definition, errors and builds work on that version. Remove the worktree when you're done.`,
        command: `git worktree add --detach ../${repoName()}-${at} ${at}`
      }
    },
    {
      label: 'Add Worktree…',
      icon: FolderPlus,
      run: run({ type: 'addWorktree', target: commit.hash }),
      hint: {
        body: `Creates a new branch at ${at} in a new folder next to this repository (leave the name empty for a detached HEAD).`,
        command: `git worktree add -b <name> ../${repoName()}-<name> ${at}`
      }
    },
    sep,
    {
      label: 'Checkout (Detached)',
      icon: LogIn,
      run: run({ type: 'checkoutCommit', hash: commit.hash }),
      hint: {
        body: `Moves this folder to ${at} without a branch ("detached HEAD"): fine to look around or build. Create a branch before committing.`,
        command: `git checkout ${at}`
      }
    },
    {
      label: `Cherry Pick into ${here}`,
      icon: Cherry,
      run: run({ type: 'cherryPick', hash: commit.hash, parents: commit.parents.length }),
      hint: {
        body: `Copies the changes of ${at} onto ${here} as a new commit.${mainline ? ' For a merge commit, relative to its first parent.' : ''}`,
        warn: 'Conflicts stop the cherry-pick so you can resolve them.',
        command: `git cherry-pick ${mainline}${at}`
      }
    },
    {
      label: 'Revert',
      icon: Undo2,
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
      icon: RotateCcw,
      run: run({ type: 'reset', hash: commit.hash }),
      hint: {
        body: `Moves ${here} back (or forward) to ${at}. You pick: Soft keeps the changes staged, Mixed keeps them unstaged, Hard discards them.`,
        warn: 'Commits after it leave the branch (the reflog keeps them for a while). Hard asks first when there are uncommitted changes.',
        command: `git reset --soft|--mixed|--hard ${at}`
      }
    },
    sep,
    { label: 'Copy Commit Hash', icon: Copy, run: copy(commit.hash) },
    { label: 'Copy Commit Subject', icon: Copy, run: copy(commit.subject) }
  ];
}

/** Show only a branch, add it to or remove it from the shown ones, or hide it from "all". */
function visibility(name: string): MenuItem {
  const shown = app.branches.includes(name);
  const hidden = app.hidden.includes(name);
  return {
    label: 'Graph Filter',
    icon: ListFilter,
    items: [
      ...when(!(shown && app.branches.length === 1), [
        {
          label: 'Show Only This Branch',
          icon: Crosshair,
          run: () => app.setBranches([name]),
          hint: `The graph shows just the history of ${name}.`
        }
      ]),
      ...when(app.branches.length && !shown, [
        {
          label: 'Also Show This Branch',
          icon: Plus,
          run: () => app.setBranches([...app.branches, name]),
          hint: `Adds ${name} to the branches the graph shows.`
        }
      ]),
      ...when(shown, [
        {
          label: 'Stop Showing This Branch',
          icon: Minus,
          run: () => app.setBranches(app.branches.filter((b) => b !== name)),
          hint: `Removes ${name} from the branches the graph shows.`
        }
      ]),
      hidden
        ? {
            label: 'Unhide This Branch',
            icon: Eye,
            run: () => app.toggleHidden(name),
            hint: `Brings the commits only ${name} has back into the graph.`
          }
        : {
            label: 'Hide This Branch',
            icon: EyeOff,
            run: () => app.toggleHidden(name),
            hint: `Leaves out the commits only ${name} has; what it shares with other branches stays. Undo it from the Branches filter or this menu.`
          }
    ]
  };
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
        icon: Eraser,
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
        icon: ExternalLink,
        run: () => host.openFolder(w.path),
        hint: `Opens ${w.path} in a new editor window.`
      }
    ]),
    ...when(other && w.branch, [
      {
        label: 'Bring to Main Worktree',
        icon: FolderInput,
        run: run({ type: 'bringWorktreeHere', path: w.path, branch: w.branch! }),
        hint: {
          body: `Removes this worktree and checks ${w.branch} out in ${main}, carrying its uncommitted changes along (through a stash). Nothing to confirm.`,
          warn: `${main} must have no uncommitted changes of its own.`,
          command: `git stash -u · git worktree remove · git checkout ${w.branch} · git stash pop`
        }
      }
    ]),
    ...when(other, [removeWorktree(w)]),
    sep,
    { label: 'Copy Worktree Path', icon: Copy, run: copy(w.path) }
  ];
}

function stashItems(commit: Commit, selector: string): MenuItem[] {
  return [
    {
      label: 'Apply Stash',
      icon: ArchiveRestore,
      run: run({ type: 'stashApply', selector }),
      hint: {
        body: 'Restores the stashed changes into the working tree and keeps the stash.',
        command: `git stash apply ${selector}`
      }
    },
    {
      label: 'Pop Stash',
      icon: PackageOpen,
      run: run({ type: 'stashPop', selector }),
      hint: {
        body: 'Restores the stashed changes and deletes the stash when they apply cleanly.',
        command: `git stash pop ${selector}`
      }
    },
    {
      label: 'Create Branch from Stash…',
      icon: GitBranchPlus,
      run: run({ type: 'stashBranch', selector }),
      hint: {
        body: 'Creates a branch at the commit the stash was taken on, restores the stash there and drops it. Handy when it no longer applies cleanly.',
        command: `git stash branch <name> ${selector}`
      }
    },
    {
      label: 'Drop Stash…',
      icon: Trash2,
      destructive: true,
      run: run({ type: 'stashDrop', selector }),
      hint: {
        body: 'Deletes the stash.',
        warn: 'Its changes are lost. Asks first.',
        command: `git stash drop ${selector}`
      }
    },
    sep,
    { label: 'Copy Stash Name', icon: Copy, run: copy(selector) },
    { label: 'Copy Stash Hash', icon: Copy, run: copy(commit.hash) }
  ];
}

const PR_STATE = { open: 'Open', draft: 'Draft', merged: 'Merged', closed: 'Closed' } as const;

/** The pull requests opened from the branch: one item, or a submenu when there are several. */
function pullItems(ref: Ref): MenuItem[] {
  const row = app.rowOf.get(ref.name);
  const prs = row ? pullsOf(row, app.filterContext.pulls).slice(0, 5) : [];
  const item = (p: (typeof prs)[number], label: string): MenuItem => ({
    label,
    icon: GitPullRequest,
    run: () => host.openUrl(p.url),
    hint: { title: p.title, body: `${PR_STATE[p.state]}, by ${p.author}. Opens it on GitHub.` }
  });
  if (prs.length < 2) return [sep, ...prs.map((p) => item(p, `Open Pull Request #${p.number}`))];
  return [
    sep,
    {
      label: 'Pull Requests',
      icon: GitPullRequest,
      items: prs.map((p) => item(p, `#${p.number} ${PR_STATE[p.state].toLowerCase()}: ${p.title}`))
    }
  ];
}

/**
 * Deleting a branch, whichever copies there are: the local one (asks only if commits would be
 * lost), the remote one (always asks: it's gone for everyone), or both at once (one confirmation).
 * One item when only one of them can go, a submenu otherwise.
 */
function deleteItems(ref: Ref): MenuItem[] {
  const row = app.rowOf.get(ref.name);
  const local = row?.local ?? (ref.kind === 'head' ? { ref } : undefined);
  const remote = row?.remote ?? (ref.kind === 'remote' ? { ref } : undefined);
  const base = app.data?.compare?.base;
  const localOk =
    !!local &&
    !local.ref.worktree &&
    local.ref.name !== app.data?.currentBranch &&
    !(row?.local && isBase(row.local, base));
  const remoteOk = !!remote?.ref.remote && !(row?.remote && isBase(row.remote, base));
  const r = remote?.ref;
  const short = r?.remote ? r.name.slice(r.remote.length + 1) : '';
  const localItem = (label: string): MenuItem => ({
    label,
    icon: Trash2,
    destructive: true,
    run: run({ type: 'deleteBranch', name: local!.ref.name }),
    hint: {
      body: `Deletes your local ${local!.ref.name}. Asks first only if it has commits that no other branch, remote branch or tag contains.`,
      command: `git branch -D ${local!.ref.name}`
    }
  });
  const remoteItem = (label: string): MenuItem => ({
    label,
    icon: Trash2,
    destructive: true,
    run: run({ type: 'deleteRemoteBranch', name: r!.name, remote: r!.remote! }),
    hint: {
      body: `Deletes ${short} on ${r!.remote}, for everyone.${localOk ? ' Your local branch stays.' : ''}`,
      warn: 'Affects everyone using the remote. Asks first.',
      command: `git push ${r!.remote} --delete ${short}`
    }
  });
  if (localOk && remoteOk)
    return [
      sep,
      {
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        items: [
          {
            label: 'Local and Remote…',
            icon: Trash2,
            destructive: true,
            run: run({
              type: 'deleteBranches',
              local: [local!.ref.name],
              remote: [{ name: r!.name, remote: r!.remote! }]
            }),
            hint: {
              body: `Deletes ${local!.ref.name} here and on ${r!.remote}, after one confirmation saying what would be lost.`,
              command: `git branch -D ${local!.ref.name} · git push ${r!.remote} --delete ${short}`
            }
          },
          localItem('Only Local'),
          remoteItem(`Only on ${r!.remote}…`)
        ]
      }
    ];
  if (localOk) return [sep, localItem('Delete')];
  if (remoteOk) return [sep, remoteItem('Delete Remote Branch…')];
  return [];
}

/**
 * Removing a worktree: just the folder, or its branch too, or its branch and the branch's copy on the
 * remote. One item when it has no branch, a submenu otherwise.
 */
function removeWorktree(w: Worktree): MenuItem {
  const folderOnly: MenuItem = {
    label: w.branch ? 'Only the Folder' : 'Remove Worktree',
    icon: FolderMinus,
    destructive: true,
    run: run({ type: 'removeWorktree', path: w.path }),
    hint: {
      body: `Deletes the worktree folder${w.branch ? `; ${w.branch} stays` : ''}. Asks first only if the folder has uncommitted changes.`,
      command: `git worktree remove ${w.path}`
    }
  };
  if (!w.branch) return folderOnly;
  const remote = app.rowOf.get(w.branch)?.remote?.ref;
  const short = remote?.remote ? remote.name.slice(remote.remote.length + 1) : '';
  return {
    label: 'Remove Worktree',
    icon: FolderMinus,
    destructive: true,
    items: [
      folderOnly,
      {
        label: 'And Its Branch',
        icon: FolderX,
        destructive: true,
        run: run({ type: 'removeWorktree', path: w.path, deleteBranch: w.branch }),
        hint: {
          body: `Deletes the folder and ${w.branch} in one go${remote ? `; ${remote.name} stays on the remote` : ''}. Asks once, only if something would be lost: uncommitted changes, commits that only this branch has.`,
          command: `git worktree remove ${w.path} && git branch -D ${w.branch}`
        }
      },
      ...when(remote?.remote, [
        {
          label: `And Its Branch, on ${remote?.remote} Too…`,
          icon: Trash2,
          destructive: true,
          run: run({
            type: 'removeWorktree',
            path: w.path,
            deleteBranch: w.branch,
            deleteRemote: { name: remote!.name, remote: remote!.remote! }
          }),
          hint: {
            body: `Deletes the folder, ${w.branch}, and ${short} on ${remote?.remote}: what you do once its pull request is merged.`,
            warn: 'Deleting on the remote affects everyone. Asks first.',
            command: `git worktree remove ${w.path} · git branch -D ${w.branch} · git push ${remote?.remote} --delete ${short}`
          }
        }
      ])
    ]
  };
}
