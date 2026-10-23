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
  base: null,
  focus: false,
  showRemotes: true,
  maxCommits: 600
});
const details = Object.fromEntries(
  await Promise.all(
    graph.commits.slice(0, 60).map(async (c) => [c.hash, await git.getDetails(dir, c)] as const)
  )
);
writeFileSync(
  new URL('../../webview/preview/fixture.json', import.meta.url),
  JSON.stringify({ repo: dir, graph, details }, null, 2)
);
console.log(`wrote ${graph.commits.length} commits`);
