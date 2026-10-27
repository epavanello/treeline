/**
 * Which Claude Code sessions ran in a repository's folders, read from what Claude Code keeps on disk:
 * - every session's transcript, `~/.claude/projects/<folder, non-alphanumerics as "-">/<id>.jsonl`, whose
 *   lines carry `cwd`, `gitBranch`, `timestamp` and, from the desktop app, a `custom-title`;
 * - the desktop app's record of each of its sessions, `claude-code-sessions/<account>/<org>/local_<id>.json`
 *   in its data folder: `cliSessionId`, `title`, `isArchived`, `lastActivityAt`, the branches it committed
 *   to (`writtenBranches`, "<git root>\0<branch>") and the pull requests it opened (`prs`).
 * Transcripts are big (megabytes): only their start, up to the folder and a title, and their last
 * 256 KB are read, again only when the file changed. vscode-free.
 */
import { createReadStream } from 'node:fs';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ClaudeSession } from '@treeline/shared';

const TAIL = 256 * 1024;
/** Lines of a transcript's start read for its folder and title, at most. */
const HEAD_LINES = 400;

export const claudeDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');

/** The desktop app's data folder (Electron's userData for "Claude"). */
export function desktopDir() {
  const home = homedir();
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'Claude');
  if (platform() === 'win32')
    return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Claude');
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Claude');
}

/** How Claude Code names a folder's transcripts directory. */
export const projectDirName = (folder: string) => folder.replace(/[^a-zA-Z0-9]/g, '-');

const inside = (path: string, folder: string) =>
  path === folder || path.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
const seconds = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) / 1000 || 0 : 0);

/** What a transcript says about its session. */
interface Transcript {
  id: string;
  cwd: string;
  title: string;
  /** Its first message, when it has no title. */
  prompt: string;
  branches: string[];
  /** The messages you sent it, from the latest `turnPosition.promptIndex` read; 0 if none was. */
  prompts: number;
  started: number;
  active: number;
}

/** The text of a user message, or '' for tool results and Claude Code's own injected messages. */
function promptOf(line: Record<string, unknown>): string {
  if (line.type !== 'user' || line.isMeta || line.isSidechain) return '';
  const content = (line.message as { content?: unknown } | undefined)?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? (content.find((c) => c?.type === 'text')?.text ?? '')
        : '';
  // Slash commands, hooks and reminders arrive as tagged text
  return /^\s*</.test(text) ? '' : text.trim().replace(/\s+/g, ' ');
}

function absorb(t: Transcript, line: Record<string, unknown>) {
  if (typeof line.cwd === 'string' && !t.cwd) t.cwd = line.cwd;
  if (typeof line.sessionId === 'string' && !t.id) t.id = line.sessionId;
  if (typeof line.gitBranch === 'string' && line.gitBranch && !t.branches.includes(line.gitBranch))
    t.branches.push(line.gitBranch);
  const at = seconds(line.timestamp);
  if (at) {
    t.started = t.started ? Math.min(t.started, at) : at;
    t.active = Math.max(t.active, at);
  }
  if (line.type === 'custom-title' && typeof line.customTitle === 'string')
    t.title = line.customTitle;
  if (!t.prompt) t.prompt = promptOf(line);
  const index = (line.turnPosition as { promptIndex?: unknown } | undefined)?.promptIndex;
  if (typeof index === 'number') t.prompts = Math.max(t.prompts, index);
}

