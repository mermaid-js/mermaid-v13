import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

// The flowchart graph builder takes every length from the unit profile (#43, D77): `packages/diagram-flowchart/src/render/prepare.ts` holds no
// length literal. The numbers it may still write are counts, multipliers and non-length caps.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the least spacing',
  '1': 'the default edge length in ranks; the border cell of a text-form box',
  '2': 'both sides of a box; the second duplicate edge id',
  '400': 'the normal font weight',
  '600': 'the least bold font weight',
  '1000': 'the cap on a font size taken from a style',
  '1e4': 'the cap on a config number (v12 took strings)',
};

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

describe('flowchart prepare.ts', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('holds no length literal outside the unit profile', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'packages/diagram-flowchart/src/render/prepare.ts'),
      'utf8'
    );
    const stray = numericLiterals(source).filter((n) => !(n in ALLOWED));
    expect(stray).toEqual([]);
  });
});
