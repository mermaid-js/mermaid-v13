import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';
import { numericLiterals } from './literals.ts';

// The XY chart layout takes every length from its metrics table or the `xyChart` config (spec
// #426, pitfall 13): no file in `packages/diagram-xychart/src/layout/` but `metrics.ts` holds a
// length literal, and `scale.ts` holds only d3's arithmetic. The numbers the others may still
// write are counts, multipliers, angles and tolerances.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the canvas origin',
  '1': 'the previous index; one step',
  '2': 'halving; two ends',
  '100': 'plotReservedSpacePercent is a percentage',
  '180': 'degrees to radians',
  '270': "v12's left axis title rotation (degrees)",
  '1e-6': 'the float tolerance of the invariant checks',
};

const DIR = join(REPO_ROOT, 'packages/diagram-xychart/src/layout');
// The table itself, d3's arithmetic and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts' && f !== 'scale.ts'
);

describe('xychart layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['layout.ts', 'axis.ts', 'text.ts', 'invariants.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
