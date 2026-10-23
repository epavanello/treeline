/**
 * Stands in for the extension host so the webview runs in a plain browser
 * (`pnpm --filter @treeline/webview preview`). Answers RPC calls from
 * fixture.json and logs everything else.
 */
import { actionTarget, type Action, type GraphQuery, type RpcRequest } from '@treeline/shared';
import fixture from './fixture.json';

const reply = (id: number, result: unknown) =>
  setTimeout(() => window.postMessage({ id, result }, '*'), 30);

let state: unknown;
let view = { worktrees: true, branches: true, tags: true };
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
          .filter((c) => !q.authors.length || q.authors.includes(c.author))
          .filter(
            (c) =>
              !q.focus || c.side || c.hash === '*' || c.hash === fixture.graph.compare?.mergeBase
          );
        const commits = all.slice(0, q.maxCommits);
        return reply(id, {
          ...fixture.graph,
          commits,
          hasMore: commits.length < all.length
        });
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
      case 'getView':
        return reply(id, view);
      case 'setView':
        view = args[0] as typeof view;
        return reply(id, undefined);
      case 'run': {
        // Pretend git takes a while, so the busy spinners can be seen
        const key = actionTarget(args[1] as Action);
        window.postMessage({ event: 'busy', key, busy: true }, '*');
        return setTimeout(() => {
          window.postMessage({ event: 'busy', key, busy: false }, '*');
          reply(id, undefined);
        }, 2000);
      }
      default:
        return reply(id, undefined);
    }
  }
});
