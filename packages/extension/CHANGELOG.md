# Changelog

## 0.4.2

- The store page opens on a short demo of Treeline, with a link to the full 1-minute video

## 0.4.1

- Treeline is now a stable release: no more "Preview" label in the stores

## 0.4.0

- Branch badges in the graph show the same hover card as the branch chips and the branch list, with the
  same right-click actions
- Show only some branches, or hide the noisy ones: "Show Only / Also Show / Stop Showing / Hide This
  Branch" in every branch's menu, and an eye button in the branch list, which now opens with Shown and
  Hidden sections
- Every branch chip shows where it stands against the compare base (↑↓) and what there is to push or pull,
  like the branch list
- Go to HEAD button in the toolbar: selects the commit you're on and scrolls to it
- The + of the Worktrees, Branches and Tags rows sits at the right of their title
- The Worktrees view in the Source Control sidebar is gone: the Worktrees row in the graph covers it (open, bring to the
  main worktree, remove, prune)
- New README and screenshots

## 0.3.0

- New worktree (+ in the Worktrees row and the sidebar) is a searchable picker: a free local branch, a
  remote branch, or a new branch from the compare base (fetched first) or from any other branch
- New tag (+ in the Tags row, or Add Tag… on a commit) suggests the next patch, minor and major version,
  or takes any name, then offers to push it
- Commits already on the base under another hash (after a rebase, GitHub's "Rebase and merge" or a
  cherry-pick) no longer count as ahead: the compare bar shows them as "≡ N already in <base>" and the
  graph dims them, so a merged branch reads as merged
- The ahead, behind and "already in" counters are filters: click one to see only those commits (with the
  fork point), combine them, click again to see everything. They replace the "Only ↑↓" button
- A rewritten history (filter-repo, a forced rebase) is flagged: most of a branch's commits are copies of
  the base's, so ahead/behind are noise. A warning in the compare bar and on the worktree chip and card
- The worktree card compares it with the base (ahead, behind, copies, when it forked); click a worktree to
  see its uncommitted changes in the details panel and open their diffs without opening the worktree
- Changed files can be shown as a folder tree (toggle in the details header): folders collapse, and a
  chain of single folders shares one row
- The Branches dropdown lists local and remote branches with their age and where they stand against the
  compare base (↑ ahead, ↓ behind); hover a branch for its card, right-click it for its actions, such as
  deleting a remote branch you no longer need
- Commit list columns can be resized (drag an edge, double-click to reset) and Date, Author and Commit
  can be hidden from the View menu; both are remembered
- The Worktrees, Branches and Tags rows line up, with compact titles, a small count of their items and
  their + next to the title; they stay visible (if turned on) even when empty
- A branch and its upstream on the same commit share one badge (`main ☁ origin`); right-click the ☁ part
  for the remote branch's actions
- Tooltips stay hidden while a context menu is open

## 0.2.0

- Tooltips on every button and menu action: what it does, what to watch out for, and the git command
  it runs
- A spinner shows what git is working on (the worktree, branch, commit or stash, the Worktrees view and
  the refresh button), so slow operations like removing a worktree no longer look frozen
- Branches and Tags rows, most recent first, next to the Worktrees row: hover for details, click to jump
  to the commit (loading more history when needed), right-click for its actions
- The Branches row shows what each branch has to push (↑) and pull (↓); right-click it to Pull or Push.
  Pulling a branch that isn't checked out fast-forwards it in place, without switching to it
- The element a context menu belongs to (commit, badge, chip, file) stays highlighted while the menu is
  open, and branch and tag badges in the graph light up on hover
- Context menus close when you click again on the same chip or row, and right-clicking where there are
  no actions (such as a row title) no longer opens the previous menu
- Choose which rows to show (worktrees, branches, tags) from the toolbar; the choice is remembered
- The rows scroll sideways, also with the mouse wheel, under a pinned title and action
- Hovering a worktree shows a card: branch, last commit and how old it is (highlighted after a month),
  uncommitted changes, upstream and folder
- Clearer worktree status, aligned with its numbers: the count of uncommitted changes or ✓ clean, ↑ commits
  to push and ↓ to pull, and a crossed cloud when the branch has never been pushed
- Rebase and Merge in the compare bar have icons, and buttons keep their size while they load

## 0.1.0

First public release.

- Commit graph of branches, tags, remote branches, stashes and uncommitted changes, with infinite scroll
- Compare HEAD with a base branch: ahead/behind, commits tinted by side, fork point, focus mode, full diff
  since the fork
- Diffs open on the real file whenever it matches the working tree, so language features work
- Worktrees in the graph and in a Source Control view: status, open in a new window, bring a branch back to
  the main worktree with its changes, remove with its branch, prune
- Commit messages written by the local Claude Code CLI or an editor language model
- Branch and author filters, find, commit details, compare two commits, context-menu actions
