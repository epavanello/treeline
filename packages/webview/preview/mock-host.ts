/**
 * Stands in for the extension host so the webview runs in a plain browser
 * (`pnpm --filter @treeline/webview preview`). Answers RPC calls from
 * fixture.json and logs everything else.
 */
import {
  actionTarget,
  UNCOMMITTED,
  DEFAULT_VIEW,
  type Action,
  type GraphQuery,
  type PullRequest,
  type RpcRequest
} from '@treeline/shared';
import fixture from './fixture.json';

/**
 * Pull requests on the fixture's most recent branches (fixture.json has none: GitHub isn't asked),
 * in every state the UI draws. `sam` is who is signed in.
 */
function demoPulls(): PullRequest[] {
  const now = Math.round(Date.now() / 1000);
  const base = fixture.graph.compare?.base.replace(/^[^/]+\//, '') ?? 'main';
  const seen = new Set<string>([base]);
  const branches = [...fixture.graph.heads, ...fixture.graph.remoteHeads]
    .sort((a, b) => b.date - a.date)
    .map((r) => ({ name: r.ref.name.replace(/^origin\//, ''), hash: r.hash, date: r.date }))
    .filter((b) => !seen.has(b.name) && !!seen.add(b.name));
  // The checked-out branch's pull request comes third by date: the row puts it first
  const current = branches.findIndex((b) => b.name === fixture.graph.currentBranch);
  if (current > 2) branches.splice(2, 0, ...branches.splice(current, 1));
  const looks: Partial<PullRequest>[] = [
    {
      author: 'sam',
      decision: 'changes',
      reviewers: [
        { login: 'maya', state: 'changes' },
        { login: 'leo', state: 'requested' }
      ],
      threads: { resolved: 3, unresolved: 2 },
      checks: 'failing'
    },
    { state: 'draft', author: 'leo', checks: 'pending' },
    {
      author: 'leo',
      decision: 'approved',
      reviewers: [{ login: 'sam', state: 'approved' }],
      threads: { resolved: 1, unresolved: 0 }
    },
    { author: 'maya', decision: 'required', reviewers: [{ login: 'sam', state: 'requested' }] },
    { state: 'merged', author: 'sam', checks: null },
    { author: 'sam', decision: 'approved', reviewers: [{ login: 'maya', state: 'approved' }] },
    { state: 'closed', author: 'leo', checks: null },
    { author: 'maya', threads: { resolved: 0, unresolved: 4 } }
  ];
  return branches.slice(0, looks.length).map((b, i) => ({
    number: 120 - i * 3,
    title: b.name
      .replace(/^[a-z]+\//, '')
      .replace(/[-_]/g, ' ')
      .replace(/^./, (c) => c.toUpperCase()),
    url: `https://github.com/acme/shop/pull/${120 - i * 3}`,
    state: 'open',
    author: 'sam',
    updatedAt: Math.min(now - 3600 * (i + 1), b.date + 3600),
    head: b.name,
    headOid: b.hash,
    base,
    decision: null,
    reviewers: [],
    threads: { resolved: 0, unresolved: 0 },
    checks: 'passing',
    ...looks[i]
  }));
}

/** `?slow`: the graph takes a while to load, as in a big repository (to see the loading states). */
const slow = new URLSearchParams(location.search).has('slow');
const reply = (id: number, result: unknown, ms = 30) =>
  setTimeout(() => window.postMessage({ id, result }, '*'), ms);

let state: unknown;
let view = structuredClone(DEFAULT_VIEW);
let repoView: Record<string, unknown> | null = null;
const summaries = new Map<string, string>();
(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  getState: () => state,
  setState: (s: unknown) => (state = s),
  postMessage({ id, method, args }: RpcRequest) {
    console.log('[host]', method, args);
    switch (method) {
      case 'getRepos':
        return reply(id, [{ path: fixture.repo, name: 'fixture-repo' }]);
      case 'getGraph': {
        const q = args[0] as GraphQuery;
        const all = fixture.graph.commits
          .filter((c) => q.showStashes || !(c as { stashBase?: string }).stashBase)
          .filter((c) => q.showWorktrees || !(c as { worktree?: string }).worktree)
          .map((c) => (q.showTags ? c : { ...c, refs: c.refs.filter((r) => r.kind !== 'tag') }))
          .filter((c) => !q.authors.length || q.authors.includes(c.author))
          .filter(
            (c) =>
              !q.focus.length ||
              (c.side && q.focus.includes(c.side)) ||
              c.hash === fixture.graph.compare?.mergeBase
          );
        const commits = all.slice(0, q.maxCommits);
        return reply(
          id,
          { ...fixture.graph, commits, hasMore: commits.length < all.length },
          slow ? 1500 : 30
        );
      }
      case 'locate': {
        const [q, hash] = args as [GraphQuery, string];
        const rows = fixture.graph.commits.filter(
          (c) => c.hash !== '*' && !(c as { stashBase?: string }).stashBase
        );
        const at = rows
          .filter((c) => !q.authors.length || q.authors.includes(c.author))
          .findIndex((c) => c.hash === hash);
        return reply(id, at >= 0 ? { at } : { hidden: rows.some((c) => c.hash === hash) });
      }
      case 'getDetails':
        return reply(
          id,
          (fixture.details as Record<string, unknown>)[(args[1] as { hash: string }).hash]
        );
      case 'compare': {
        // Any plausible file list: every file touched by the fixture's commits
        const files = Object.values(fixture.details).flatMap((d) => d.files);
        return reply(id, [...new Map(files.map((f) => [f.path, f])).values()]);
      }
      case 'branchStack': {
        const stacks = (fixture as { stacks?: Record<string, unknown> }).stacks ?? {};
        return reply(id, stacks[args[1] as string] ?? { above: [], stack: [] });
      }
      case 'getPatch': {
        // Recorded by the fixture script: commits by hash, the working tree as '*', worktrees by path
        const [repo, , to] = args as string[];
        const key = to === UNCOMMITTED && repo !== fixture.repo ? repo : to;
        return reply(
          id,
          (fixture as { patches?: Record<string, string> }).patches?.[key] ?? '',
          200
        );
      }
      case 'getCodeTheme':
        return reply(id, (fixture as { theme?: unknown }).theme ?? null);
      case 'getGrammars': {
        const name = (args[0] as string).split('/').pop()!.toLowerCase();
        const kind = name.includes('.') ? name.slice(name.lastIndexOf('.')) : name;
        return reply(
          id,
          (fixture as { grammars?: Record<string, unknown> }).grammars?.[kind] ?? null
        );
      }
      case 'summarize': {
        // Claude's 4 lines, after a few seconds the first time
        const key = `${args[0]}\0${args[1]}`;
        if (args[2]) return reply(id, summaries.get(key) ?? null);
        const text =
          'Adds a price range and category filter to the product search, kept in the URL so results can be shared.\nThe search API gains matching query parameters; the old endpoint still works.\nWork in progress: the filter panel has no tests yet.';
        return setTimeout(() => {
          summaries.set(key, text);
          reply(id, text);
        }, 2500);
      }
      case 'getClaudeSessions':
        return reply(id, (fixture as { claudeSessions?: unknown[] }).claudeSessions ?? []);
      case 'resumeClaudeSession':
        console.log('resume', args[0]);
        return reply(id, undefined);
      case 'getWorktreeDetails':
        return reply(
          id,
          (fixture.worktreeDetails as Record<string, unknown>)[args[0] as string] ?? {
            compare: null,
            files: [],
            kept: false
          }
        );
      case 'getBranchDetails': {
        const all = (fixture as { branchDetails?: Record<string, unknown> }).branchDetails ?? {};
        const refs = args[1] as { ref: string }[];
        return reply(
          id,
          Object.fromEntries(
            refs.map(({ ref }) => [
              ref,
              all[ref.replace(/^refs\/(heads|remotes)\//, '')] ?? { authors: [], unique: 0 }
            ])
          )
        );
      }
      case 'getPullRequests':
      case 'connectGitHub':
        return reply(id, {
          status: 'ok',
          via: 'gh',
          repo: 'acme/shop',
          remote: 'origin',
          viewer: 'sam',
          prs: demoPulls()
        });
      case 'pullRange': {
        // As if fetched: from the fixture's fork point to its head (whose patch is recorded)
        const pr = args[2] as PullRequest;
        return reply(id, { from: fixture.graph.compare?.mergeBase ?? '', to: pr.headOid }, 400);
      }
      case 'getRepoView':
        return reply(id, repoView);
      case 'setRepoView':
        repoView = args[1] as Record<string, unknown>;
        return reply(id, undefined);
      case 'getView':
        return reply(id, view);
      case 'setView':
        view = args[0] as typeof view;
        return reply(id, undefined);
      case 'run': {
        // Pretend git takes a while, so the busy spinners can be seen
        const action = args[1] as Action;
        const key = actionTarget(action);
        window.postMessage({ event: 'busy', key, busy: true }, '*');
        return setTimeout(() => {
          // Deletions really happen, then the graph reloads, as with the extension
          const gone =
            action.type === 'deleteBranch'
              ? [action.name]
              : action.type === 'deleteBranches'
                ? [...action.local, ...action.remote.map((r) => r.name)]
                : [];
          if (gone.length) {
            const g = fixture.graph as {
              heads: { ref: { name: string } }[];
              remoteHeads: typeof g.heads;
            };
            g.heads = g.heads.filter((r) => !gone.includes(r.ref.name));
            g.remoteHeads = g.remoteHeads.filter((r) => !gone.includes(r.ref.name));
            for (const c of fixture.graph.commits)
              (c as { refs: { name: string }[] }).refs = c.refs.filter(
                (r: { name: string }) => !gone.includes(r.name)
              );
          }
          window.postMessage({ event: 'busy', key, busy: false }, '*');
          reply(id, undefined);
          window.postMessage({ event: 'refresh' }, '*');
        }, 2000);
      }
      default:
        return reply(id, undefined);
    }
  }
});
