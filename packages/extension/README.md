# Treeline — Git Graph

A fast, minimal Git Graph for VS Code and Cursor, built for branches, worktrees and reviews.

![Treeline in VS Code](https://raw.githubusercontent.com/epavanello/treeline/main/docs/hero.png)

- **Your branch vs main** at a glance: ↑ahead ↓behind, commits tinted by side, the fork point marked,
  one click to show only what diverged, to rebase/merge, or to see every changed file since the fork
- **Diffs you can navigate**: whenever a side matches your working tree the diff opens on the real file, so
  Go to Definition, errors and links work; "Compare with Working Tree" and "Open in Temporary Worktree"
  for any other revision
- **Commit messages written by Claude** (local Claude Code CLI, or any editor language model): ✨ in the
  Source Control title bar
- Commit graph of all branches, tags, remote branches, stashes and uncommitted changes
- Infinite scroll through history
- Commit details with changed files; click a file to open the diff
- Cmd/Ctrl+click a second commit to compare two commits
- **Worktrees** view in the Source Control sidebar: each worktree's branch and status (clean / ●changes,
  ↑↓ upstream), open in a new window, terminal, bring its branch back to the main worktree (with its
  uncommitted changes), remove (optionally deleting the branch), prune. Branch badges in the graph show
  the status of the worktree they're checked out in.
- Confirmations only when something would be lost
- Branch filter, **author filter** (pick one or more authors), remote branches toggle, find (Cmd/Ctrl+F, Enter / Shift+Enter to step through matches)
- Right-click menus for commits, branches, remote branches, tags, stashes, uncommitted changes and files:
  checkout, create/rename/delete branch, merge, rebase, cherry-pick, revert, reset, tag, push, pull,
  stash apply/pop/drop/branch, discard, add/remove worktree, copy
- Uses VS Code's built-in Git extension for repository discovery and change detection

Open it with **Treeline: View Git Graph**, the status bar item, or the button in the Source Control view.

Source, issues and license (MIT): [github.com/epavanello/treeline](https://github.com/epavanello/treeline).
