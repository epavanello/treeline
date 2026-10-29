/**
 * The repository's GitHub pull requests: one GraphQL query for all of them, run by the gh CLI when
 * it's signed in (nothing to ask), else with the editor's GitHub account. vscode-free: the account's
 * token comes from a callback, so this is unit-testable with a fake `gh`.
 */
import { execFile } from 'node:child_process';
import type { PullRequest, PullRequests } from '@treeline/shared';
import type { Git } from './git';

/** How long an answer is reused: the graph reloads often, GitHub doesn't need asking that often. */
const TTL = 60_000;

const QUERY = `query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url state isDraft updatedAt headRefName headRefOid baseRefName isCrossRepository
        mergeCommit { oid }
        author { login }
        reviewDecision
        reviewRequests(first: 20) {
          nodes { requestedReviewer { ... on User { login } ... on Team { name } ... on Bot { login } } }
        }
        latestReviews(first: 20) { nodes { author { login } state } }
        reviewThreads(first: 100) { nodes { isResolved } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

/** `git@github.com:o/r.git`, `https://github.com/o/r`, `ssh://git@host:22/o/r.git` → host, owner, name. */
export function parseRemote(url: string) {
  const m = url
    .trim()
    .match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return m ? { host: m[1], owner: m[2], name: m[3] } : null;
}

/** One node of the query's answer, as GitHub's GraphQL API returns it. */
export function toPullRequest(n: any): PullRequest {
  const verdicts: Record<string, PullRequest['reviewers'][number]['state']> = {
    APPROVED: 'approved',
    CHANGES_REQUESTED: 'changes',
    COMMENTED: 'commented',
    DISMISSED: 'dismissed'
  };
  const reviewers = new Map<string, PullRequest['reviewers'][number]>();
  for (const r of n.latestReviews?.nodes ?? [])
    if (r.author && verdicts[r.state])
      reviewers.set(r.author.login, { login: r.author.login, state: verdicts[r.state] });
  // Asked (again) after their review: waiting on them
  for (const r of n.reviewRequests?.nodes ?? []) {
    const login = r.requestedReviewer?.login ?? r.requestedReviewer?.name;
    if (login) reviewers.set(login, { login, state: 'requested' });
  }
  const threads = n.reviewThreads?.nodes ?? [];
  const resolved = threads.filter((t: any) => t.isResolved).length;
  const rollup: string | undefined = n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  return {
    number: n.number,
    title: n.title,
    url: n.url,
    state:
      n.state === 'MERGED'
        ? 'merged'
        : n.state === 'CLOSED'
          ? 'closed'
          : n.isDraft
            ? 'draft'
            : 'open',
    author: n.author?.login ?? 'ghost',
    updatedAt: Math.round(Date.parse(n.updatedAt) / 1000),
    head: n.headRefName,
    headOid: n.headRefOid,
    base: n.baseRefName,
    ...(n.mergeCommit?.oid && { mergeOid: n.mergeCommit.oid }),
    decision:
      n.reviewDecision === 'APPROVED'
        ? 'approved'
        : n.reviewDecision === 'CHANGES_REQUESTED'
          ? 'changes'
          : n.reviewDecision === 'REVIEW_REQUIRED'
            ? 'required'
            : null,
    reviewers: [...reviewers.values()],
    threads: { resolved, unresolved: threads.length - resolved },
    checks: !rollup
      ? null
      : rollup === 'SUCCESS'
        ? 'passing'
        : rollup === 'PENDING' || rollup === 'EXPECTED'
          ? 'pending'
          : 'failing'
  };
}

export class Pulls {
  private readonly cache = new Map<string, { at: number; result: PullRequests }>();
  /** The gh account that could read each repository, when it isn't the active one. */
  private readonly ghLogin = new Map<string, string>();

  constructor(
    private readonly git: Git,
    /** The editor's GitHub token: silently if already granted, or asking for consent (`ask`). */
    private readonly token: (ask: boolean) => Promise<string | undefined>,
    private readonly gh = 'gh'
  ) {}

