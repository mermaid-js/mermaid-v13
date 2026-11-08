import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The venn custom layout takes every length from its metrics table (spec #429, pitfall 13): no
// file in `packages/diagram-venn/src/layout/` but `metrics.ts` holds a length literal. The
// numbers the others may still write are counts, multipliers and tolerances. The solver
// (`src/solver/`) is venn.js's arithmetic, ported as it is (D411), and has no px lengths: the
// box and padding come in as arguments.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the canvas origin',
  '1': 'one line, one column; the next index',
  '2': 'halving; a diameter; two decimals in a message',
  '3': 'an overlap of three sets or more (v12 `ensurePairwiseSubsets`)',
  '4': 'the size v12 gives an added pair, `min(a, b) / 4` (a size, not a length)',
  '1e-6': 'the float tolerance of the invariant checks',
};

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

const DIR = join(REPO_ROOT, 'packages/diagram-venn/src/layout');
// The table itself, test fixtures and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts' && f !== 'fixtures.ts'
);

describe('venn layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(expect.arrayContaining(['layout.ts', 'invariants.ts', 'styles.ts']));
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
