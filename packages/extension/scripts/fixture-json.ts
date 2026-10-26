/**
 * Dumps the fixture repo (test/fixture.ts) as the JSON the webview preview
 * serves instead of a real extension host. Run: `pnpm --filter treeline fixture [repo]`
 * (defaults to the synthetic fixture repo; pass a path to preview a real one).
 */
import { writeFileSync } from 'node:fs';
import { Git } from '../src/git';
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
writeFileSync(
  new URL('../../webview/preview/fixture.json', import.meta.url),
  JSON.stringify({ repo: dir, graph, details, worktreeDetails, branchDetails }, null, 2)
);
console.log(`wrote ${graph.commits.length} commits`);
