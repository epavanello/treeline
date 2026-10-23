/**
 * Thin, vscode-free layer over the git CLI. Everything here is unit-testable
 * against a real temporary repository.
 */
import { execFile } from 'node:child_process';
import {
  UNCOMMITTED,
  type Commit,
  type CommitDetails,
  type Compare,
  type FileChange,
  type FileStatus,
  type GraphData,
  type GraphQuery,
  type Ref,
  type RefSummary,
  type Side,
  type WorktreeDetails,
  type Worktree,
  type WorktreeStatus
} from '@treeline/shared';

const F = '\x1f'; // field separator
/** How many commits copied onto the base it takes to call a history rewritten (see getCompare). */
const REWRITTEN = 5;
const R = '\x1e'; // record separator

export class GitError extends Error {}

export class Git {
  /** Last worktree comparisons, by worktree path (see worktreeDetails). */
  private readonly worktreeCompares = new Map<string, { key: string; compare: Compare | null }>();

  constructor(private readonly gitPath = 'git') {}

  exec(repo: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.gitPath,
        ['-c', 'core.quotepath=false', '-c', 'log.showSignature=false', ...args],
        {
          cwd: repo,
          maxBuffer: 256 * 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        },
        (err, stdout, stderr) => {
          if (err) reject(new GitError((stderr || err.message).trim()));
          else resolve(stdout);
        }
      );
    });
  }

  /** Like `exec`, but resolves to `fallback` instead of rejecting. */
  private try<T>(promise: Promise<T>, fallback: T): Promise<T> {
    return promise.catch(() => fallback);
  }

  async toplevel(dir: string): Promise<string | null> {
    return this.try(
      this.exec(dir, ['rev-parse', '--show-toplevel']).then((s) => s.trim()),
      null
    );
  }

  async getGraph(q: GraphQuery): Promise<GraphData> {
    const remotes = lines(await this.try(this.exec(q.repo, ['remote']), ''));
    const [refs, head, currentBranch, stashes, worktrees] = await Promise.all([
      this.getRefs(q.repo, remotes),
      this.try(
        this.exec(q.repo, ['rev-parse', '--verify', '-q', 'HEAD']).then((s) => s.trim() || null),
        null
      ),
      this.try(
        this.exec(q.repo, ['symbolic-ref', '-q', '--short', 'HEAD']).then((s) => s.trim() || null),
        null
      ),
      this.getStashes(q.repo),
      this.getWorktrees(q.repo)
    ]);

    // Mark branches that are checked out in another worktree
    for (const { ref } of refs) {
      const wt = worktrees.find((w) => !w.current && w.branch === ref.name);
      if (ref.kind === 'head' && wt) ref.worktree = wt.path;
    }

    const compare = head ? await this.getCompare(q.repo, q.base, refs) : null;
    if (compare) {
      const vsBase = await this.aheadBehind(q.repo, compare.base);
      for (const r of refs) {
        const full = `refs/${r.ref.kind === 'head' ? 'heads' : 'remotes'}/${r.ref.name}`;
        if (r.ref.kind !== 'tag') r.vsBase = vsBase.get(full);
      }
    }
    const focus = compare && q.focus.length ? q.focus : null;
    const revs = focus
      ? ['--boundary', `HEAD...${compare!.base}`]
      : q.branches.length
        ? q.branches
        : [
            '--branches',
            '--tags',
            ...(q.showRemotes ? ['--remotes'] : []),
            ...(head ? ['HEAD'] : [])
          ];
    const stashBases = [...new Set(stashes.map((s) => s.stashBase!))];
    const log =
      head || refs.length
        ? await this.exec(q.repo, [
            'log',
            `--max-count=${q.maxCommits + 1}`,
            '--date-order',
            `--format=%H${F}%P${F}%aN${F}%aE${F}%at${F}%s${R}`,
            // Repeated --author is an OR; anchor on "Name <" so names match exactly
            ...q.authors.map((a) => `--author=^${a.replace(/[\\.[\]*^$]/g, '\\$&')} <`),
            ...revs,
            ...(q.branches.length || focus ? [] : stashBases),
            '--'
          ])
        : '';

    let commits: Commit[] = records(log).map((r) => {
      const [hash, parents, author, email, date, subject] = r.split(F);
      return { hash, parents: words(parents), author, email, date: +date, subject, refs: [] };
    });
    const hasMore = commits.length > q.maxCommits;
    if (hasMore) commits.pop();
    for (const c of commits) c.side = compare?.sides.get(c.hash);
    // Focus: only the chosen sides of the divergence, and the fork point they share
    if (focus)
      commits = commits.filter(
        (c) => (c.side && focus.includes(c.side)) || c.hash === compare!.mergeBase
      );

    // Annotate refs
    const byHash = new Map(commits.map((c) => [c.hash, c]));
    for (const { hash, ref } of refs) {
      if (ref.kind === 'remote' && !q.showRemotes) continue;
      byHash.get(hash)?.refs.push(ref);
    }

    // Splice stashes in right above their base commit
    for (const stash of stashes) {
      const at = commits.findIndex((c) => c.hash === stash.stashBase);
      if (at >= 0) commits.splice(at, 0, stash);
    }

    // Uncommitted changes row, always on top
    if (head && byHash.has(head)) {
      const changes = lines(
        await this.try(this.exec(q.repo, ['status', '--porcelain', '--untracked-files=all']), '')
      );
      if (changes.length) {
        commits.unshift({
          hash: UNCOMMITTED,
          parents: [head],
          author: '*',
          email: '',
          date: Math.round(Date.now() / 1000),
          subject: `Uncommitted Changes (${changes.length})`,
          refs: []
        });
      }
    }

    const branches = refs
      .filter((r) => r.ref.kind === 'head' || (q.showRemotes && r.ref.kind === 'remote'))
      .map((r) => r.ref.name);
    return {
      commits,
      head,
      currentBranch,
      branches: [...new Set(branches)],
      remotes,
      worktrees,
      heads: refs.filter((r) => r.ref.kind === 'head'),
      tags: refs.filter((r) => r.ref.kind === 'tag'),
      remoteHeads: refs.filter((r) => r.ref.kind === 'remote'),
      compare: compare && {
        base: compare.base,
        ahead: compare.ahead,
        behind: compare.behind,
        same: compare.same,
        mergeBase: compare.mergeBase,
        mergeBaseDate: compare.mergeBaseDate,
        rewritten: compare.rewritten
      },
      hasMore
    };
  }

  /** Ahead/behind `base` for every branch, by full ref name, in one call (empty before git 2.41). */
  private async aheadBehind(repo: string, base: string) {
    const out = await this.try(
      this.exec(repo, [
        'for-each-ref',
        `--format=%(refname)${F}%(ahead-behind:${base})`,
        'refs/heads',
        'refs/remotes'
      ]),
      ''
    );
    return new Map(
      lines(out).map((l) => {
        const [ref, counts] = l.split(F);
        const [ahead, behind] = counts.split(' ').map(Number);
        return [ref, { ahead, behind }] as const;
      })
    );
  }

  /** Branches (local and remote) and tags, most recent first. */
  async listRefs(repo: string): Promise<RefSummary[]> {
    return this.getRefs(repo, lines(await this.try(this.exec(repo, ['remote']), '')));
  }

  /** The branch work usually starts from: origin/HEAD, then origin/main, origin/master, main, master. */
  async defaultBase(repo: string): Promise<string | null> {
    return this.resolveBase(repo, await this.listRefs(repo));
  }

  private async resolveBase(repo: string, refs: { ref: Ref }[]) {
    const names = new Set(refs.map((r) => r.ref.name));
    return (
      (await this.try(
        this.exec(repo, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']),
        ''
      ).then((s) => s.trim())) ||
      ['origin/main', 'origin/master', 'main', 'master'].find((n) => names.has(n)) ||
      null
    );
  }

  /** HEAD vs `base` (or the default base), with the side of every diverging commit. */
  private async getCompare(
    repo: string,
    base: string | null,
    refs: { ref: Ref }[]
  ): Promise<(Compare & { sides: Map<string, Side> }) | null> {
    base ??= await this.resolveBase(repo, refs);
    if (!base) return null;
    // --cherry-mark tells the commits whose changes are on both sides (rebased, cherry-picked) with '='
    const side = (only: string) =>
      this.try(this.exec(repo, ['rev-list', '--cherry-mark', only, `HEAD...${base}`, '--']), null);
    const [mine, theirs, mergeBase] = await Promise.all([
      side('--left-only'),
      side('--right-only'),
      this.try(
        this.exec(repo, ['merge-base', 'HEAD', base]).then((s) => s.trim() || null),
        null
      )
    ]);
    if (mine === null || theirs === null) return null; // the base doesn't exist (any more)
    const sides = new Map<string, Side>();
    const count = { ahead: 0, behind: 0, same: 0 };
    for (const [list, unique] of [
      [mine, 'ahead'],
      [theirs, 'behind']
    ] as const)
      for (const l of lines(list)) {
        const s = l[0] === '=' ? 'same' : unique;
        sides.set(l.slice(1), s);
        if (s !== 'same' || unique === 'ahead') count[s]++;
      }
    const mergeBaseDate = mergeBase
      ? await this.try(
          this.exec(repo, ['show', '-s', '--format=%ct', mergeBase]).then(Number),
          null
        )
      : null;
    // Copies dominate HEAD's side: not a rebase-and-merge of a few commits but a rewritten history
    const rewritten = count.same >= REWRITTEN && count.same > count.ahead;
    return { base, ...count, mergeBase, mergeBaseDate, rewritten, sides };
  }

  /** A worktree (any folder of this repository) compared with `base`, and what it hasn't committed. */
  async worktreeDetails(path: string, base: string | null): Promise<WorktreeDetails> {
    base ??= await this.defaultBase(path);
    const [head, baseHash, files] = await Promise.all([
      this.try(
        this.exec(path, ['rev-parse', 'HEAD']).then((s) => s.trim()),
        ''
      ),
      base
        ? this.try(
            this.exec(path, ['rev-parse', base]).then((s) => s.trim()),
            ''
          )
        : '',
      this.try(this.compare(path, 'HEAD', UNCOMMITTED), [] as FileChange[])
    ]);
    // The comparison can take seconds on diverged histories: reuse it until either side moves
    const key = `${head} ${base} ${baseHash}`;
    const cached = this.worktreeCompares.get(path);
    if (cached?.key === key) return { compare: cached.compare, files };
    const full = base ? await this.getCompare(path, base, []) : null;
    let compare: Compare | null = null;
    if (full) {
      const { sides: _, ...withoutSides } = full;
      compare = withoutSides;
    }
    this.worktreeCompares.set(path, { key, compare });
    return { compare, files };
  }

  async getWorktrees(repo: string): Promise<Worktree[]> {
    const [out, top] = await Promise.all([
      this.try(this.exec(repo, ['worktree', 'list', '--porcelain']), ''),
      this.toplevel(repo)
    ]);
    // Records are blank-line separated; each line is `key[ value]`.
    const worktrees = out
      .split(/\r?\n\r?\n/)
      .map(
        (record) =>
          new Map(lines(record).map((l) => [l.split(' ')[0], l.slice(l.indexOf(' ') + 1)]))
      )
      .filter((f) => f.has('worktree') && !f.has('bare'))
      .map((f, i): Worktree => ({
        path: f.get('worktree')!,
        branch: f.get('branch')?.replace(/^refs\/heads\//, '') ?? null,
        head: f.get('HEAD') ?? '',
        main: i === 0,
        current: f.get('worktree') === top,
        locked: f.has('locked'),
        prunable: f.has('prunable'),
        headDate: null,
        headSubject: null,
        status: null
      }));
    // Every worktree shares the object database: one call dates all their commits
    const heads = [...new Set(worktrees.map((w) => w.head).filter(Boolean))];
    const shown = heads.length
      ? await this.try(
          this.exec(repo, ['show', '-s', `--format=%H${F}%ct${F}%s`, ...heads, '--']),
          ''
        )
      : '';
    const info = new Map(lines(shown).map((l) => [l.split(F)[0], l.split(F)]));
    for (const w of worktrees) {
      const [, date, subject] = info.get(w.head) ?? [];
      w.headDate = date ? +date : null;
      w.headSubject = subject ?? null;
    }
    await Promise.all(
      worktrees
        .filter((w) => !w.prunable)
        .map(async (w) => (w.status = await this.try(this.worktreeStatus(w.path), null)))
    );
    return worktrees;
  }

  private async worktreeStatus(path: string): Promise<WorktreeStatus> {
    const status: WorktreeStatus = { changes: 0, ahead: 0, behind: 0, upstream: null };
    for (const l of lines(await this.exec(path, ['status', '--porcelain=v2', '--branch']))) {
      if (l.startsWith('# branch.upstream ')) status.upstream = l.slice(18);
      else if (l.startsWith('# branch.ab '))
        [status.ahead, status.behind] = l
          .slice(12)
          .split(' ')
          .map((n) => Math.abs(+n));
      else if (!l.startsWith('#')) status.changes++;
    }
    return status;
  }

  private async getRefs(repo: string, remotes: string[]): Promise<RefSummary[]> {
    const out = await this.try(
      this.exec(repo, [
        'for-each-ref',
        '--sort=-creatordate',
        `--format=%(objectname)${F}%(*objectname)${F}%(refname)${F}%(refname:short)${F}%(creatordate:unix)${F}%(*subject)${F}%(subject)${F}%(upstream:short)${F}%(upstream:track,nobracket)`,
        'refs/heads',
        'refs/remotes',
        'refs/tags'
      ]),
      ''
    );
    return lines(out).flatMap((line): RefSummary[] => {
      const [obj, deref, full, name, date, derefSubject, subject, upstream, track] = line.split(F);
      // Annotated tags point to a tag object: the commit (and its subject) is the dereferenced one
      const base = { hash: deref || obj, date: +date, subject: deref ? derefSubject : subject };
      if (full.startsWith('refs/heads/')) {
        const ref: Ref = { kind: 'head', name };
        // `track` reads "ahead 1, behind 2", "gone" or nothing when in sync
        const count = (word: string) => +(track.match(new RegExp(`${word} (\\d+)`))?.[1] ?? 0);
        if (upstream)
          ref.upstream = {
            name: upstream,
            ahead: count('ahead'),
            behind: count('behind'),
            gone: track === 'gone'
          };
        return [{ ...base, ref }];
      }
      if (full.startsWith('refs/tags/'))
        return [{ ...base, ref: { kind: 'tag', name, annotated: !!deref } }];
      if (full.endsWith('/HEAD')) return [];
      const remote = remotes.find((r) => full.startsWith(`refs/remotes/${r}/`));
      return [{ ...base, ref: { kind: 'remote', name: full.slice(13), remote } }];
    });
  }

  private async getStashes(repo: string): Promise<Commit[]> {
    const out = await this.try(
      this.exec(repo, [
        'reflog',
        `--format=%H${F}%P${F}%gd${F}%aN${F}%aE${F}%at${F}%s${R}`,
        'refs/stash',
        '--'
      ]),
      ''
    );
    return records(out).map((r) => {
      const [hash, parents, selector, author, email, date, subject] = r.split(F);
      const base = words(parents)[0];
      return {
        hash,
        parents: [base],
        author,
        email,
        date: +date,
        subject,
        stashBase: base,
        refs: [{ kind: 'stash', name: selector }]
      };
    });
  }

  async getDetails(repo: string, commit: Commit): Promise<CommitDetails> {
    if (commit.hash === UNCOMMITTED) {
      return {
        hash: UNCOMMITTED,
        parents: [],
        author: '',
        authorEmail: '',
        authorDate: 0,
        committer: '',
        committerEmail: '',
        committerDate: 0,
        body: '',
        files: await this.compare(repo, 'HEAD', UNCOMMITTED)
      };
    }
    const out = await this.exec(repo, [
      'show',
      '--quiet',
      `--format=%H${F}%P${F}%aN${F}%aE${F}%at${F}%cN${F}%cE${F}%ct${F}%B`,
      commit.hash
    ]);
    const [
      hash,
      parents,
      author,
      authorEmail,
      authorDate,
      committer,
      committerEmail,
      committerDate,
      ...body
    ] = out.split(F);
    const parentList = words(parents);

    let files: FileChange[];
    if (commit.stashBase) {
      files = await this.diff(repo, commit.stashBase, hash);
      const untracked = parentList[2];
      if (untracked) {
        const extra = await this.diff(repo, untracked, untracked);
        files.push(...extra.map((f) => ({ ...f, status: 'U' as const })));
      }
    } else {
      files = await this.diff(repo, parentList.length ? `${hash}^` : hash, hash);
    }

    return {
      hash,
      parents: parentList,
      author,
      authorEmail,
      authorDate: +authorDate,
      committer,
      committerEmail,
      committerDate: +committerDate,
      body: body.join(F).trim(),
      files
    };
  }

  /** Files changed between two revisions; `to` may be `UNCOMMITTED` (working tree). */
  async compare(repo: string, from: string, to: string): Promise<FileChange[]> {
    if (to !== UNCOMMITTED) return this.diff(repo, from, to);
    const [files, status] = await Promise.all([
      this.diff(repo, from, ''),
      this.exec(repo, ['status', '--porcelain', '-z', '--untracked-files=all'])
    ]);
    const tokens = status.split('\0');
    for (const entry of tokens) {
      if (entry.startsWith('?? ')) {
        const path = entry.slice(3);
        files.push({ status: 'U', oldPath: path, path, additions: null, deletions: null });
      }
    }
    return files;
  }

  /** `from === to` means "the changes introduced by this root commit". `to === ''` = working tree. */
  private async diff(repo: string, from: string, to: string): Promise<FileChange[]> {
    const base =
      from === to
        ? ['diff-tree', '-r', '--root', '--find-renames', '-z', from]
        : ['diff', '--find-renames', '-z', from, ...(to ? [to] : [])];
    const [nameStatus, numstat] = await Promise.all([
      this.exec(repo, [...base.slice(0, 1), '--name-status', ...base.slice(1)]),
      this.exec(repo, [...base.slice(0, 1), '--numstat', ...base.slice(1)])
    ]);
    return mergeDiff(nameStatus, numstat, from === to ? from : null);
  }

  /** What a commit message is written from: the staged diff, or all changes if nothing is staged. */
  async commitContext(repo: string) {
    const [staged, recent] = await Promise.all([
      this.exec(repo, ['diff', '--cached']),
      this.try(this.exec(repo, ['log', '-15', '--format=%s']).then(lines), [] as string[])
    ]);
    let diff = staged;
    if (!staged.trim()) {
      const [tracked, untracked] = await Promise.all([
        this.try(this.exec(repo, ['diff', 'HEAD']), ''),
        this.exec(repo, ['ls-files', '--others', '--exclude-standard']).then(lines)
      ]);
      diff = tracked + (untracked.length ? `\nNew files:\n${untracked.join('\n')}\n` : '');
    }
    // Keep the prompt small; the start of a huge diff says enough
    return { staged: !!staged.trim(), diff: diff.slice(0, 60_000), recent };
  }

  /** Whether `path` at `rev` is identical to the file in the working tree. */
  sameAsWorkingTree(repo: string, rev: string, path: string): Promise<boolean> {
    return this.exec(repo, ['diff', '--quiet', rev, '--', path]).then(
      () => true,
      () => false
    );
  }

  showFile(repo: string, rev: string, path: string): Promise<string> {
    return this.exec(repo, ['show', `${rev}:${path}`]);
  }
}

/** Parse `--name-status -z` + `--numstat -z` output into one list. Exported for tests. */
export function mergeDiff(
  nameStatus: string,
  numstat: string,
  rootHash: string | null
): FileChange[] {
  const t = nameStatus.split('\0');
  // diff-tree prints the commit hash as the first token
  let i = rootHash && t[0] === rootHash ? 1 : 0;
  const files: FileChange[] = [];
  while (i < t.length && t[i]) {
    const code = t[i][0] as FileStatus | 'C';
    if (code === 'R' || code === 'C') {
      files.push({
        status: 'R',
        oldPath: t[i + 1],
        path: t[i + 2],
        additions: null,
        deletions: null
      });
      i += 3;
    } else {
      files.push({
        status: code as FileStatus,
        oldPath: t[i + 1],
        path: t[i + 1],
        additions: null,
        deletions: null
      });
      i += 2;
    }
  }

  const n = numstat.split('\0');
  i = rootHash && n[0] === rootHash ? 1 : 0;
  const counts = new Map<string, [number | null, number | null]>();
  while (i < n.length && n[i]) {
    const [add, del, path] = n[i].split('\t');
    const parse = (s: string) => (s === '-' ? null : +s);
    // Renames: path is empty and the next two tokens are old/new
    if (path === '') {
      counts.set(n[i + 2], [parse(add), parse(del)]);
      i += 3;
    } else {
      counts.set(path, [parse(add), parse(del)]);
      i += 1;
    }
  }
  for (const f of files) [f.additions, f.deletions] = counts.get(f.path) ?? [null, null];
  return files;
}

const lines = (s: string) => s.split(/\r?\n/).filter(Boolean);
const words = (s: string) => s.split(' ').filter(Boolean);
const records = (s: string) =>
  s
    .split(R)
    .map((r) => r.replace(/^\r?\n/, ''))
    .filter(Boolean);
