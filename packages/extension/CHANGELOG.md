# Changelog

## 0.5.0

- A branch is one chip in the Branches row: your local branch and the remote branch it tracks
  together. A cloud says where it lives: filled on your machine and on the remote (with ↑ to push and
  ↓ to pull), outline only on the remote (a dashed chip: someone else's branch you don't have), crossed
  only here (in the warning color once the remote deleted it)
- The Worktrees and Branches rows have their own filter (click their title): local branches, ones only
  on the remote, or all; yours or anyone's; merged, not merged yet, deleted on the remote, with
  uncommitted changes, clean, or untouched for 30 days
- Filtering by merged, deleted on the remote, clean or untouched offers to delete or remove them all at
  once, with one confirmation saying what would be lost: a branch goes with its remote copy, unless you
  keep the remote ones; worktrees can take their branches with them
- Merged means all of a branch's changes are on the compare base, rebased or cherry-picked copies
  included, or its pull request was merged (squash merges included)
- Pull requests in the branch card: title (opens it on GitHub), state, review verdict, each reviewer's
  verdict, unresolved and resolved conversations, checks. Chips show an open pull request and its
  unresolved conversations; the branch menu opens it. Read with the gh CLI when it's signed in (any of
  its accounts), else with the editor's GitHub account; kept up to date every minute and after a fetch
- Every branch has an owner: whoever wrote most of its own commits (the ones not on the base or, once
  merged with a merge commit, the ones that merge brought in). Their initials show on chips and in the
  branch list; the hover card gives each author's share ("Leo Rossi 86%, 6 of its 7 commits"). A
  branch with no commits of its own is nobody's, so "mine" never guesses
- Commit authors show their initials, in a color of their own, in the Author column (one color per
  person, whichever email they used)
- Remote branches drop their remote's name ("origin/") on badges, chips and the branch list: the cloud
  icon says it. With several remotes, it stays as a small prefix
- Context menus: an icon for every action, the app's text size, and submenus where options pile up
  (Graph Filter, "With <current branch>": compare, merge, rebase; several pull requests)
- One Delete that fits the branch: local only, remote only, or a submenu (Local and Remote, Only Local,
  Only on the remote). Deleting the local copy asks only when commits would be lost; deleting on the
  remote always asks, since it's gone for everyone
- Each repository remembers how you set up its graph: hidden branches, the branches and authors shown,
  remote branches on or off, the compare base, the rows' filters. Every worktree of it, in any window,
  opens the same way
- Graph badges look like the branch chips: the owner's initials, and a cloud for where the branch
  lives (filled when it's on the remote too, with ↑↓ when they differ; crossed when it isn't). A
  local branch and its remote on the same commit show a filled cloud instead of "origin", whose name
  appears only when the repository has several remotes
- Big repositories: branch owners and merged state are worked out in parallel, a batch at a time, and
  kept across sessions (reopening costs nothing until a branch moves): 270 branches went from minutes
  of spinner to about 3 seconds the first time. The filter's tooltip shows the progress
- While the history first loads, placeholder rows show instead of an empty page
- A Treeline output channel (View → Output) logs git commands, graph loads and pull request lookups
  that take a second or more, for diagnosing slow repositories
- Fixed: after an action (deleting a branch, say) the graph could keep showing the old state. It now
  reloads after every action even if the editor's reload notice goes astray, retries a load that
  failed while git was busy, and forgets shown or hidden branches that were deleted
- The Worktrees row is ordered like the branches: the main worktree and the one the graph shows
  first, then the others by their latest commit
- Fixed: clicking (or right-clicking) a commit in the Graph column did nothing; only from the
  Description column on did it select the commit
- An error names the git command that failed, not the action's first one ("git push failed" when
  deleting on the remote is what went wrong)
- The Git Graph tab opens in a locked editor group: files and diffs opened from it open beside it
  instead of replacing it
- Removing a worktree is a submenu: only the folder, the folder and its branch, or also the branch's
  copy on the remote (asks first). Removing several at once offers the same
- Branch and worktree cards read at a glance: small labels, dates in italics, hashes and branch names
  in monospace, ahead in green and behind in blue, a check when merged ("merged through #38" when
  GitHub squashed it), the remote's state with its cloud

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
