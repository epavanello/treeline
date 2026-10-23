# Treeline — Git Graph

**A fast, minimal Git Graph for VS Code and Cursor, built for branches, worktrees and reviews.**

![Treeline in VS Code](https://raw.githubusercontent.com/epavanello/treeline/main/docs/hero.png)

## Features

- 🌿 **Your branch vs main, at a glance.** ↑ahead ↓behind, commits tinted by side, the fork point marked.
  One click to show only what diverged, to rebase or merge, or to list every file changed since the fork.
  Right-click any branch or tag to compare with it instead.
- 🔍 **Diffs you can navigate.** When a side matches your working tree, the diff opens on the real file, so
  Go to Definition, errors and links work. **Compare with Working Tree** and **Open in Temporary Worktree**
  cover any other revision.
- 🗂️ **Worktrees, first class.** A Worktrees row in the graph and a Worktrees view in the Source Control
  sidebar: each worktree's branch and status (✓ clean, ●changes, ↑↓ upstream). Open one in a new window,
  bring its branch back to the main worktree together with its uncommitted changes, remove it (and its
  branch), prune the missing ones.
- ✨ **Commit messages by Claude.** The ✨ button in the Source Control title bar writes the message with your
  local [Claude Code](https://claude.com/claude-code) CLI (`claude` on your PATH), or with any language
  model your editor provides, matching your repository's style.
- 🙅 **Fewer dialogs.** Treeline asks only when something would be lost: uncommitted changes, commits no
  other branch has, remote state.
- 📜 **Everything you expect from Git Graph.** Infinite scroll, branch and author filters, find
  (Cmd/Ctrl+F), commit details, Cmd/Ctrl+click to compare two commits, and context menus for checkout,
  branch, merge, rebase, cherry-pick, revert, reset, tag, push, pull, stash and more.

## Getting started

Run **Treeline: View Git Graph**, click **Git Graph** in the status bar, or use the button in the Source
Control view. Treeline uses the editor's built-in Git extension to find repositories and to refresh when
they change.

## Feedback

Treeline is open source (MIT). Issues and ideas:
[github.com/epavanello/treeline](https://github.com/epavanello/treeline/issues).
