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
   `rev-list --left-right HEAD...base`. The CompareBar shows ↑ahead ↓behind, rows are tinted green (only on
   HEAD) / blue (only on the base), the merge base is labelled "fork point". "Only ↑↓" = focus mode
   (`log --boundary HEAD...base`). "Diff" = every file since the merge base, working tree included.
2. **Diffs on real files**: language servers ignore virtual documents (`treeline:`, and VS Code's own `git:`),
   so `openDiff` uses the file on disk as the right side whenever it matches that revision
   (`git diff --quiet <rev> -- <path>`); "Diff" and "Compare with Working Tree" always do. For an old commit,
   "Open in Temporary Worktree" gives a real checkout in its own window.
3. **Worktrees**: `Git.getWorktrees` is part of `GraphData`; branches checked out elsewhere get `Ref.worktree`
   and show that worktree's status on their badge. The WorktreeStrip under the compare bar lists every
   worktree (click: jump to its commit, double-click: open, right-click: `worktreeItems()` in `menus.ts`).
   The native **Worktrees view** in the Source Control sidebar
   (`worktreeView.ts`) has inline open/remove, terminal, reveal, "Bring Branch to Main Worktree" (remove the
   worktree, check the branch out in the main one, carrying uncommitted changes through a stash) and "Remove
   Worktree and Delete Branch".
4. **Fewer prompts**: actions ask only for a needed name or before losing something: uncommitted changes,
   commits no other ref contains (`rev-list <b> --not --exclude=<b> --branches --remotes --tags`), remote
   state, stashes. No option screens: git defaults, plus explicit variants (Force Push…).
5. **Commit messages with Claude** (`commitMessage.ts`): `claude -p --model haiku` run in a temp dir with the
   staged diff (or all changes) and the last 15 subjects on stdin; falls back to `vscode.lm`. The result goes
   into the Source Control input box. Triggers: ✨ in the Source Control title bar, the Uncommitted Changes menu.
6. **Author filter**: `GraphQuery.authors` → repeated `--author=^<escaped name> <` (OR, exact name).

Later ideas: merge local branch + its upstream into one badge (like Git Graph), avatars, commit search
server-side (`--grep`), a WebviewPanelSerializer so the panel survives window reloads, settings
(page size, date format, graph style), multi-select actions.

### Releases

Published as `epavanello.treeline` on the **VS Code Marketplace** and **Open VSX** (Cursor, VSCodium and
Windsurf install from Open VSX). `.github/workflows/release.yml` runs on every push to `main`: when the
`package.json` version has no `v<version>` tag yet, it runs the tests, packages the `.vsix`, creates the tag
and a GitHub release (notes = that version's CHANGELOG section, required), then publishes:

- **Open VSX**: trusted publishing (GitHub OIDC, no secret), active once the repository variable
  `OPENVSX_TRUSTED_PUBLISHING` is `true` (set after the namespace claim EclipseFdn/open-vsx.org#14627 is
  approved and the trusted publisher is registered). Until then the step is skipped with a notice.
- **VS Code Marketplace**: automatic only with a `VSCE_PAT` secret (an Azure DevOps token, which now requires
  an Azure subscription). Otherwise the run summary links the `.vsix` to upload by hand at
  marketplace.visualstudio.com/manage/publishers/epavanello (… → Update).

A push that changes the extension without bumping the version publishes nothing and gets a warning.
0.1.0 was uploaded by hand to both stores.

## Layout

```
packages/
  shared/      Types only: the host ⇄ webview contract (HostApi, Action, Commit, …). Start here.
  extension/   The VS Code extension (the published package). Bundled with esbuild → dist/extension.cjs.
    src/extension.ts  activate(): wires everything up
    src/git.ts        vscode-free git CLI layer (log, refs, stashes, details, diffs). Unit-tested.
    src/actions.ts    every write operation; native prompts only when needed (see "Fewer prompts")
    src/worktreeView.ts  the Worktrees TreeView in the Source Control sidebar + its commands
    src/commitMessage.ts  commit message generation (Claude CLI, fallback vscode.lm)
    src/repos.ts      repo discovery + change events via the built-in vscode.git API (fallback: watcher)
    src/diff.ts       `treeline:` TextDocumentContentProvider + vscode.diff
    src/panel.ts      the WebviewPanel, CSP, and the RPC dispatcher
    test/             vitest against a real temporary repo (test/fixture.ts)
    e2e/              @vscode/test-electron suite: panel smoke test, diffs, every Action with scripted prompts
  webview/     Svelte 5 + Vite + Tailwind 4 + shadcn-svelte → packages/extension/dist/webview/index.{js,css}
    src/lib/app.svelte.ts   all UI state (one class, runes)
    src/lib/graph.ts        lane layout algorithm (unit-tested)
    src/lib/rpc.ts          typed Proxy over postMessage (`host.getGraph(q)` …)
    src/lib/menus.ts        context menus as data
    src/lib/components/     CommitList, GraphSvg, DetailsPanel, Toolbar, CompareBar, WorktreeStrip,
                            MultiFilter (branches, authors, base), ActionMenu, RefBadge, WorktreeState
    preview/                runs the webview in a plain browser with a mocked host
```

## How it works

- **RPC**: the webview calls `host.method(...args)` (`src/lib/rpc.ts`); `panel.ts` dispatches to a `HostApi`
  object and replies `{ id, result | error }`. The host pushes `{ event: 'refresh' | 'repos' }`.
  Adding a capability = add it to `HostApi` in `shared`, implement it in `panel.ts`, call it from the webview.
- **Actions**: the webview (or the Worktrees view) sends an `Action` (`shared`); `plan()` in `actions.ts` turns
  it into steps (git argv lists, or callbacks such as "open the new worktree"). Adding an action = a variant in
  `Action`, a `case` in `plan()`, a menu item in `menus.ts`. After every action, `refresh()` reloads the graph
  and the Worktrees view.
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
  Promise. Prefer that to manual loading state.

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
- e2e tests import `../src/*` and are bundled with `vscode` external, so they share the extension's `vscode`
  API object: that's how `actions.test.ts` stubs `showInputBox`/`showQuickPick`/`showWarningMessage`.
  `activate()` returns `{ git }` only so the smoke test can observe graph loads.
- Not covered by e2e: what the webview renders and its clicks (use the browser preview), `openFolder`
  (it would open a new window). Worktree statuses refresh with the graph, but edits made inside _another_
  worktree don't trigger a refresh (only the repos open in this window are watched).
- Launching VS Code by hand with a custom `--user-data-dir`: macOS caps the IPC socket path at 103 chars,
  so keep that directory path short.
