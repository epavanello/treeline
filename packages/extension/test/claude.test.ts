import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Summaries } from '../src/claude';
import { Git } from '../src/git';

const git = new Git();
let dir: string;
const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'treeline-changes-'));
  run('init', '-q', '-b', 'main');
  run('config', 'user.name', 'Test');
  run('config', 'user.email', 'test@example.com');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  run('add', '.');
  run('commit', '-qm', 'First');
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
  run('commit', '-qam', 'Second');
  // Uncommitted: an edit, a new text file, a new binary file
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nthree\n');
  writeFileSync(join(dir, 'new.txt'), 'hello\n');
  writeFileSync(join(dir, 'blob.bin'), Buffer.from([0, 1, 2]));
});

describe('changes', () => {
  it("gives a commit's diff without its message", async () => {
    const diff = await git.changes(dir, run('rev-parse', 'HEAD'));
    expect(diff).toContain('+two');
    expect(diff).not.toContain('Second');
  });

  it('gives uncommitted changes with new files, binaries by name', async () => {
    const diff = await git.changes(dir, null);
    expect(diff).toContain('+three');
    expect(diff).toContain('+++ b/new.txt\n@@ -0,0 +1,1 @@\n+hello\n');
    expect(diff).toContain('Binary files /dev/null and b/blob.bin differ');
  });

  it('cuts to the size asked', async () => {
    expect((await git.changes(dir, null, 20)).length).toBe(20);
  });
});

describe('Summaries', () => {
  it('finds summaries already written, without asking Claude', async () => {
    const head = run('rev-parse', 'HEAD');
    const store = { value: { [head]: 'Adds a second line.' } as Record<string, string> };
    const summaries = new Summaries(git, {
      get: () => store.value,
      set: (v) => (store.value = v)
    });
    expect(await summaries.get(dir, head, true)).toBe('Adds a second line.');
    expect(await summaries.get(dir, run('rev-parse', 'HEAD~1'), true)).toBeNull();
    expect(await summaries.get(dir, null, true)).toBeNull();
  });
});
