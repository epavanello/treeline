import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Git } from '../src/git';

const git = new Git();
let server: string;
let clone: string;
const run = (dir: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

beforeAll(() => {
  // "GitHub": main ─ root ─ m1, a pull request's head kept only as refs/pull/7/head (its branch
  // deleted), and one merged as a merge commit (refs/pull/8/head, its branch gone too)
  server = mkdtempSync(join(tmpdir(), 'treeline-gh-'));
  const r = (...args: string[]) => run(server, ...args);
  r('init', '-q', '-b', 'main');
  r('config', 'user.name', 'Test');
  r('config', 'user.email', 'test@example.com');
  r('commit', '-q', '--allow-empty', '-m', 'root');
  r('checkout', '-qb', 'feat');
  r('commit', '-q', '--allow-empty', '-m', 'feat1');
  r('update-ref', 'refs/pull/7/head', 'HEAD');
  r('checkout', '-qb', 'fix', 'main');
  r('commit', '-q', '--allow-empty', '-m', 'fix1');
  r('update-ref', 'refs/pull/8/head', 'HEAD');
  r('checkout', '-q', 'main');
  r('commit', '-q', '--allow-empty', '-m', 'm1');
  r('merge', '-q', '--no-ff', '-m', 'Merge fix', 'fix');
  r('branch', '-q', '-D', 'feat', 'fix');
  clone = mkdtempSync(join(tmpdir(), 'treeline-clone-'));
  // --no-local: only what main reaches, as from GitHub (a local clone copies every object)
  run(clone, 'clone', '-q', '--no-local', server, '.');
});

describe('pull request range', () => {
  it("fetches a head that isn't here, from where it forked to it", async () => {
    const head = run(server, 'rev-parse', 'refs/pull/7/head');
    expect(() => run(clone, 'cat-file', '-e', head)).toThrow();
    const range = await git.pullRange(clone, 'origin', { number: 7, headOid: head, base: 'main' });
    expect(range).toEqual({ from: run(server, 'rev-parse', 'main~2'), to: head });
    // No branch or remote branch made for it
    expect(run(clone, 'for-each-ref', '--format=%(refname)')).not.toContain('feat');
  });

  it('compares a merged one with the base before its merge', async () => {
    const head = run(server, 'rev-parse', 'refs/pull/8/head');
    const merge = run(server, 'rev-parse', 'main');
    const range = await git.pullRange(clone, 'origin', {
      number: 8,
      headOid: head,
      base: 'main',
      mergeOid: merge
    });
    // Without the merge commit it would be empty: main has the head since
    expect(range).toEqual({ from: run(server, 'rev-parse', 'main~2'), to: head });
  });
});
