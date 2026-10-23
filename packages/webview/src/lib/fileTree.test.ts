import type { FileChange } from '@treeline/shared';
import { describe, expect, it } from 'vitest';
import { fileTree, type Dir } from './fileTree';

const file = (path: string): FileChange => ({
  status: 'M',
  oldPath: path,
  path,
  additions: 1,
  deletions: 0
});
/** The tree as indented lines: folders end with '/', files don't. */
const lines = (dir: Dir, depth = 0): string[] => [
  ...dir.dirs.flatMap((d) => [`${'  '.repeat(depth)}${d.name}/`, ...lines(d, depth + 1)]),
  ...dir.files.map((f) => `${'  '.repeat(depth)}${f.path.split('/').pop()}`)
];

describe('fileTree', () => {
  it('groups by folder and merges chains of single folders', () => {
    const tree = fileTree(
      [
        'src/lib/components/a.svelte',
        'src/lib/components/b.svelte',
        'src/lib/c.ts',
        'docs/x/y/z.md',
        'README.md'
      ].map(file)
    );
    expect(lines(tree)).toEqual([
      'src/lib/',
      '  components/',
      '    a.svelte',
      '    b.svelte',
      '  c.ts',
      'docs/x/y/',
      '  z.md',
      'README.md'
    ]);
    expect(tree.dirs[0].path).toBe('src/lib');
  });
});
