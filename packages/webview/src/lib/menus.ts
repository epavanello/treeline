/**
 * Context menu definitions, as data. Each item calls the host; prompts are
 * shown natively by VS Code, and only when needed (see extension/src/actions.ts).
 * A trailing "…" means the item asks something first.
 */
import { UNCOMMITTED, type Action, type Commit, type Ref, type Worktree } from '@treeline/shared';
import { app } from './app.svelte';
import { host } from './rpc';

export type MenuTarget =
  { kind: 'commit'; commit: Commit } | { kind: 'ref'; ref: Ref; commit: Commit };

export type MenuItem = { label: string; run: () => unknown } | 'separator';

const run = (action: Action) => () => app.repo && host.run(app.repo, action);
const copy = (text: string) => () => host.copy(text);
const sep = 'separator' as const;
/** Spread helper: `...when(cond, items)`. */
const when = (cond: unknown, items: MenuItem[]) => (cond ? items : []);

export function menuItems(target: MenuTarget): MenuItem[] {
  const current = app.data?.currentBranch;
  const here = current ?? 'HEAD';
  const compareWith = (name: string): MenuItem => ({
    label: `Compare ${here} with ${name}`,
    run: () => app.setBase(name)
  });

  if (target.kind === 'ref') {
    const { ref } = target;
    switch (ref.kind) {
      case 'head': {
        const { worktree } = ref;
        const isCurrent = ref.name === current;
        return [
          // A branch checked out in another worktree can't be checked out or deleted here
          ...when(!isCurrent && !worktree, [
            { label: 'Checkout', run: run({ type: 'checkoutBranch', name: ref.name }) },
            {
              label: 'Add Worktree',
              run: run({ type: 'addWorktree', target: ref.name, isBranch: true })
            }
          ]),
          ...worktreeItems(app.data?.worktrees.find((w) => w.path === worktree)),
          sep,
          ...when(!isCurrent, [
            compareWith(ref.name),
            { label: `Merge into ${here}`, run: run({ type: 'merge', target: ref.name }) },
            {
              label: `Rebase ${here} onto ${ref.name}`,
              run: run({ type: 'rebase', target: ref.name })
            },
            sep
          ]),
          { label: 'Push', run: run({ type: 'pushBranch', name: ref.name }) },
          { label: 'Force Push…', run: run({ type: 'pushBranch', name: ref.name, force: true }) },
          sep,
          { label: 'Rename…', run: run({ type: 'renameBranch', name: ref.name }) },
          ...when(!isCurrent && !worktree, [
            { label: 'Delete', run: run({ type: 'deleteBranch', name: ref.name }) }
          ]),
          sep,
          { label: 'Copy Branch Name', run: copy(ref.name) }
        ];
      }
      case 'remote':
        return [
          {
            label: 'Checkout',
            run: run({ type: 'checkoutBranch', name: ref.name, remote: ref.remote })
          },
          {
            label: 'Add Worktree…',
            run: run({
              type: 'addWorktree',
              target: ref.name,
              suggest: ref.remote ? ref.name.slice(ref.remote.length + 1) : ref.name
            })
          },
          sep,
          compareWith(ref.name),
          { label: `Merge into ${here}`, run: run({ type: 'merge', target: ref.name }) },
          ...when(ref.remote, [
            {
              label: `Pull into ${here}`,
              run: run({ type: 'pullBranch', name: ref.name, remote: ref.remote! })
            },
            sep,
            {
              label: 'Delete Remote Branch…',
              run: run({ type: 'deleteRemoteBranch', name: ref.name, remote: ref.remote! })
            }
          ]),
          sep,
          { label: 'Copy Branch Name', run: copy(ref.name) }
        ];
      case 'tag':
        return [
          compareWith(ref.name),
          sep,
          { label: 'Push Tag', run: run({ type: 'pushTag', name: ref.name }) },
          { label: 'Delete Tag', run: run({ type: 'deleteTag', name: ref.name }) },
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
        run: () => app.repo && host.generateCommitMessage(app.repo)
      },
      { label: 'Open Source Control', run: () => host.openScm() },
      sep,
      { label: 'Stash…', run: run({ type: 'stashPush' }) },
      { label: 'Unstage All', run: run({ type: 'unstageAll' }) },
      { label: 'Discard All Changes…', run: run({ type: 'discardAll' }) }
    ];
  }
  const stash = commit.refs.find((r) => r.kind === 'stash');
  if (stash) return stashItems(commit, stash.name);

  return [
    { label: 'Create Branch…', run: run({ type: 'createBranch', hash: commit.hash }) },
    { label: 'Add Tag…', run: run({ type: 'addTag', hash: commit.hash }) },
    {
      // A real checkout in its own window: full language features at that revision
      label: 'Open in Temporary Worktree',
      run: run({ type: 'addWorktree', target: commit.hash, detach: true, open: true })
    },
    { label: 'Add Worktree…', run: run({ type: 'addWorktree', target: commit.hash }) },
    sep,
    { label: 'Checkout (Detached)', run: run({ type: 'checkoutCommit', hash: commit.hash }) },
    {
      label: `Cherry Pick into ${here}`,
      run: run({ type: 'cherryPick', hash: commit.hash, parents: commit.parents.length })
    },
    {
      label: 'Revert',
      run: run({ type: 'revert', hash: commit.hash, parents: commit.parents.length })
    },
    sep,
    { label: `Merge into ${here}`, run: run({ type: 'merge', target: commit.hash }) },
    { label: `Rebase ${here} onto this Commit`, run: run({ type: 'rebase', target: commit.hash }) },
    { label: `Reset ${here} to this Commit…`, run: run({ type: 'reset', hash: commit.hash }) },
    sep,
    { label: 'Copy Commit Hash', run: copy(commit.hash) },
    { label: 'Copy Commit Subject', run: copy(commit.subject) }
  ];
}

/** Actions on a worktree: from the worktree strip and from the badge of the branch it has checked out. */
export function worktreeItems(w: Worktree | undefined): MenuItem[] {
  if (!w) return [];
  if (w.prunable)
    return [{ label: 'Prune Missing Worktrees', run: run({ type: 'pruneWorktrees' }) }];
  const other = !w.main && !w.current;
  return [
    ...when(!w.current, [
      { label: 'Open Worktree in New Window', run: () => host.openFolder(w.path) }
    ]),
    ...when(other && w.branch, [
      {
        label: 'Bring to Main Worktree',
        run: run({ type: 'bringWorktreeHere', path: w.path, branch: w.branch! })
      }
    ]),
    ...when(other, [
      { label: 'Remove Worktree', run: run({ type: 'removeWorktree', path: w.path }) },
      ...when(w.branch, [
        {
          label: 'Remove Worktree and Delete Branch',
          run: run({ type: 'removeWorktree', path: w.path, deleteBranch: w.branch! })
        }
      ])
    ]),
    sep,
    { label: 'Copy Worktree Path', run: copy(w.path) }
  ];
}

function stashItems(commit: Commit, selector: string): MenuItem[] {
  return [
    { label: 'Apply Stash', run: run({ type: 'stashApply', selector }) },
    { label: 'Pop Stash', run: run({ type: 'stashPop', selector }) },
    { label: 'Create Branch from Stash…', run: run({ type: 'stashBranch', selector }) },
    { label: 'Drop Stash…', run: run({ type: 'stashDrop', selector }) },
    sep,
    { label: 'Copy Stash Name', run: copy(selector) },
    { label: 'Copy Stash Hash', run: copy(commit.hash) }
  ];
}
