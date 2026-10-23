# Changelog

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
