import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ClaudeSessions, projectDirName } from '../src/sessions';

const repo = '/work/shop';
const worktree = '/work/shop/.claude/worktrees/search';
let claude: string;
let desktop: string;

const line = (o: object) => JSON.stringify(o);
function transcript(id: string, cwd: string, lines: object[]) {
  const dir = join(claude, 'projects', projectDirName(cwd));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.jsonl`),
    lines.map((l) => line({ sessionId: id, cwd, ...l })).join('\n') + '\n'
  );
}

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), 'treeline-sessions-'));
  claude = join(root, 'claude');
  desktop = join(root, 'desktop');
  // From the terminal, in the repository: titled by its first message
  transcript('a1', repo, [
    { type: 'user', message: { content: '<command-name>/init</command-name>' } },
    {
      type: 'user',
      gitBranch: 'main',
      timestamp: '2026-10-01T10:00:00Z',
      turnPosition: { promptIndex: 1, turnIndex: 1 },
      message: { content: 'Fix the  checkout\nbutton' }
    },
    { type: 'assistant', gitBranch: 'feat/checkout', timestamp: '2026-10-01T11:00:00Z' }
  ]);
  // From the desktop app, in a worktree
  transcript('b2', worktree, [
    { type: 'custom-title', customTitle: 'Search filters' },
    {
      type: 'user',
      gitBranch: 'claude/search',
      timestamp: '2026-10-02T10:00:00Z',
      message: { content: 'go' }
    }
  ]);
  // Another repository: left out
  transcript('c3', '/work/other', [
    { type: 'user', timestamp: '2026-10-03T10:00:00Z', message: { content: 'x' } }
  ]);
  const records = join(desktop, 'claude-code-sessions', 'account', 'org');
  mkdirSync(records, { recursive: true });
  writeFileSync(
    join(records, 'local_b2.json'),
    line({
      sessionId: 'local_b2',
      cliSessionId: 'b2',
      cwd: worktree,
      title: 'Search filters, renamed',
      isArchived: true,
      completedTurns: 4,
      lastActivityAt: Date.parse('2026-10-05T10:00:00Z'),
      writtenBranches: [`${worktree}\0feat/search`, '/work/other\0elsewhere'],
      prs: [{ branch: 'feat/search', own: true }, { branch: 'someone-elses' }]
    })
  );
});

describe('ClaudeSessions', () => {
  it("lists the repository's and its worktrees' sessions, most recent first", async () => {
    const sessions = await new ClaudeSessions(claude, desktop).list([repo, worktree]);
    expect(sessions.map((s) => s.id)).toEqual(['b2', 'a1']);
    expect(sessions[1]).toMatchObject({
      title: 'Fix the checkout button',
      cwd: repo,
      branches: ['main', 'feat/checkout'],
      committed: [],
      prompts: 1,
      started: Date.parse('2026-10-01T10:00:00Z') / 1000,
      active: Date.parse('2026-10-01T11:00:00Z') / 1000,
      archived: false
    });
    expect(sessions[1].desktopId).toBeUndefined();
  });

  it("adds the desktop app's record: its id, title, commits and pull requests", async () => {
    const [s] = await new ClaudeSessions(claude, desktop).list([repo, worktree]);
    expect(s).toMatchObject({
      desktopId: 'local_b2',
      title: 'Search filters, renamed',
      branches: ['claude/search'],
      committed: ['feat/search'],
      pulls: ['feat/search'],
      prompts: 4,
      active: Date.parse('2026-10-05T10:00:00Z') / 1000,
      archived: true
    });
  });

  it('finds nothing without Claude Code', async () => {
    const none = join(tmpdir(), 'treeline-no-claude');
    expect(await new ClaudeSessions(none, none).list([repo])).toEqual([]);
  });
});
