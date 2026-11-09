import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The C4 custom layout takes every length from its metrics table or the `c4` config (spec #522,
// pitfall 13): no file in `packages/diagram-c4/src/layout/` but `metrics.ts` holds a length
// literal. The numbers the others may still write are counts, multipliers and tolerances.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index',
  '1': 'the next index; a whole; the top level (-1)',
  '2': 'halving, doubling, x and y pairs',
  '3': 'a cylinder is three cap radii taller than its text (two above, one below)',
  '4': 'a quarter: where a bent line leaves a side',
  '6': 'the index of the last x in an elbow’s four corners',
  '7': 'the index of the last y in an elbow’s four corners',
  '1e-6': 'the float tolerance of the invariant checks',
  '0.01': 'how far an end may lie off its outline in the invariant checks',
};

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

const DIR = join(REPO_ROOT, 'packages/diagram-c4/src/layout');
// The table itself, specs and spec helpers are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) =>
    f.endsWith('.ts') &&
    !f.endsWith('.spec.ts') &&
    !f.endsWith('.fixtures.ts') &&
    f !== 'metrics.ts'
);

describe('c4 layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining([
        'layout.ts',
        'grid.ts',
        'route.ts',
        'shapes.ts',
        'path.ts',
        'invariants.ts',
      ])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
