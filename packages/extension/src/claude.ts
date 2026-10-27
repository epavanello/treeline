/**
 * One-shot calls to the local Claude Code CLI (`claude -p`), and the change summaries written with it.
 * vscode-free.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { Git } from './git';

/**
 * Asks Haiku, with `input` on stdin as all it sees: run outside any repository, with no tools, MCP
 * servers, settings (so no hooks, no CLAUDE.md) or saved session. Seconds, not a minute.
 * (`--bare` would skip the same, but it ignores a Claude subscription's sign-in.)
 */
export function claude(prompt: string, input: string, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(
      'claude',
      [
        '-p',
        prompt,
        '--model',
        'haiku',
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence'
      ],
      { cwd: tmpdir(), signal }
    );
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.stdin.on('error', () => {}); // EPIPE when the CLI is missing; 'error' above reports it
    proc.on('close', (code) =>
      code === 0
        ? resolve(clean(out))
        : reject(new Error(err.trim() || `claude exited with ${code}`))
    );
    proc.stdin.end(input);
  });
}

/** A reply without the code fence models sometimes wrap it in. */
export const clean = (s: string) =>
  s
    .trim()
    .replace(/^```\w*\n|\n```$/g, '')
    .trim();

const PROMPT = `The input is a git diff. In at most 4 short lines of plain text, say what these changes do \
and what for, at a high level, for a developer deciding whether they still matter: not file by file. \
No preamble, headings, bullets or code fences.`;

/** Summaries kept (the most recently written). */
const KEEP = 500;

export interface Store {
  get(): Record<string, string> | undefined;
  set(value: Record<string, string>): unknown;
}

/**
 * What a commit or a folder's uncommitted changes are about, in 4 lines, from their diff alone.
 * Kept across sessions: a commit's by its hash, uncommitted changes by their diff (so a summary
 * shows again until they change).
 */
export class Summaries {
  constructor(
    private readonly git: Git,
    private readonly store: Store
  ) {}

  /** The summary of `rev`'s changes, or of `repo`'s uncommitted ones (`rev` null); with `cachedOnly`, null when not written yet. */
  async get(repo: string, rev: string | null, cachedOnly: boolean): Promise<string | null> {
    const all = this.store.get() ?? {};
    // A commit's changes never change: its hash finds the summary without its diff
    if (rev && (all[rev] || cachedOnly)) return all[rev] ?? null;
    const diff = await this.git.changes(repo, rev);
    const key = rev ?? `diff:${createHash('sha1').update(diff).digest('hex')}`;
    if (all[key] || cachedOnly) return all[key] ?? null;
    if (!diff.trim()) throw new Error('There are no changes to summarize.');
    const summary = await claude(PROMPT, diff).catch((e: NodeJS.ErrnoException) => {
      throw e.code === 'ENOENT'
        ? new Error(
            'Summaries are written by Claude Code: install it, so that `claude` is on your PATH.'
          )
        : e;
    });
    const next = { ...all, [key]: summary };
    const keys = Object.keys(next);
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete next[old];
    await this.store.set(next);
    return summary;
  }
}
