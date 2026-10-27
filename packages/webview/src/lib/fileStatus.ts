import type { FileStatus } from '@treeline/shared';

/** A changed file's status letter, colored as the editor's Explorer and Source Control color it. */
export const STATUS_COLOR: Record<FileStatus, string> = {
  A: 'text-[var(--vscode-gitDecoration-addedResourceForeground)]',
  U: 'text-[var(--vscode-gitDecoration-untrackedResourceForeground)]',
  M: 'text-[var(--vscode-gitDecoration-modifiedResourceForeground)]',
  D: 'text-[var(--vscode-gitDecoration-deletedResourceForeground)]',
  R: 'text-[var(--vscode-gitDecoration-renamedResourceForeground)]'
};

export const STATUS_LABEL: Record<FileStatus, string> = {
  A: 'Added',
  U: 'New, not tracked yet',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed'
};
