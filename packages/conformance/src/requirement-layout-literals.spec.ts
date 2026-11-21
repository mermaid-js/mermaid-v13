import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';
import { numericLiterals } from './literals.ts';

// The requirement layout takes every length from its metrics table (pitfall 13, spec #520 T3):
// no file in `packages/diagram-requirement/src/layout/` but `metrics.ts` holds a length
// literal. The numbers the others may still write are counts, indexes, multipliers and
// non-length values.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index, no style bits',
  '1': 'the default relation length in ranks; the label of a [part, label] pair',
  '2': 'halving: centring a line, half the first line',
  '400': 'the normal font weight',
  '600': 'the least bold font weight',
};

const DIR = join(REPO_ROOT, 'packages/diagram-requirement/src/layout');
// The table itself and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts'
);

describe('requirement layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(expect.arrayContaining(['layout.ts', 'prepare.ts']));
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
