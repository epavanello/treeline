import type { Commit } from '@treeline/shared';
import { describe, expect, it } from 'vitest';
import { layout } from './graph';

const c = (hash: string, ...parents: string[]): Commit => ({
  hash,
  parents,
  author: '',
  email: '',
  date: 0,
  subject: hash,
  refs: []
});

describe('layout', () => {
  it('keeps a linear history in one lane', () => {
    const g = layout([c('c', 'b'), c('b', 'a'), c('a')]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(g.rows[1].up).toEqual([{ from: 0, to: 0, color: 0, dashed: false }]);
    expect(g.width).toBe(1);
    expect(g.tail).toEqual([]);
  });

  it('forks a merge parent into a new lane and joins it back', () => {
    // m merges f into main; f and b both descend from a
    const g = layout([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 1, 0, 0]);
    expect(g.rows[1].up).toContainEqual({ from: 0, to: 1, color: 1, dashed: false });
    // At `a`, the side lane converges back into lane 0
    expect(g.rows[3].up).toContainEqual({ from: 1, to: 0, color: 1, dashed: false });
    expect(g.width).toBe(2);
  });

  it('two branch tips sharing a parent', () => {
    const g = layout([c('x', 'a'), c('y', 'a'), c('a')]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 1, 0]);
    expect(g.rows[2].up.map((e) => [e.from, e.to])).toEqual([
      [0, 0],
      [1, 0]
    ]);
  });

  it('draws a tail for lanes that continue past the loaded commits', () => {
    const g = layout([c('b', 'a')]);
    expect(g.tail).toEqual([{ from: 0, to: 0, color: 0, dashed: false }]);
  });

  it('dashes the uncommitted line', () => {
    const g = layout([c('*', 'h'), c('h')]);
    expect(g.rows[1].up[0].dashed).toBe(true);
  });
});
