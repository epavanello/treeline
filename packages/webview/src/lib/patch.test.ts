import { describe, expect, it } from 'vitest';
import { parsePatch } from './patch';

const PATCH = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@ export function main() {
 const a = 1;
--- not a header: a removed line
+const b = 2;
+const c = 3;
 return a;
\\ No newline at end of file
diff --git a/old name.md b/new name.md
similarity index 90%
rename from old name.md
rename to new name.md
diff --git a/logo.png b/logo.png
new file mode 100644
Binary files /dev/null and b/logo.png differ
`;

describe('parsePatch', () => {
  const files = parsePatch(PATCH);

  it('splits files, numbering each side', () => {
    expect(files.map((f) => f.path)).toEqual(['src/app.ts', 'new name.md', 'logo.png']);
    const [hunk] = files[0].hunks;
    expect(hunk.context).toBe('export function main() {');
    expect(hunk.lines).toEqual([
      { kind: ' ', text: 'const a = 1;', old: 1, new: 1 },
      { kind: '-', text: '-- not a header: a removed line', old: 2 },
      { kind: '+', text: 'const b = 2;', new: 2 },
      { kind: '+', text: 'const c = 3;', new: 3 },
      { kind: ' ', text: 'return a;', old: 3, new: 4 }
    ]);
  });

  it('keeps renames, paths with spaces and binaries', () => {
    expect(files[1]).toMatchObject({ oldPath: 'old name.md', path: 'new name.md', hunks: [] });
    expect(files[2]).toMatchObject({ binary: true, hunks: [] });
  });
});
