import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';
import { numericLiterals } from './literals.ts';

// The ER graph builder takes every length from the unit profile (ADR-13, pitfalls 13):
// `packages/diagram-er/src/layout/prepare.ts` holds no length literal. The numbers it may still
// write are counts, indexes, multipliers and non-length caps.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the rule thickness in px, the first column',
  '1': 'the default edge length in ranks; the rule thickness in cells; one tilde; a next index',
  '2': 'both sides of a cell; type and name, the columns always in use; tilde pairs',
  '3': 'the comment column index',
  '400': 'the normal font weight',
  '600': 'the least bold font weight',
  '1000': 'the cap on a font size taken from a style',
  '1e4': 'the cap on a config number (v12 took strings)',
};

describe('ER prepare.ts', () => {
  it('holds no length literal outside the unit profile', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'packages/diagram-er/src/layout/prepare.ts'),
      'utf8'
    );
    const stray = numericLiterals(source).filter((n) => !(n in ALLOWED));
    expect(stray).toEqual([]);
  });
});
