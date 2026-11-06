import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The cynefin custom layout takes every length from its metrics table (spec #423, pitfall 13):
// no file in `packages/diagram-cynefin/src/layout/` but `metrics.ts` holds a length literal.
// `random.ts` is skipped too: it is v12's mulberry32 and string hash, ported exactly, and its
// numbers are bit-mixing constants, not lengths. The numbers the others may still write are
// counts, halves, Bézier coefficients and the invariants' tolerance.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, no offset, the marker box origin',
  '1': 'the previous index; a Bézier’s 1 − t; a unit vector',
  '2': 'halving; both sides of a box; Bézier coefficients',
  '3': 'cubic Bézier coefficients',
  '4': 'the quadratic formula’s 4ac',
  '5': 'the five domain labels the invariants count',
  '9': 'the nine subtitles the invariants count',
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

const DIR = join(REPO_ROOT, 'packages/diagram-cynefin/src/layout');
// The table itself, the PRNG, test fixtures and specs are not layout code.
const SKIPPED = new Set(['metrics.ts', 'random.ts', 'fixtures.ts']);
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !SKIPPED.has(f)
);

describe('cynefin layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 26; // 8\nx = w + 30 + 'a 4' + 1e4;")).toEqual([
      '26',
      '30',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['layout.ts', 'boundaries.ts', 'config.ts', 'invariants.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
