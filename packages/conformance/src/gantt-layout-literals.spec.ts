import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The gantt custom layout takes every length from `gantt.*` config or its metrics table
// (pitfall 13, spec #293 T3): no file in `packages/diagram-gantt/src/layout/` but `metrics.ts`
// holds a length literal. The numbers the others may still write are counts, halves and
// non-length values. Copied from `timeline-layout-literals.spec.ts`.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index, midnight',
  '1': 'a day step, the least line count, the first array index',
  '2': 'halving (a centre, half a span)',
  '23': 'the last hour of a day (v12 `endOf("day")`)',
  '59': 'the last minute and second of a day',
  '999': 'the last millisecond of a day',
  '32': 'the largest array index is 2^32 − 2 (object-key order)',
  '1e-6': 'the float tolerance of the invariant checks',
  '9': 'a digit range in a regular expression (`[1-9]`)',
};

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

const DIR = join(REPO_ROOT, 'packages/diagram-gantt/src/layout');
// The table itself, test fixtures and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts' && f !== 'fixtures.ts'
);

describe('gantt layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['layout.ts', 'bars.ts', 'parts.ts', 'env.ts', 'invariants.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
