# AGENTS.md — Treeline

A from-scratch, minimal Git Graph extension for VS Code and Cursor. Svelte 5 webview, shadcn-svelte UI,
the git CLI under the hood. Feature reference: [mhutchie/vscode-git-graph](https://github.com/mhutchie/vscode-git-graph)
(unmaintained since 2021).

## Ground rules

- **Language**: all code, comments, docs, commit messages and UI text in **English**. (Chat with the owner is in Italian.)
- **License**: MIT. Git Graph's license **forbids publishing derivative works**. Use it only as a functional/API
  reference: never copy its code, algorithms verbatim, CSS or assets.
- **Least code wins**: prefer VS Code built-ins (native prompts, `vscode.diff`, the `vscode.git` API) and
  shadcn-svelte components over custom code. `packages/webview/src/lib/components/ui/` is vendored shadcn:
  treat it as external, edit only to theme or fix integration.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`). No stores, no React-style patterns.
- **Every user-facing change ships as a release.** A fix, feature or UI change pushed to `main` must, in the
  same push, bump `version` in `packages/extension/package.json` (semver: fix → patch, feature → minor;
  breaking → minor while we're on 0.x) and add a `## <version>` section at the top of
  `packages/extension/CHANGELOG.md` with one user-facing bullet per change. The Release workflow publishes
  it automatically (see "Releases" below). Changes that don't touch the extension (docs, CI, tests only) need
  no bump. Never push tags by hand: the workflow creates them.

## Goal

Phase 1 (done): reproduce Git Graph's core experience 1:1. Verified in a real VS Code by the e2e suite.

Phase 2 (done): the features that motivated the rewrite, built around the owner's daily use: compare my
branch with main, review diffs with working language features, juggle worktrees with few clicks.

1. **Compare with a base** (`GraphQuery.base/focus`, `GraphData.compare`, `Commit.side`): HEAD vs a base
   branch (default `origin/HEAD`, then origin/main, origin/master, main, master) via
   `rev-list --cherry-mark --left-only|--right-only HEAD...base`: commits whose changes are on both sides
   under different hashes (rebased, "Rebase and merge", cherry-picked) are `same`, not ahead/behind, and
   counted in `Compare.same` ("≡ N already in <base>", dimmed rows). `Compare.rewritten` (at least 5 copies,
   more copies than unique commits) means one side's history was rewritten: a warning, not ahead/behind.
   Worktree cards get the same comparison and their uncommitted files from `getWorktreeDetails`, preloaded
   one worktree at a time after each load and cached host-side until either HEAD moves. The CompareBar shows ↑ahead ↓behind, rows are tinted green (only on
   HEAD) / blue (only on the base), the merge base is labelled "fork point". The counters are toggles:
   `GraphQuery.focus` lists the sides to keep (`log --boundary HEAD...base`, then filtered by side, keeping
   the merge base). "Diff" = every file since the merge base, working tree included.
2. **Diffs on real files**: language servers ignore virtual documents (`treeline:`, and VS Code's own `git:`),
   so `openDiff` uses the file on disk as the right side whenever it matches that revision
   (`git diff --quiet <rev> -- <path>`); "Diff" and "Compare with Working Tree" always do. For an old commit,
   "Open in Temporary Worktree" gives a real checkout in its own window.
3. **Worktrees**: `Git.getWorktrees` is part of `GraphData`; branches checked out elsewhere get `Ref.worktree`
   and show that worktree's status on their badge. Under the compare bar, `NavStrip` rows (pinned title and
   action, chips scrolling under a fade, wheel scrolls sideways) list the worktrees (`WorktreeStrip`: click
   opens its uncommitted changes in the details panel via `app.openWorktree()` (`worktreePanel`; diffs
   run with `repo` = that worktree's folder), `app.reveal()` jumps to a commit loading more history if needed; double-click opens;
   right-click `worktreeItems()` in `menus.ts`), the local branches and the tags (`RefStrip`, from
   `GraphData.heads/tags`, most recent first; local branches only, to keep the team's noise out). The toolbar's
   `BranchPicker` covers every branch (`heads` + `remoteHeads`). Branch chips, picker rows and graph badges
   share `BranchState` (`RefSummary.vsBase`: ahead/behind the compare base by hash, one
   `for-each-ref --format=%(ahead-behind:<base>)`, git 2.41+; cloud icons for the upstream), the `RefCard`
   hover card and the ref's context menu. **Hidden branches** (`GraphQuery.hidden`, the opposite of
   `branches`): `--exclude=<name>` before `--branches`/`--remotes` drops the commits only they have; set from
   the picker's eye button or the "Show Only / Also Show / Stop Showing / Hide This Branch" menu items.
   **Branch rows** (`branchRows()` in `filters.ts`, `app.rows` / `app.rowOf`): a local branch and its
   remote copy (its upstream, else `<remote>/<same name>`) are one chip; remote branches nobody has
   locally follow (dashed chips). `BranchState`'s cloud: filled = both (with upstream ↑↓), outline =
   remote only, crossed = local only (warning color when `upstream.gone`).
   **Row filters** (`filters.ts`, pure and unit-tested; state in `app.branchFilter/worktreeFilter`, persisted
   with the webview state): the Branches and Worktrees titles open a `FilterMenu` (scope local/remote/both,
   owner, state). They filter the chips only, never the graph. The cleanup states (`CLEANUP`) add a
   "Delete N" / "Remove N" button running `deleteBranches` / `removeWorktrees`: one modal for the lot,
   saying what would be lost; `deletable()` / `removable()` keep the base, checked-out branches, the
   main and current worktrees out. **Branch details** (`getBranchDetails` → `Git.branchDetails`): the
   authors of `base..ref` (no merges) and `unique` = `rev-list --cherry-pick --right-only base...ref`
   (0 = merged, copies included); preloaded after each load (the Branches row's scope first, then the
   rest), asked 40 at a time (`preloadBranchDetails`, `app.branchProgress`) and computed 6 git
   processes at a time host-side by `BranchDetailsCache` (`branchDetails.ts`), which keeps answers in
   `workspaceState` by repo + ref + branch hash + `Compare.baseHash`: reopening costs nothing. Once merged
   (`base..ref` empty), its own commits are `<merge>^1..ref`, `<merge>` being the oldest commit of
   `rev-list --first-parent --ancestry-path ref..base` (`mergedBy`); a branch on the base's mainline
   has none. Authors are grouped by name (one person, several emails). Owner = top author, or nobody
   (never guessed from one commit); "mine" compares it with `GraphData.user` (`git var GIT_AUTHOR_IDENT`).
   `AuthorAvatar` draws initials in a lane color picked from the name: the place where GitHub photos
   would go. `app.refLabel()` / `RefName` drop `origin/` from remote branch names (kept as a small
   prefix with several remotes). Rows are toggled from the toolbar (`ViewSettings`, kept in
   the extension's `globalState`, which also holds the commit list's column visibility and widths:
   drag a header edge, double-click to reset; `DEFAULT_VIEW` in `shared` fills fields missing from older
   saved settings).
   Their + runs `newWorktree`: a native QuickPick of free local branches, remote
   branches, and "new branch from <compare base>" (fetched first, `--no-track`) or from any branch; the name
   of a new branch is an InputBox validated with `git check-ref-format`. `addTag` suggests the next semver.
   A worktree's menu has open in a new window, "Bring Branch to Main Worktree" (remove the worktree, check
   the branch out in the main one, carrying uncommitted changes through a stash) and "Remove Worktree and
   Delete Branch". (A native Worktrees view in the Source Control sidebar existed until 0.4.0: the graph
   page covers it.)
