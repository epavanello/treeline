import type { BranchDetails } from '@treeline/shared';
import { describe, expect, it, vi } from 'vitest';
import { BranchDetailsCache } from '../src/branchDetails';
import { Git } from '../src/git';
import { createFixtureRepo } from './fixture';

describe('BranchDetailsCache', () => {
  it('computes many branches at once and keeps the answers across sessions', async () => {
    const { dir } = createFixtureRepo();
    const git = new Git();
    const compute = vi.spyOn(git, 'branchDetails');
    let saved: Record<string, BranchDetails> | undefined;
    const store = { get: () => saved, set: (v: Record<string, BranchDetails>) => (saved = v) };
    const refs = [
      { ref: 'refs/heads/topic', key: 'a' },
      { ref: 'refs/heads/feature', key: 'b' }
    ];
    const first = await new BranchDetailsCache(git, store).get(dir, refs, 'origin/main');
    expect(first['refs/heads/topic'].unique).toBe(1);
    expect(first['refs/heads/feature'].unique).toBe(0);
    expect(compute).toHaveBeenCalledTimes(2);

    // Saved a moment later; a new session reads them back instead of asking git
    await vi.waitFor(() => expect(saved).toBeDefined(), { timeout: 4000 });
    const again = await new BranchDetailsCache(git, store).get(dir, refs, 'origin/main');
    expect(again).toEqual(first);
    expect(compute).toHaveBeenCalledTimes(2);

    // Another commit (key): asked again
    await new BranchDetailsCache(git, store).get(
      dir,
      [{ ...refs[0], key: 'moved' }],
      'origin/main'
    );
    expect(compute).toHaveBeenCalledTimes(3);
  });
});
