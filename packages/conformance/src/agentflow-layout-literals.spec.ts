import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The agentflow layout takes every length from the unit profile, the theme, config or its
// metrics table (pitfall 13, spec #523 T3): no file in `packages/diagram-agentflow/src/layout/`
// but `metrics.ts` holds a length literal. The numbers the others may still write are counts,
// multipliers and non-length caps.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the least spacing, the first index',
  '1': 'the default edge length in ranks; the least hexagon slant (a ratio); a next index',
  '2': 'both sides of a box; halving; the second duplicate edge id',
  '400': 'the normal font weight',
  '600': 'the least bold font weight',
  '1000': 'the cap on a font size taken from a style',
};

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

const DIR = join(REPO_ROOT, 'packages/diagram-agentflow/src/layout');
// The table itself and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts'
);

describe('agentflow layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['prepare.ts', 'shapes.ts', 'ends.ts', 'layout.ts', 'invariants.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
