import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A small repo with a merge, a tag, a remote-tracking branch, a stash and
 * uncommitted changes — every row type the graph knows about.
 */
export function createFixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'treeline-'));
  let t = 1_700_000_000;
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Ada',
        GIT_AUTHOR_EMAIL: 'ada@example.com',
        GIT_COMMITTER_NAME: 'Ada',
        GIT_COMMITTER_EMAIL: 'ada@example.com',
        GIT_AUTHOR_DATE: `${t} +0000`,
        GIT_COMMITTER_DATE: `${t} +0000`
      }
    }).toString();
  const commit = (file: string, msg: string) => {
    t += 60;
    writeFileSync(join(dir, file), msg + '\n');
    git('add', file);
    git('commit', '-q', '-m', msg);
  };

  git('init', '-q', '-b', 'main');
  // Commits made later (merges, cherry-picks…) must not depend on the machine's global config
  git('config', 'user.name', 'Ada');
  git('config', 'user.email', 'ada@example.com');
  commit('a.txt', 'Initial commit');
  commit('b.txt', 'Add b');
  git('checkout', '-q', '-b', 'feature');
  commit('c.txt', 'Feature work 1');
  commit('c.txt', 'Feature work 2');
  git('checkout', '-q', 'main');
  commit('a.txt', 'Main moves on');
  t += 60;
  git('merge', '-q', '--no-ff', '-m', 'Merge feature', 'feature');
  git('tag', '-a', 'v1.0', '-m', 'Release 1.0');
  git('checkout', '-q', '-b', 'topic');
  commit('d.txt', 'Topic commit');
  // Fake a remote-tracking branch without a network
  git('remote', 'add', 'origin', 'https://example.com/repo.git');
  git('update-ref', 'refs/remotes/origin/main', 'main');
  git('checkout', '-q', 'main');
  commit('a.txt', 'Main after topic');
  writeFileSync(join(dir, 'a.txt'), 'stashed change\n');
  t += 60;
  git('stash', 'push', '-q', '-m', 'wip on main');
  writeFileSync(join(dir, 'b.txt'), 'dirty\n');
  writeFileSync(join(dir, 'new.txt'), 'untracked\n');
  return { dir, git };
}
