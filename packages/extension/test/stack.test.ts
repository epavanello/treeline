import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Git } from '../src/git';

const git = new Git();
let dir: string;
const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
const commit = (msg: string) => run('commit', '-q', '--allow-empty', '-m', msg);

beforeAll(() => {
  // main ─ a ─ b ─ c   (a stack of three pull requests)
  //         └ side     (a side branch of the stack's bottom)
  //   └ other          (unrelated work on main)
  dir = mkdtempSync(join(tmpdir(), 'treeline-stack-'));
  run('init', '-q', '-b', 'main');
  run('config', 'user.name', 'Test');
  run('config', 'user.email', 'test@example.com');
  commit('root');
  run('checkout', '-qb', 'a');
  commit('a1');
  commit('a2');
  run('checkout', '-qb', 'b');
  commit('b1');
  run('checkout', '-qb', 'c');
  commit('c1');
  run('checkout', '-qb', 'side', 'a');
  commit('side1');
  run('checkout', '-qb', 'other', 'main');
  commit('other1');
});

describe('stack', () => {
  it('finds the branches built on one, and its whole stack', async () => {
    const { above, stack } = await git.stack(dir, 'b', 'main');
    expect(above.sort()).toEqual(['c']);
    expect(stack.sort()).toEqual(['a', 'c', 'side']);
  });

  it('has no stack for a branch already in the base', async () => {
    expect(await git.stack(dir, 'main', 'main')).toEqual({ above: expect.any(Array), stack: [] });
  });
});
