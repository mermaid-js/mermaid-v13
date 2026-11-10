import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The block layout takes every length from the `block` config, the theme and its metrics table
// (spec #521 T3, pitfall 13): no file in `packages/diagram-block/src/{layout,shapes}/` but
// `layout/metrics.ts` holds a length literal. The shapes' own geometry (the flowchart copy's
// constants, D446) is allowed by name only: a `const` of that name, at the top level of
// `shapes/leaf.ts`. Any other number must be one of the counts, factors and tolerances below.
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

/** flowchart's shape constants in `shapes/leaf.ts`, by name. */
const NAMED: readonly string[] = [
  'MIN_SLANT',
  'MIN_LABEL_WIDTH',
  'FRAMES_WIDTH',
  'CYLINDER_MIN_WIDTH',
  'CAP_RY_MIN',
  'CAP_RY_MAX',
  'CAP_RY_DIVISOR',
  'CYLINDER_CAPS',
  'STADIUM_MIN_RATIO',
  'LEAN_SLANT',
  'SLANT_DIVISOR',
  'ODD_NOTCH',
];

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

/** `source` without the top-level `const NAME = <number>;` of each name in `names`. */
function withoutNamed(source: string, names: readonly string[]): string {
  let out = source;
  for (const name of names) {
    out = out.replace(new RegExp(`^const ${name} = [\\d.]+;$`, 'm'), '');
  }
  return out;
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
    // A named constant goes only where it is declared by an allowed name.
    expect(numericLiterals(withoutNamed('const MIN_SLANT = 1;\nconst OTHER = 7;', NAMED))).toEqual([
      '7',
    ]);
  });

  it('scans the layout and shape sources, and each allowed name is declared', () => {
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
    const leaf = readFileSync(join(DIR, 'shapes/leaf.ts'), 'utf8');
    for (const name of NAMED) expect(leaf).toMatch(new RegExp(`^const ${name} = [\\d.]+;$`, 'm'));
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const folder = file.split('/')[0]!;
    const named = file === 'shapes/leaf.ts' ? NAMED : [];
    const allowed = { ...ALLOWED, ...ALLOWED_IN[folder] };
    const stray = numericLiterals(
      withoutNamed(readFileSync(join(DIR, file), 'utf8'), named)
    ).filter((n) => !(n in allowed));
    expect(stray).toEqual([]);
  });
});
