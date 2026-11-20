import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';
import { numericLiterals } from './literals.ts';

// The wardley custom layout takes every length from its metrics table (spec #430, pitfall 13): no
// file in `packages/diagram-wardley/src/layout/` but `metrics.ts` holds a length literal. The
// numbers the others may still write are counts, multipliers and tolerances.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the canvas origin',
  '1': 'the next index; a whole; the upper clamp of a stage boundary',
  '2': 'halving, doubling',
  '100': 'a coordinate is a percentage',
  '180': 'half a turn in degrees (geometry.ts), a unit',
  '1e-6': 'the float tolerance of the invariant checks',
};

const DIR = join(REPO_ROOT, 'packages/diagram-wardley/src/layout');
// The table itself and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts'
);

describe('wardley layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(expect.arrayContaining(['layout.ts', 'geometry.ts', 'invariants.ts']));
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
