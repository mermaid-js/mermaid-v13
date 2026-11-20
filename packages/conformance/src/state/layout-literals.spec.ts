import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../index.ts';
import { numericLiterals } from '../literals.ts';

// `packages/diagram-state/src/layout`: the state graph builder and layout pass take every length from the unit profile (ADR-13,
// D77) or state's own px/cell table (`metrics.ts`, D108): they hold no length literal. The
// numbers they may still write are counts, multipliers and non-length caps.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, a region-split composite’s side padding',
  '1': 'the default edge length in ranks; the border cell of a text-form box; one region',
  '2': 'both sides of a box; halves',
  '400': 'the normal font weight',
  '600': 'the least bold font weight',
  '1000': 'the cap on a font size taken from a style',
  '1e4': 'the cap on a config number (v12 took strings)',
  '1e-6': 'floating-point noise',
};

describe('state layout sources', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  for (const file of ['prepare.ts', 'layout.ts']) {
    it(`${file} holds no length literal outside the unit profile`, () => {
      const source = readFileSync(
        join(REPO_ROOT, 'packages/diagram-state/src/layout', file),
        'utf8'
      );
      expect(numericLiterals(source).filter((n) => !(n in ALLOWED))).toEqual([]);
    });
  }
});
