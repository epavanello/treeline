import type { FileChange } from '@treeline/shared';

/** A folder of the changed-files tree. */
export interface Dir {
  /** Its row label: one folder, or a chain of folders holding nothing but the next one (`a/b/c`). */
  name: string;
  path: string;
  dirs: Dir[];
  files: FileChange[];
}

/** Groups changed files by folder, merging chains of single folders into one row. */
export function fileTree(files: FileChange[]): Dir {
  const root: Dir = { name: '', path: '', dirs: [], files: [] };
  for (const f of files) {
    let dir = root;
    for (const part of f.path.split('/').slice(0, -1)) {
      const path = dir.path ? `${dir.path}/${part}` : part;
      let next = dir.dirs.find((d) => d.path === path);
      if (!next) dir.dirs.push((next = { name: part, path, dirs: [], files: [] }));
      dir = next;
    }
    dir.files.push(f);
  }
  const compact = (dir: Dir): Dir => {
    while (dir.name && dir.dirs.length === 1 && dir.files.length === 0) {
      const [only] = dir.dirs;
      dir = { ...only, name: `${dir.name}/${only.name}` };
    }
    return { ...dir, dirs: dir.dirs.map(compact) };
  };
  return compact(root);
}
