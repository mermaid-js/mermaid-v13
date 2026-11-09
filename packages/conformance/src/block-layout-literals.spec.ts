import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The block layout takes every length from the `block` config, the theme and its metrics table
// (spec #521 T3, pitfall 13): no file in `packages/diagram-block/src/layout/` but
// `metrics.ts` holds a length literal. The numbers it may still write are counts, halves,
// factors and the invariants' float tolerance.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'no size, no band, no corner; the top level; the first column and row',
  '1': 'one column; a span of one; the least scale of the float tolerance',
  '2': 'halving: the half width and height about a centre; a padding on both sides',
  '3': "the cubic Bézier's middle weights (1, 3, 3, 1)",
  '8': "the cubic Bézier's middle point: the weights' sum",
  '10': 'the edge-end tolerance as a multiple of the float tolerance',
  '180': 'degrees to radians',
  '600': 'the CSS weight from which a `font-weight` is bold',
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

const DIR = join(REPO_ROOT, 'packages/diagram-block/src/layout');
// The metrics table is where the lengths are; fixtures and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) =>
    f.endsWith('.ts') &&
    !f.endsWith('.spec.ts') &&
    !f.endsWith('.fixtures.ts') &&
    f !== 'metrics.ts'
);

describe('block layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 5; // 8\nx = w + 16 + 'a 4' + 1e4;")).toEqual([
      '5',
      '16',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['grid.ts', 'layout.ts', 'invariants.ts', 'types.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
