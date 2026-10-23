<div align="center">

<img src="packages/extension/resources/icon.png" width="72" alt="" />

# Treeline

**A fast, minimal Git Graph for VS Code and Cursor, built for branches, worktrees and reviews.**

![Treeline in VS Code: compare bar, worktrees and the commit graph](docs/hero.png)

</div>

[Git Graph](https://github.com/mhutchie/vscode-git-graph) has been unmaintained since 2021. Treeline is a
from-scratch rewrite (about 3k lines of TypeScript and Svelte 5) that keeps what made it great and adds what
daily work with feature branches and worktrees actually needs.

## Features

- 🌿 **Your branch vs main, at a glance.** ↑ahead ↓behind, commits tinted by side, the fork point marked.
  One click to show only what diverged, to rebase or merge, or to list every file changed since the fork
  (what the pull request will show).
- 🔍 **Diffs you can navigate.** When a side matches your working tree, the diff opens on the real file, so
  Go to Definition, errors and links just work. Any older revision opens in a temporary worktree.
- 🗂️ **Worktrees, first class.** Every worktree with its branch and status (clean, ●changes, ↑↓ upstream),
  in the graph and in the Source Control sidebar. Open one in a new window, bring its branch back to the
  main folder with its uncommitted changes, remove it (and its branch), prune the missing ones.
- ✨ **Commit messages by Claude.** Uses your local [Claude Code](https://claude.com/claude-code) CLI, or any
  language model your editor provides, and matches your repository's style.
- 🙅 **Fewer dialogs.** Treeline asks only when something would be lost: uncommitted changes, commits no other
  branch has, remote state.
- 📜 **Everything you expect from Git Graph.** Infinite scroll through history, branch and author filters,
  find, commit details, compare any two commits, and context menus for checkout, branch, merge, rebase,
  cherry-pick, revert, reset, tag, push, pull, stash and more.

## Install

Treeline is not on the Marketplace yet (coming soon, together with Open VSX for Cursor, VSCodium and
Windsurf). Build it from source:

```bash
git clone https://github.com/epavanello/treeline && cd treeline
pnpm install && pnpm package
code --install-extension packages/extension/treeline.vsix   # or: cursor --install-extension …
```

Then run **Treeline: View Git Graph**, click **Git Graph** in the status bar, or use the button in the
Source Control view.

## Develop

```bash
pnpm dev        # watch the extension and the webview; press F5 in VS Code to launch it
pnpm test       # git layer against real temporary repos + graph layout
pnpm e2e        # the extension inside a real VS Code (actions, diffs, worktrees, commit messages)
pnpm --filter @treeline/webview dev:browser   # the UI in a browser with a mocked host
```

The architecture, conventions and roadmap live in [AGENTS.md](AGENTS.md), written for humans and coding
agents alike.

## Credits

Inspired by [Git Graph](https://github.com/mhutchie/vscode-git-graph) by Michael Hutchison. Treeline is an
independent reimplementation and shares no code with it.

## License

[MIT](LICENSE) © Emanuele Pavanello
