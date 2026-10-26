/**
 * Stands in for the extension host so the webview runs in a plain browser
 * (`pnpm --filter @treeline/webview preview`). Answers RPC calls from
 * fixture.json and logs everything else.
 */
import {
  actionTarget,
  DEFAULT_VIEW,
  type Action,
  type GraphQuery,
  type PullRequest,
  type RpcRequest
} from '@treeline/shared';
import fixture from './fixture.json';

/** Pull requests to show on the demo branches (fixture.json has none: it isn't on GitHub). */
function demoPulls(): PullRequest[] {
  const hash = (name: string) =>
    [...fixture.graph.heads, ...fixture.graph.remoteHeads].find((r) => r.ref.name === name)?.hash ??
    '';
  const now = Math.round(Date.now() / 1000);
  const pr = (over: Partial<PullRequest> & Pick<PullRequest, 'number' | 'head' | 'title'>) => ({
    url: `https://github.com/acme/shop/pull/${over.number}`,
    state: 'open' as const,
    author: 'sam',
    updatedAt: now - 3 * 3600,
    headOid: hash(over.head),
    base: 'main',
    decision: null,
    reviewers: [],
    threads: { resolved: 0, unresolved: 0 },
    checks: 'passing' as const,
    ...over
  });
  return [
    pr({
      number: 42,
      head: 'feat/checkout-redesign',
      title: 'Checkout redesign: one page, Apple Pay, saved cards',
      decision: 'changes',
      reviewers: [
        { login: 'maya', state: 'changes' },
        { login: 'leo', state: 'requested' }
      ],
      threads: { resolved: 3, unresolved: 2 },
      checks: 'failing'
    }),
    pr({
      number: 45,
      head: 'feat/search-filters',
      title: 'Search filters and price range',
      state: 'draft',
      author: 'leo',
      checks: 'pending'
    }),
    pr({
      number: 44,
      head: 'fix/coupon-expiry',
      title: 'Honour the coupon expiry timezone',
      author: 'leo',
      decision: 'approved',
      reviewers: [{ login: 'sam', state: 'approved' }],
      threads: { resolved: 1, unresolved: 0 }
    }),
    pr({
      number: 38,
      head: 'fix/cart-rounding',
      title: 'Round cart totals per line',
      state: 'merged',
      updatedAt: now - 5 * 86400,
      checks: null
    })
  ];
}

/** `?slow`: the graph takes a while to load, as in a big repository (to see the loading states). */
const slow = new URLSearchParams(location.search).has('slow');
const reply = (id: number, result: unknown, ms = 30) =>
  setTimeout(() => window.postMessage({ id, result }, '*'), ms);

let state: unknown;
let view = structuredClone(DEFAULT_VIEW);
let repoView: Record<string, unknown> | null = null;
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
        return reply(id, { status: 'ok', via: 'gh', repo: 'acme/shop', prs: demoPulls() });
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
