/**
 * Dumps the fixture repo (test/fixture.ts) as the JSON the webview preview
 * serves instead of a real extension host. Run: `pnpm --filter treeline fixture [repo]`
 * (defaults to the synthetic fixture repo; pass a path to preview a real one).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNCOMMITTED } from '@treeline/shared';
import { grammarsOf, themeOf, type Extension } from '../src/codeColors';
import { Git } from '../src/git';
import { ClaudeSessions } from '../src/sessions';
import { createFixtureRepo } from '../test/fixture';

const git = new Git();
const dir = process.argv[2] ?? createFixtureRepo().dir;
const graph = await git.getGraph({
  repo: dir,
  branches: [],
  authors: [],
  hidden: [],
  base: null,
  focus: [],
  showRemotes: true,
  showTags: true,
  showStashes: true,
  showWorktrees: true,
  maxCommits: 600
});
const details = Object.fromEntries(
  await Promise.all(
    // Other worktrees' Uncommitted Changes rows show that worktree's files, not commit details
    graph.commits
      .filter((c) => !c.worktree)
      .slice(0, 60)
      .map(async (c) => [c.hash, await git.getDetails(dir, c)] as const)
  )
);
// What each worktree card loads on hover
const worktreeDetails = Object.fromEntries(
  await Promise.all(
    graph.worktrees
      .filter((w) => !w.prunable)
      .map(async (w) => [w.path, await git.worktreeDetails(w.path, graph.compare?.base ?? null)])
  )
);
// What the branch rows and cards load after each graph load
const base = graph.compare?.base;
const branchDetails = base
  ? Object.fromEntries(
      await Promise.all(
        [...graph.heads, ...graph.remoteHeads].map(
          async (r) =>
            [
              r.ref.name,
              await git.branchDetails(
                dir,
                `refs/${r.ref.kind === 'head' ? 'heads' : 'remotes'}/${r.ref.name}`,
                base
              )
            ] as const
        )
      )
    )
  : {};
// What the "Graph Filter" stack items ask for, per local branch
const stacks = base
  ? Object.fromEntries(
      await Promise.all(
        graph.heads.map(async (h) => [h.ref.name, await git.stack(dir, h.ref.name, base)] as const)
      )
    )
  : {};
// The inline diffs: each loaded commit's patch, the working tree's and each worktree's
const patches: Record<string, string> = {};
const CAP = 200_000; // the fixture is one JSON string
for (const c of graph.commits.filter((c) => !c.worktree).slice(0, 60))
  patches[c.hash] =
    c.hash === UNCOMMITTED
      ? await git.patch(dir, 'HEAD', UNCOMMITTED, CAP)
      : await git.patch(dir, c.stashBase ?? c.parents[0] ?? '', c.hash, CAP);
for (const w of graph.worktrees.filter((w) => !w.prunable && !w.current))
  patches[w.path] = await git.patch(w.path, 'HEAD', UNCOMMITTED, CAP);
// Their colors: VS Code's own Dark Modern theme and grammars, from its installation (when there is one)
const bundled = '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions';
const extensions: Extension[] = existsSync(bundled)
  ? readdirSync(bundled)
      .filter((d) => existsSync(join(bundled, d, 'package.json')))
      .map((d) => ({
        dir: join(bundled, d),
        contributes:
          JSON.parse(readFileSync(join(bundled, d, 'package.json'), 'utf8')).contributes ?? {}
      }))
  : [];
const theme = await themeOf(extensions, 'Dark Modern', 'dark', []);
// By file kind (what the webview asks once per kind, see highlight.ts)
const kind = (path: string) => {
  const name = path.split('/').pop()!.toLowerCase();
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : name;
};
const grammars: Record<string, unknown> = {};
for (const p of Object.values(patches).flatMap((p) =>
  [...p.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1])
))
  grammars[kind(p)] ??= await grammarsOf(extensions, p);
// The Claude Code sessions of its folders, from this machine's files (none for the synthetic repo)
const claudeSessions = await new ClaudeSessions().list(graph.worktrees.map((w) => w.path));
writeFileSync(
  new URL('../../webview/preview/fixture.json', import.meta.url),
  JSON.stringify(
    {
      repo: dir,
      graph,
      details,
      worktreeDetails,
      branchDetails,
      stacks,
      patches,
      theme,
      grammars,
      claudeSessions
    },
    null,
    2
  )
);
console.log(`wrote ${graph.commits.length} commits`);
