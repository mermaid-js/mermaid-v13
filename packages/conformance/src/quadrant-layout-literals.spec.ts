import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The quadrant layout takes every length from the resolved `quadrantChart` config (spec #289 T3,
// pitfall 13): no file in `packages/diagram-quadrant/src/layout/` holds a length literal. The
// numbers it may still write are halves, the [0, 1] coordinate range, quadrant numbers, the
// label rotation and the invariants' float tolerance.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'no space for a hidden band; no rotation; no stroke width unless a style sets one; [0, 1]',
  '1': 'the coordinate range [0, 1]; quadrant 1; a quadrant number from its index',
  '2': 'quadrant 2; halving: the half square, half quadrant, half border stroke, both paddings of a band',
  '3': 'the quadrant number 3 (its type, the tiling check)',
  '4': 'the quadrant number 4 (its type, the tiling check)',
  '90': 'the y-axis label rotation, in degrees',
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

const DIR = join(REPO_ROOT, 'packages/diagram-quadrant/src/layout');
// Fixtures and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'fixtures.ts'
);

describe('quadrant layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 5; // 8\nx = w + 16 + 'a 4' + 1e4;")).toEqual([
      '5',
      '16',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(expect.arrayContaining(['layout.ts', 'invariants.ts']));
  });

  it.each(SOURCES)('%s holds no length literal outside the config', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