4. **Fewer prompts**: actions ask only for a needed name or before losing something: uncommitted changes,
   commits no other ref contains (`rev-list <b> --not --exclude=<b> --branches --remotes --tags`), remote
   state, stashes. No option screens: git defaults, plus explicit variants (Force Push…).
5. **Commit messages with Claude** (`commitMessage.ts`): `claude -p --model haiku` run in a temp dir with the
   staged diff (or all changes) and the last 15 subjects on stdin; falls back to `vscode.lm`. The result goes
   into the Source Control input box. Triggers: ✨ in the Source Control title bar, the Uncommitted Changes menu.
6. **Pull requests** (`pulls.ts`, vscode-free, unit-tested with a fake `gh`): one GraphQL query for the
   50 most recently updated PRs (state, review decision, latest review per reviewer, review requests,
   review threads resolved/unresolved, checks rollup), run by `gh api graphql` with gh's active
   account, then each other signed-in account (`gh auth status --json hosts`, `gh auth token --user`,
   the working one remembered per repo), else with the editor's GitHub session (`getSession('github',
['repo'], { silent })`; `connectGitHub` asks for consent). Cached 60 s per repo, invalidated by fetch,
   push and branch deletions (`extension.ts`); the webview asks after each load and every minute.
   Matched to branches by head branch name (`pullsOf`), forks' PRs left out. A merged PR whose head is
   the branch's commit makes it merged (`isMerged`): squash merges, which git alone can't see.
   Shown in `RefCard` (`PullCard`), on chips (`PullBadge`) and in the branch menus (`pullItems`).
7. **Author filter**: `GraphQuery.authors` → repeated `--author=^<escaped name> <` (OR, exact name).

Later ideas: GitHub avatars (see `AuthorAvatar`), commit search
server-side (`--grep`), a WebviewPanelSerializer so the panel survives window reloads, settings
(page size, date format, graph style), multi-select actions.

### Releases

Published as `epavanello.treeline` on the **VS Code Marketplace** and **Open VSX** (Cursor, VSCodium and
Windsurf install from Open VSX). `.github/workflows/release.yml` runs on every push to `main`: when the
`package.json` version has no `v<version>` tag yet, it runs the tests, packages the `.vsix`, creates the tag
and a GitHub release (notes = that version's CHANGELOG section, required), then publishes to **both stores
automatically** (active and verified since 0.4.2: nothing to upload by hand):

- **Open VSX**: trusted publishing (GitHub OIDC, no secret), registered on the extension for
  `epavanello/treeline` · `release.yml` (no environment) and enabled by the repository variable
  `OPENVSX_TRUSTED_PUBLISHING=true`. The namespace `epavanello` is verified (EclipseFdn/open-vsx.org#14627).
  An `OVSX_PAT` secret, if ever added, takes precedence.
- **VS Code Marketplace**: automatic through **Microsoft Entra ID**: the repository variables
  `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` name the Entra app `treeline-release` (in the owner's Default
  Directory), whose federated credential trusts this repo's `main` (GitHub's subject format with IDs:
  `repo:epavanello@47756116/treeline@1430965024:ref:refs/heads/main`). Its Marketplace identity
  `6dacc254-a6f1-6110-bbf1-8a2ea6c20dac` is a Contributor of the publisher; the **Marketplace access**
  workflow (run by hand) checks the whole chain. **Run workflow** on Release republishes the current
  version's `.vsix` to any store that lacks it. `azure/login` then
  `vsce publish --azure-credential`; no secret, nothing to renew. A `VSCE_PAT` secret still works until
  global Azure DevOps PATs are retired (2026-12-01). With neither, the run summary links the `.vsix` to
  upload by hand at marketplace.visualstudio.com/manage/publishers/epavanello (… → Update).

A push that changes the extension without bumping the version publishes nothing and gets a warning.
0.1.0 (both stores) and 0.4.2 (Open VSX, before trusted publishing could be registered) were uploaded by
hand; every later version goes out through the workflow.

## Layout

```
packages/
  shared/      Types only: the host ⇄ webview contract (HostApi, Action, Commit, …). Start here.
  extension/   The VS Code extension (the published package). Bundled with esbuild → dist/extension.cjs.
    src/extension.ts  activate(): wires everything up
    src/git.ts        vscode-free git CLI layer (log, refs, stashes, details, diffs). Unit-tested.
    src/actions.ts    every write operation; native prompts only when needed (see "Fewer prompts")
    src/commitMessage.ts  commit message generation (Claude CLI, fallback vscode.lm)
    src/pulls.ts      GitHub pull requests (gh CLI, fallback the editor's GitHub account)
    src/repos.ts      repo discovery + change events via the built-in vscode.git API (fallback: watcher)
    src/diff.ts       `treeline:` TextDocumentContentProvider + vscode.diff
    src/panel.ts      the WebviewPanel, CSP, and the RPC dispatcher
    test/             vitest against a real temporary repo (test/fixture.ts)
    e2e/              @vscode/test-electron suite: panel smoke test, diffs, every Action with scripted prompts
  webview/     Svelte 5 + Vite + Tailwind 4 + shadcn-svelte → packages/extension/dist/webview/index.{js,css}
    src/lib/app.svelte.ts   all UI state (one class, runes)
    src/lib/graph.ts        lane layout algorithm (unit-tested)
    src/lib/fileTree.ts     changed files grouped by folder, single-folder chains merged (unit-tested)
    src/lib/rpc.ts          typed Proxy over postMessage (`host.getGraph(q)` …)
    src/lib/menus.ts        context menus as data
    src/lib/components/     CommitList, GraphSvg, DetailsPanel, Toolbar, CompareBar, NavStrip (+ its rows
                            WorktreeStrip, RefStrip), BranchPicker (the branch filter), RefCard,
                            BranchState, MultiFilter (authors, base), FilterMenu (row filters),
                            AuthorAvatar/AuthorStack, RefName, PullBadge/PullCard, ActionMenu,
                            RefBadge, WorktreeState, Tip
    preview/                runs the webview in a plain browser with a mocked host; `?scene=branches|
                            review|menu` (scenes.ts) stages the README screenshots
```

## How it works

- **RPC**: the webview calls `host.method(...args)` (`src/lib/rpc.ts`); `panel.ts` dispatches to a `HostApi`
  object and replies `{ id, result | error }`. The host pushes `{ event: 'refresh' | 'repos' }`.
  Adding a capability = add it to `HostApi` in `shared`, implement it in `panel.ts`, call it from the webview.
- **Actions**: the webview sends an `Action` (`shared`); `plan()` in `actions.ts` turns
  it into steps (git argv lists, or callbacks such as "open the new worktree"). Adding an action = a variant in
  `Action`, a `case` in `plan()`, a menu item in `menus.ts`. After every action, `refresh()` reloads the graph.
- **Remembered setup**: the webview's own state (`vscode.setState`) keeps only the repository and the ↑↓
  filters; hidden/shown branches, authors, remotes, base and the rows' filters are a `RepoView` the host
  keeps in `globalState` by `Git.commonDir()` (the shared `.git`, realpath'd), so every worktree and
  window of a repository opens set up the same way. Sent only when it changed.
- **Refresh**: `vscode.git`'s `repository.state.onDidChange` (debounced 400 ms) → `refresh` → the webview
  reloads the graph keeping its selection.
- **Paging**: like Git Graph, "load more" re-runs `git log` with a larger `--max-count` (300 per page) so the
  graph layout stays consistent. Triggered by an IntersectionObserver sentinel (infinite scroll).
- **Graph**: `graph.ts` assigns each commit a lane and produces the edges into each row from the row above.
  Lanes never compact; a first parent further right is pulled into the child's lane so the mainline stays
  left. `GraphSvg.svelte` draws one SVG for the whole list.
- **Rows**: uncommitted changes (`hash === '*'`) on top, stashes right above their base commit.
- **Theming**: shadcn tokens map to `--vscode-*` variables in `src/app.css`; no palettes of our own.
  `dark:` = `.vscode-dark` / `.vscode-high-contrast` on `<body>`.
- **Async buttons**: `Button` (copied from devmotion) shows a spinner automatically when `onclick` returns a
  Promise, in place of its icon (or over its label, keeping its size). Prefer that to manual loading state.
- **Busy state**: every action runs through `run()` in `extension.ts`, which posts `{ event: 'busy', key }`
  once its prompts are answered (`key` = `actionTarget(action)`: worktree path, ref name, hash…). The webview
  (`app.running`, `app.isRunning()`) swaps the icon of whatever it concerns for a spinner.
- **Tooltips**: every control explains itself. `Button` takes a `hint`, menu items a `hint` field, anything
  else wraps in `Tip` (`{#snippet children(trigger)}` and spread `trigger` on the element). A `Hint` is a
  sentence or `{ title, body, warn, command }`. Write one for every new button or menu item.

## Commands

```bash
pnpm install
pnpm build            # webview (vite) then extension (esbuild)
pnpm dev              # watch both
pnpm check            # tsc + svelte-check
pnpm test             # vitest: git layer against a real repo + graph layout
pnpm e2e              # build, then run e2e/ inside a downloaded VS Code (cached in packages/extension/.vscode-test)
pnpm package          # → packages/extension/treeline.vsix
pnpm format

# UI work without VS Code: mocked host in a browser
pnpm --filter treeline fixture [path/to/repo]   # writes packages/webview/preview/fixture.json
pnpm --filter @treeline/webview dev:browser     # http://localhost:5173
```

Debug in a real editor: open this folder in VS Code/Cursor and press **F5** ("Run Extension").
Install the build: `code --install-extension packages/extension/treeline.vsix`
(or `cursor --install-extension …`).

## Footguns

- `git.ts` must stay free of `vscode` imports so it remains unit-testable.
- The webview CSP allows only nonce'd scripts from the extension: keep the bundle a single file
  (no dynamic `import()`), no remote resources.
- Tailwind's `@source '.'` in `app.css` is needed for the browser preview (Vite root = `preview/`).
- `vsce package --no-dependencies`: everything must be bundled; dependencies are devDependencies.
- Context menus: one `ActionMenu` per area; children call `open(e, items)` and the innermost element wins.
  A `MenuItem` may carry an `icon` (lucide), be `destructive`, or hold `items` (a submenu); empty
  submenus and stray separators are dropped. Branch deletion is `deleteItems()`: one item or a submenu,
  depending on which copies exist and may go.
- e2e tests import `../src/*` and are bundled with `vscode` external, so they share the extension's `vscode`
  API object: that's how `actions.test.ts` stubs `showInputBox`/`showQuickPick`/`showWarningMessage`.
  `activate()` returns `{ git }` only so the smoke test can observe graph loads.
- Not covered by e2e: what the webview renders and its clicks (use the browser preview), `openFolder`
  (it would open a new window). Worktree statuses refresh with the graph, but edits made inside _another_
  worktree don't trigger a refresh (only the repos open in this window are watched).
- Slow repository? The **Treeline** output channel logs git commands, graph loads and pull request
  lookups of a second or more (`Git`'s `onSlow`, `timed()` in `panel.ts`), and each branch details
  preload's total.
- Launching VS Code by hand with a custom `--user-data-dir`: macOS caps the IPC socket path at 103 chars,
  so keep that directory path short.
