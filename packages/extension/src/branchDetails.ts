/**
 * Branch details (owner, merged state) for many branches at once: a few git processes at a time, and
 * every answer kept by the commits it was computed for (branch and base), across sessions: for the
 * same commits it never changes, so reopening a big repository costs nothing. vscode-free.
 */
import type { BranchDetails } from '@treeline/shared';
import type { Git } from './git';

/** Git processes at a time: enough to use the cores, few enough not to starve the graph's own. */
const PARALLEL = 6;
/** Answers kept (the most recently used): a few big repositories' worth. */
const KEEP = 3000;

export interface Store {
  get(): Record<string, BranchDetails> | undefined;
  set(value: Record<string, BranchDetails>): unknown;
}

export class BranchDetailsCache {
  private readonly cache: Map<string, BranchDetails>;
  private saving?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly git: Git,
    private readonly store: Store
  ) {
    this.cache = new Map(Object.entries(store.get() ?? {}));
  }

  async get(repo: string, refs: { ref: string; key: string }[], base: string) {
    const out: Record<string, BranchDetails> = {};
    const todo: { ref: string; id: string }[] = [];
    for (const { ref, key } of refs) {
      const id = `${repo}\0${ref}\0${key}`;
      const hit = this.cache.get(id);
      if (hit) out[ref] = hit;
      else todo.push({ ref, id });
    }
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const { ref, id } = todo[next++];
        try {
          const details = await this.git.branchDetails(repo, ref, base);
          out[ref] = details;
          this.cache.delete(id);
          this.cache.set(id, details);
        } catch {
          // Deleted meanwhile: the next load won't ask again
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
    if (todo.length) this.save();
    return out;
  }

  private save() {
    clearTimeout(this.saving);
    this.saving = setTimeout(
      () => this.store.set(Object.fromEntries([...this.cache].slice(-KEEP))),
      2000
    );
  }
}