const parse = (text: string) => {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export async function readTranscript(path: string): Promise<Transcript | null> {
  const t: Transcript = {
    id: '',
    cwd: '',
    title: '',
    prompt: '',
    branches: [],
    prompts: 0,
    started: 0,
    active: 0
  };
  // Its start: line by line, until the folder and a title are known
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let read = 0;
  for await (const text of lines) {
    const line = parse(text);
    if (line) absorb(t, line);
    if ((t.cwd && (t.title || t.prompt)) || ++read >= HEAD_LINES) break;
  }
  lines.close();
  // Its end: the latest branch, title and activity
  const file = await open(path);
  try {
    const { size } = await file.stat();
    if (size > 0) {
      const from = Math.max(0, size - TAIL);
      const { buffer, bytesRead } = await file.read(
        Buffer.alloc(size - from),
        0,
        size - from,
        from
      );
      const tail = buffer.toString('utf8', 0, bytesRead).split('\n');
      for (const text of from ? tail.slice(1) : tail) {
        const line = parse(text);
        if (line) absorb(t, line);
      }
    }
  } finally {
    await file.close();
  }
  return t.id && t.cwd ? t : null;
}

/** The desktop app's record of one of its sessions (only the fields used). */
interface DesktopRecord {
  sessionId?: string;
  cliSessionId?: string;
  cwd?: string;
  title?: string;
  isArchived?: boolean;
  /** Its turns: one per message you sent it. */
  completedTurns?: number;
  createdAt?: number;
  lastActivityAt?: number;
  writtenBranches?: string[];
  prs?: { branch?: string; own?: boolean }[];
}

/** Sessions by folder, read again only for files that changed. */
export class ClaudeSessions {
  /** What each file said, by path, with the modification time it was read at. */
  private readonly files = new Map<string, { mtime: number; value: unknown }>();

  constructor(
    private readonly claude = claudeDir(),
    private readonly desktop = desktopDir()
  ) {}

  async list(folders: string[]): Promise<ClaudeSession[]> {
    const [transcripts, records] = await Promise.all([
      this.readTranscripts(folders),
      this.readRecords()
    ]);
    const byId = new Map<string, ClaudeSession>();
    for (const t of transcripts) {
      if (!folders.some((f) => inside(t.cwd, f))) continue;
      byId.set(t.id, {
        id: t.id,
        title: t.title || t.prompt.slice(0, 100) || 'Untitled session',
        cwd: t.cwd,
        branches: t.branches,
        committed: [],
        pulls: [],
        prompts: t.prompts || null,
        started: t.started,
        active: t.active,
        archived: false
      });
    }
    for (const r of records) {
      if (!r.cliSessionId || !r.sessionId || !r.cwd || !folders.some((f) => inside(r.cwd!, f)))
        continue;
      const s = byId.get(r.cliSessionId) ?? {
        id: r.cliSessionId,
        title: '',
        cwd: r.cwd,
        branches: [],
        committed: [],
        pulls: [],
        prompts: null,
        started: (r.createdAt ?? 0) / 1000,
        active: 0,
        archived: false
      };
      byId.set(s.id, {
        ...s,
        desktopId: r.sessionId,
        title: r.title || s.title || 'Untitled session',
        committed: (r.writtenBranches ?? [])
          .map((w) => w.split('\0'))
          .filter(([root]) => folders.some((f) => inside(root, f)))
          .map(([, branch]) => branch)
          .filter(Boolean),
        pulls: (r.prs ?? []).filter((p) => p.own && p.branch).map((p) => p.branch!),
        prompts: Math.max(s.prompts ?? 0, r.completedTurns ?? 0) || null,
        active: Math.max(s.active, (r.lastActivityAt ?? 0) / 1000),
        archived: !!r.isArchived
      });
    }
    return [...byId.values()].sort((a, b) => b.active - a.active);
  }

  /** The transcripts of these folders and the folders inside them (their worktrees, say). */
  private async readTranscripts(folders: string[]) {
    const root = join(this.claude, 'projects');
    const prefixes = folders.map(projectDirName);
    const dirs = (await readdir(root).catch(() => [] as string[])).filter((d) =>
      prefixes.some((p) => d === p || d.startsWith(`${p}-`))
    );
    const files = (
      await Promise.all(
        dirs.map(async (d) =>
          (await readdir(join(root, d)).catch(() => [] as string[]))
            .filter((f) => f.endsWith('.jsonl'))
            .map((f) => join(root, d, f))
        )
      )
    ).flat();
    return (await Promise.all(files.map((f) => this.cached(f, readTranscript)))).filter(
      (t): t is Transcript => !!t
    );
  }

  private async readRecords() {
    const root = join(this.desktop, 'claude-code-sessions');
    const files: string[] = [];
    for (const account of await readdir(root).catch(() => [] as string[]))
      for (const org of await readdir(join(root, account)).catch(() => [] as string[]))
        for (const f of await readdir(join(root, account, org)).catch(() => [] as string[]))
          if (f.startsWith('local_') && f.endsWith('.json'))
            files.push(join(root, account, org, f));
    const read = async (f: string) => parse(await readFile(f, 'utf8')) as DesktopRecord | null;
    return (await Promise.all(files.map((f) => this.cached(f, read)))).filter(
      (r): r is DesktopRecord => !!r
    );
  }

  private async cached<T>(file: string, read: (file: string) => Promise<T | null>) {
    const mtime = await stat(file).then(
      (s) => s.mtimeMs,
      () => -1
    );
    if (mtime < 0) return null;
    const hit = this.files.get(file);
    if (hit?.mtime === mtime) return hit.value as T | null;
    const value = await read(file).catch(() => null);
    this.files.set(file, { mtime, value });
    return value;
  }
}
