import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Git } from '../src/git';
import { parseRemote, Pulls, toPullRequest } from '../src/pulls';
import { createFixtureRepo } from './fixture';

const node = {
  number: 7,
  title: 'Checkout redesign',
  url: 'https://github.com/acme/shop/pull/7',
  state: 'OPEN',
  isDraft: false,
  updatedAt: '2026-10-20T10:00:00Z',
  headRefName: 'feat/checkout',
  headRefOid: 'abc',
  baseRefName: 'main',
  isCrossRepository: false,
  author: { login: 'sam' },
  reviewDecision: 'CHANGES_REQUESTED',
  reviewRequests: { nodes: [{ requestedReviewer: { login: 'leo' } }] },
  latestReviews: {
    nodes: [
      { author: { login: 'maya' }, state: 'CHANGES_REQUESTED' },
      { author: { login: 'leo' }, state: 'COMMENTED' }
    ]
  },
  reviewThreads: { nodes: [{ isResolved: true }, { isResolved: false }, { isResolved: false }] },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] }
};

describe('pull requests', () => {
  it('reads GitHub remotes', () => {
    const at = { host: 'github.com', owner: 'acme', name: 'shop' };
    expect(parseRemote('git@github.com:acme/shop.git')).toEqual(at);
    expect(parseRemote('https://github.com/acme/shop')).toEqual(at);
    expect(parseRemote('ssh://git@github.com:22/acme/shop.git')).toEqual(at);
    expect(parseRemote('https://token@github.acme.com/acme/shop.git')?.host).toBe(
      'github.acme.com'
    );
  });

  it('keeps what the card shows', () => {
    expect(toPullRequest(node)).toEqual({
      number: 7,
      title: 'Checkout redesign',
      url: 'https://github.com/acme/shop/pull/7',
      state: 'open',
      author: 'sam',
      updatedAt: Date.parse('2026-10-20T10:00:00Z') / 1000,
      head: 'feat/checkout',
      headOid: 'abc',
      base: 'main',
      decision: 'changes',
      // Asked again after commenting: waiting on leo
      reviewers: [
        { login: 'maya', state: 'changes' },
        { login: 'leo', state: 'requested' }
      ],
      threads: { resolved: 1, unresolved: 2 },
      checks: 'failing'
    });
    expect(toPullRequest({ ...node, state: 'MERGED' }).state).toBe('merged');
    expect(toPullRequest({ ...node, isDraft: true }).state).toBe('draft');
    expect(toPullRequest({ ...node, mergeCommit: { oid: 'def' } }).mergeOid).toBe('def');
  });

  it('asks gh, trying each of its accounts, then the editor', async () => {
    const { dir, git } = createFixtureRepo();
    git('remote', 'set-url', 'origin', 'git@github.com:acme/shop.git');
    // A fake gh: the active account can't see acme/shop, the "work" one can
    const bin = mkdtempSync(join(tmpdir(), 'treeline-gh-'));
    const answer = JSON.stringify({
      data: { viewer: { login: 'work' }, repository: { pullRequests: { nodes: [node] } } }
    });
    writeFileSync(
      join(bin, 'gh'),
      `#!/bin/sh
case "$1 $2" in
  "auth status") echo '{"hosts":{"github.com":[{"login":"me","active":true,"state":"success"},{"login":"work","active":false,"state":"success"}]}}' ;;
  "auth token") echo "token-of-$6" ;;
  "api graphql") [ "$GH_TOKEN" = "token-of-work" ] && echo '${answer}' || { echo '{"data":{"repository":null}}'; exit 1; } ;;
esac
`
    );
    chmodSync(join(bin, 'gh'), 0o755);
    const pulls = new Pulls(new Git(), async () => undefined, join(bin, 'gh'));
    const result = await pulls.get(dir);
    expect(result).toMatchObject({
      status: 'ok',
      via: 'gh',
      repo: 'acme/shop',
      remote: 'origin',
      viewer: 'work'
    });
    expect(result.status === 'ok' && result.prs.map((p) => p.number)).toEqual([7]);

    // No gh at all: the editor's account, else nothing to read with
    const editor = new Pulls(new Git(), async () => undefined, join(bin, 'missing'));
    expect(await editor.get(dir)).toEqual({ status: 'signin', repo: 'acme/shop' });
    git('remote', 'set-url', 'origin', 'https://gitlab.com/acme/shop.git');
    expect(await editor.get(dir, true)).toEqual({ status: 'none' });
  });
});
