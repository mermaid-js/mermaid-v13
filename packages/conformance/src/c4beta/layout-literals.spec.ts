import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../index.ts';
import { numericLiterals } from '../literals.ts';

// The c4-beta layout takes every length from its metrics table (`beta/metrics.ts`), the C4
// metrics table or the `c4` config (spec #730 §Layout, pitfall 13): no other file of
// `packages/diagram-c4/src/beta/` that lays out holds a length literal. The numbers it may still
// write are counts and fractions.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index',
  '1': 'the next index; a whole; the top level (-1); the end of a segment',
  '2': 'halving, doubling, a pair of corners',
};

const DIR = join(REPO_ROOT, 'packages/diagram-c4/src/beta');
const LAYOUT = ['headers.ts', 'layout.ts', 'prepare.ts', 'scene.ts'];

describe('c4-beta layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(readdirSync(DIR)).toEqual(expect.arrayContaining([...LAYOUT, 'metrics.ts']));
  });

  it.each(LAYOUT)('%s holds no length literal outside the metrics tables', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
