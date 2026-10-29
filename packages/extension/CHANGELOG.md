# Changelog

## 0.9.0

- Click a file in the list or the tree of changed files: its diff opens in a third column next to the
  list, colored like the editor. Drag the divider to resize it (remembered); ✕ closes it.
  Double-click the file, or its icon on hover, to open the diff in the editor instead
- Easier to read in light themes: hashes and links use the theme's link color, secondary text is no
  longer dimmed twice, and line numbers in diffs use the editor's line number color

## 0.8.0

- A Pull Requests row under the branches: the repository's pull requests on GitHub with their state,
  review, checks and open conversations. The one of the branch you have checked out comes first. Its
  filter: yours, waiting for your review, by state, with their branch on your machine, or waiting on
  their author. Right-click: its actions, then its branch's
- Review a pull request in the details panel, like a commit: its files as a list, a tree or inline
  diffs, as GitHub shows them, with its title, reviews, checks, branch and fork point. From its chip,
  "View changes" in a branch's card, or the branch's menu. A pull request whose branch isn't on your
  machine is fetched from GitHub first, without making a branch; a merged one shows what it brought in
- Branch badges in the graph show a small icon when their branch has an open or draft pull request
- "Connect GitHub" in the Pull Requests row when no gh account here can read the repository
- Worktree menus: Open Terminal Here, a terminal in the worktree's folder
- The 100 most recently updated pull requests are read, instead of 50

## 0.7.2

- Fixed: the folder badge on another worktree's Uncommitted Changes row opened a card saying its
  branch was never pushed, with no owner or pull request; it now shows that branch's card
- The store page goes feature by feature, each with a short clip from a new demo video

## 0.7.1

- Fixed: in a narrow Description column, branch badges let their cloud, avatar and worktree state
  spill over the commit's text; they now cut what doesn't fit at their edge

## 0.7.0

- Commit details, redesigned: the subject, then the message (its first lines, "Show all" for the rest),
  the branches and tags on it (one badge for a branch and its remote copy), the author with their
  avatar, a copyable hash, the parents as links to the graph. Uncommitted changes and other worktrees
  get the same layout: a worktree shows its card, with a copyable folder
- A third way to look at the changed files, besides the list and the tree: every change inline on one
  page, as a pull request shows them, colored with your editor's own theme and grammars. Big and
  generated files start folded; a file's name opens its diff in the editor
- Both dividers of the details panel can be dragged, and the panel remembers its size
- The file list shows how many lines each file adds and removes
- "Summarize": Claude Code (Haiku) writes 4 lines on what a commit's, or a folder's uncommitted,
  changes do, from the diff alone (no project files, settings or tools). It shows again next time
- Commit messages from Claude no longer load your Claude Code settings, hooks or CLAUDE.md: faster
- Stacked pull requests: a branch's Graph Filter menu (and a worktree's) shows it with the base, with
  the branches built on it, or with its whole stack
- With a branch filter on, only the branches you picked are named in the graph (remote ones too, even
  with remote branches left out), not the others that point into their history
- Include → Worktrees: leave the other worktrees' rows and folder badges out of the graph
- The checked-out branch comes first among the branch chips, and the open worktree first among the
  worktrees
- Claude Code sessions that ran in a worktree or on a branch show in its card, and its menu resumes
  them (in the desktop app, or in a terminal)
- Fixed: the context menu of a worktree whose branch was never pushed didn't open
- Fixed: a worktree's count of uncommitted changes counted a new folder as one change; it now counts
  its files, like the file list

## 0.6.0

- Hover cards are the legend of their chip: every line starts with the very symbol the chip shows
  (✎ uncommitted changes, ↑↓ against the base, the cloud, the pull request, the owner, the age), then
  says what it means. Hashes and folders sit in fields you can select or copy with one click
- A worktree's card is its branch's card plus what makes it a worktree: its uncommitted files (the first
  few, with their status) and its folder
- Worktree chips show what their branch's chip shows: ↑↓ against the base (detached ones too), the
  cloud, an open pull request, the owner, the age. A detached worktree shows a commit icon instead of
  its hash, and a clean one no check mark: no pen means nothing uncommitted
- Clicking a worktree's chip shows it in the graph, like a branch's: its commit, selected and scrolled
  to; with uncommitted changes, those open in the panel below, with their diffs
- A detached worktree gets a folder badge on its commit in the graph, with its card and menu: no
  branch badge marked it before. Worktree badges show their uncommitted changes, without repeating the
  remote state the cloud already gives
- Worktrees with nothing to lose are marked ♻: clean, and detached on a commit another branch or tag
  already has (temporary checkouts), or on a merged branch. A "Nothing to lose" filter lists them with
  a button to remove them all
- Going to a commit (a chip's click, Go to HEAD) first asks git where it is: when it's far down, the
  history loads that far in one go, with a progress note, instead of page after page; when a filter
  hides it, a note says which one, with a Show it button that lifts it and takes you there
- Another worktree's uncommitted changes get a row of their own, right above the commit it's on, like
  this folder's, marked with the worktree's folder badge: selecting it lists its files (diffs on the
  real files there), selecting the commit shows the commit. Clicking the worktree's chip selects that
  row
- When you change a filter or a commit is being looked up, the list dims and says what it's doing
  ("Applying the filters…", "Finding that commit…", "Loading the history down to that commit…"), so a
  big repository doesn't look stuck. Reloads after changes on disk stay quiet
- A detached worktree's own commits (on no branch) now show in the graph
- An Include menu in the toolbar says what the graph shows besides your local branches: remote
  branches, tags, stashes, each on or off and remembered per repository (it replaces the Show Remote
  Branches checkbox). The Tags row keeps listing tags either way
- Commit rows lose their green and blue background: the bar on the left still says ahead or behind,
  and the selected row stands out again

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
