import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The block layout takes every length from the `block` config, the theme and its metrics table
// (spec #521 T3, pitfall 13): no file in `packages/diagram-block/src/{layout,shapes}/` but
// `layout/metrics.ts` holds a length literal. The leaf shapes' own geometry is the shared
// shapes' (`@mermaid-js/shared/shapes`), so `shapes/leaf.ts` holds none either. Any number must
// be one of the counts, factors and tolerances below.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'no size, no band, no corner; the top level; the first column and row',
  '1': 'one column; a span of one; the least scale of the float tolerance',
  '2': 'halving: the half width and height about a centre; a padding on both sides',
  '10': 'the edge-end tolerance as a multiple of the float tolerance',
  '180': 'degrees to radians',
  '600': 'the CSS weight from which a `font-weight` is bold',
  '1e-6': 'the float tolerance of the invariant checks',
};

/** Per folder: what only that folder's code may write. */
const ALLOWED_IN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  layout: {},
  shapes: {
    '3': "v12's block arrows put their side points at thirds of the height; a polygon has 3 points",
    '4': "the quadratic formula's 4; v12's arrow height is the label plus 4 half-paddings",
  },
};

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

const FOLDERS = ['layout', 'shapes'] as const;
const DIR = join(REPO_ROOT, 'packages/diagram-block/src');
// The metrics table is where the lengths are; fixtures and specs are not layout code.
const SOURCES = FOLDERS.flatMap((folder) =>
  readdirSync(join(DIR, folder))
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.spec.ts') &&
        !f.endsWith('.fixtures.ts') &&
        `${folder}/${f}` !== 'layout/metrics.ts'
    )
    .map((f) => `${folder}/${f}`)
);

describe('block layout and shapes', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 5; // 8\nx = w + 16 + 'a 4' + 1e4;")).toEqual([
      '5',
      '16',
      '1e4',
    ]);
  });

  it('scans the layout and shape sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining([
        'layout/grid.ts',
        'layout/layout.ts',
        'layout/kinds.ts',
        'layout/invariants.ts',
        'shapes/leaf.ts',
        'shapes/block-arrow.ts',
        'shapes/outline.ts',
      ])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const folder = file.split('/')[0]!;
    const allowed = { ...ALLOWED, ...ALLOWED_IN[folder] };
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in allowed)
    );
    expect(stray).toEqual([]);
  });
});
