# Treeline — Git Graph

**Git Graph, rebuilt for how you work today: feature branches, stacked PRs, worktrees and Claude Code.**

[![Treeline in VS Code: compare your branch with main, review its diff, juggle worktrees and stacked pull requests](https://raw.githubusercontent.com/epavanello/treeline/main/docs/demo.gif)](https://youtu.be/eXORu_KgFKw)

▶ **[Watch the demo, with sound](https://youtu.be/eXORu_KgFKw)**

## 🌿 Your branch vs main

**↑ahead ↓behind, always on top, and they're filters.** One click shows just your branch's commits.
Commits that landed through "Rebase and merge" or a cherry-pick count as merged, not as bogus ↑↓.

![Compare with main: ahead and behind as filters](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/compare.gif)

## 🔍 Review before the PR does

**Every commit, readable.** Message, author, the branches on it, a copyable hash, its parents one click away.

![The details panel of a commit](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/details.gif)

**Inline diffs, in your editor's colors.** Every change on one page, like a pull request, highlighted
with your own theme and grammars, or one file at a time next to the file list. **Diff** shows the whole
branch since the fork, uncommitted work included, and diffs open on your real files, so Go to Definition
just works.

![Inline diff colored by the editor's theme](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/inline-diff.gif)

## 🗂️ Worktrees at a glance

**One chip per worktree:** its branch, ↑↓ vs main, its uncommitted files on hover, its own row in the graph.
Create one from any branch with **+**, open it or a terminal in it, or bring its branch back to the
main folder.

![Worktrees: chips, hover cards and graph rows](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/worktrees.gif)

## 🥞 Stacked pull requests

**See a stack as one thing.** Right-click a branch → Graph Filter: it with main, with the branches built
on it, or its whole stack.

![Graph Filter: a branch's whole stack](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/stack.gif)

**Pull requests where you look.** State, reviewers and their verdicts, open conversations and checks on
every branch and graph badge, through your `gh` CLI (any of its accounts) or the editor's GitHub account.
Every branch shows its owner.

![A branch's pull request on its card](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/pull-requests.gif)

**A row of pull requests.** Filter it to yours, those waiting for your review, drafts, merged or closed
ones, those whose branch you have, or those waiting on their author; the one of the branch you're on
comes first. **Review a pull request in the details panel**, like a commit: its files as a list, a tree
or inline diffs, with its reviews, checks and fork point. Its branch doesn't have to be on your machine:
Treeline fetches what GitHub has, without making a branch.

## 🧹 Clean up in one go

**Filter to merged, gone or stale branches, then delete them all** with one confirmation that says what
would be lost. Rebased, cherry-picked and squash-merged branches count as merged.

![Deleting the merged branches in one go](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/cleanup.gif)

## ✨ Claude Code, built in

**Sessions per branch and worktree.** The Claude Code sessions that worked on a branch show on its card;
its menu resumes them, in the desktop app or a terminal.

![Claude Code sessions of a worktree](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/sessions.gif)

**Summarize any diff.** Four lines on what a commit, or your uncommitted work, does. Claude sees only
the diff: no project files, settings or tools.

![Summarize: four lines from the diff alone](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/summarize.gif)

**Commit messages in your repository's style,** from ✨ in the Source Control title bar.

![Claude writes the commit message](https://raw.githubusercontent.com/epavanello/treeline/main/docs/features/commit-message.gif)

## 📜 And everything you loved in Git Graph

Infinite history · author and branch filters · find · compare any two commits · resizable columns ·
checkout, merge, rebase, cherry-pick, revert, reset, tag, push, pull, stash. Treeline asks only when
something would be lost, and every button explains itself on hover.

## Getting started

Run **Treeline: View Git Graph**, click **Git Graph** in the status bar, or use the button in the Source
Control title bar. Treeline uses the editor's built-in Git extension to find repositories and to refresh
when they change. The Claude features need [Claude Code](https://claude.com/claude-code) (`claude` on your
PATH); commit messages fall back to any model your editor provides.

## Feedback

Treeline is open source (MIT). Issues and ideas:
[github.com/epavanello/treeline](https://github.com/epavanello/treeline/issues).
