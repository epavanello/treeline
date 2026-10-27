/** A unified diff (`git diff`) split into files, hunks and numbered lines, for the inline diff view. */

export interface PatchLine {
  /** ' ' context, '+' added, '-' removed. */
  kind: ' ' | '+' | '-';
  text: string;
  /** Line numbers on the old and new side (absent on the side the line isn't on). */
  old?: number;
  new?: number;
}

export interface Hunk {
  /** What follows the `@@ … @@`: the enclosing function or class, when git found one. */
  context: string;
  lines: PatchLine[];
}

export interface PatchFile {
  path: string;
  oldPath: string;
  binary: boolean;
  hunks: Hunk[];
}

/** `a/x b/x` path pairs are ambiguous with spaces: the `---`/`+++` lines say it unambiguously. */
const side = (line: string) => {
  const p = line.slice(4).replace(/\t$/, '');
  return p === '/dev/null' ? null : p.replace(/^[ab]\//, '');
};

export function parsePatch(text: string): PatchFile[] {
  const files: PatchFile[] = [];
  let file: PatchFile | null = null;
  let hunk: Hunk | null = null;
  let o = 0;
  let n = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      file = { path: m?.[2] ?? '', oldPath: m?.[1] ?? '', binary: false, hunks: [] };
      files.push(file);
      hunk = null;
    } else if (!file) continue;
    else if (!hunk && line.startsWith('--- ')) file.oldPath = side(line) ?? file.oldPath;
    else if (!hunk && line.startsWith('+++ ')) file.path = side(line) ?? file.path;
    else if (!hunk && line.startsWith('rename from ')) file.oldPath = line.slice(12);
    else if (!hunk && line.startsWith('rename to ')) file.path = line.slice(10);
    else if (!hunk && line.startsWith('Binary files ')) file.binary = true;
    else if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line);
      if (!m) continue;
      o = +m[1];
      n = +m[2];
      hunk = { context: m[3], lines: [] };
      file.hunks.push(hunk);
    } else if (hunk) {
      const kind = line[0];
      if (kind === '+') hunk.lines.push({ kind, text: line.slice(1), new: n++ });
      else if (kind === '-') hunk.lines.push({ kind, text: line.slice(1), old: o++ });
      else if (kind === ' ') hunk.lines.push({ kind, text: line.slice(1), old: o++, new: n++ });
      // '\ No newline at end of file', and the empty line the text ends with
    }
  }
  return files;
}