  /** `fresh`: ask GitHub even if the last answer is recent; `connect`: sign in with the editor. */
  async get(repo: string, fresh = false, connect = false): Promise<PullRequests> {
    const hit = this.cache.get(repo);
    if (hit && !fresh && !connect && Date.now() - hit.at < TTL) return hit.result;
    const result = await this.load(repo, connect).catch((e): PullRequests => ({
      status: 'error',
      message: (e as Error).message
    }));
    this.cache.set(repo, { at: Date.now(), result });
    return result;
  }

  /** After a fetch, a push or a deleted branch: the next `get` asks GitHub again. */
  invalidate(repo: string) {
    this.cache.delete(repo);
  }

  private async load(repo: string, connect: boolean): Promise<PullRequests> {
    const remotes = (await this.git.exec(repo, ['remote'])).split('\n').filter(Boolean);
    const remote = remotes.includes('origin') ? 'origin' : remotes[0];
    const at = remote
      ? parseRemote(await this.git.exec(repo, ['remote', 'get-url', remote]).catch(() => ''))
      : null;
    if (!at || !/github/i.test(at.host)) return { status: 'none' };
    const slug = `${at.owner}/${at.name}`;

    let via: 'gh' | 'editor' = 'gh';
    // gh missing, signed out, or signed in with an account that can't see this repository: next
    let data = connect ? undefined : await this.viaGhAccounts(at.host, at.owner, at.name);
    if (!data && at.host === 'github.com') {
      const token = await this.token(connect).catch(() => undefined);
      if (token) {
        via = 'editor';
        data = await this.viaApi(token, at.owner, at.name);
      }
    }
    const nodes = data?.repository?.pullRequests?.nodes;
    if (!nodes) return { status: 'signin', repo: slug };
    // A fork's branch can share a name with one of ours: only pull requests from this repository
    const prs = nodes.filter((n: any) => !n.isCrossRepository).map(toPullRequest);
    return { status: 'ok', via, repo: slug, remote, viewer: data.viewer?.login ?? '', prs };
  }

  /**
   * With gh's active account, else with the other accounts gh is signed in with (work and personal,
   * say): the one that can read the repository is remembered for it.
   */
  private async viaGhAccounts(host: string, owner: string, name: string): Promise<any> {
    const key = `${host}/${owner}/${name}`;
    const known = this.ghLogin.get(key);
    const logins: (string | undefined)[] = known
      ? [known]
      : [undefined, ...(await this.ghLogins(host).catch(() => []))];
    for (const login of logins) {
      const token = login
        ? (
            await this.runGh(['auth', 'token', '--hostname', host, '--user', login]).catch(() => '')
          ).trim()
        : undefined;
      if (login && !token) continue;
      const data = await this.runGh(
        [
          'api',
          'graphql',
          '--hostname',
          host,
          '-f',
          `query=${QUERY}`,
          '-f',
          `owner=${owner}`,
          '-f',
          `name=${name}`
        ],
        token
      ).then(
        (out) => JSON.parse(out).data,
        () => undefined
      );
      if (data?.repository) {
        if (login) this.ghLogin.set(key, login);
        return data;
      }
    }
    this.ghLogin.delete(key);
    return undefined;
  }

  /** gh's other signed-in accounts on `host` (older gh versions can't list them: none). */
  private async ghLogins(host: string): Promise<string[]> {
    const { hosts } = JSON.parse(await this.runGh(['auth', 'status', '--json', 'hosts']));
    return ((hosts?.[host] ?? []) as { login: string; active: boolean; state: string }[])
      .filter((a) => !a.active && a.state === 'success')
      .map((a) => a.login);
  }

  /** Runs gh; `token` stands in for its active account. */
  private runGh(args: string[], token?: string): Promise<string> {
    const env = token
      ? { ...process.env, GH_TOKEN: token, GH_ENTERPRISE_TOKEN: token }
      : process.env;
    return new Promise((resolve, reject) =>
      execFile(this.gh, args, { env, timeout: 20_000, maxBuffer: 32 * 1024 * 1024 }, (err, out) =>
        err ? reject(err) : resolve(out)
      )
    );
  }

  private async viaApi(token: string, owner: string, name: string): Promise<any> {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'treeline'
      },
      body: JSON.stringify({ query: QUERY, variables: { owner, name } })
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText}`);
    return ((await res.json()) as { data?: unknown }).data;
  }
}
