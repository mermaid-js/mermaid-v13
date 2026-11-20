import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';
import { numericLiterals } from './literals.ts';

// The usecase graph builder takes every length from its px metrics table, the config or core's
// px profile (pitfall 13, spec #517 T3): no file in `packages/diagram-usecase/src/layout/` but
// `metrics.ts` holds a length literal. The numbers the others may still write are counts,
// multipliers and non-length values.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index',
  '1': 'the default edge length in ranks; the oval level of a point on the oval; a segment end',
  '2': 'both sides of a box; halving; squaring',
  '4': 'the quadratic formula (where a line meets the oval)',
  '0.5': "the half-pixel slack of the invariant checks (core validateLayout's)",
  '1e-9': 'the float tolerance of a step along a segment (clip.ts)',
};

const DIR = join(REPO_ROOT, 'packages/diagram-usecase/src/layout');
// The table itself and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts'
);

describe('usecase layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['prepare.ts', 'clip.ts', 'layout.ts', 'invariants.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
