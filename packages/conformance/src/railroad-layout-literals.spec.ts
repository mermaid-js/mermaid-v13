import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The railroad custom layout takes every fixed length from its metrics table (spec #526,
// pitfall 13): no file in `packages/diagram-railroad/src/layout/` but `metrics.ts` holds a length
// literal; the configurable lengths are the `railroad` section's (`src/config.ts`). The numbers
// the others may still write are counts, multipliers and tolerances.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'the origin, empty sizes, a square corner, no style bits',
  '1': 'the last element, the next index',
  '2': "halving; v12's `2r` lanes and paddings on both sides; both stroke halves",
  '4': "v12's `4r`: a choice, optional or repetition is its content plus four arc radii",
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

const DIR = join(REPO_ROOT, 'packages/diagram-railroad/src/layout');
// The table itself, test fixtures and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) =>
    f.endsWith('.ts') &&
    !f.endsWith('.spec.ts') &&
    f !== 'metrics.ts' &&
    !f.endsWith('.fixtures.ts')
);

describe('railroad layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['layout.ts', 'geometry.ts', 'invariants.ts', 'types.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
