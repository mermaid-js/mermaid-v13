import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../index.ts';
import { numericLiterals } from '../literals.ts';

// The gitGraph custom layout takes every length from its metrics table (D108, spec #292 T3): no
// file in `packages/diagram-gitgraph/src/layout/` but `metrics.ts` holds a length literal. The
// numbers the others may still write are counts, multipliers and non-length values. The renderer
// (`render/`, T4) reads its lengths from the layout and the theme variables (`variables.ts`);
// its own v12 drawing constants are named top-level constants, never literals in the code.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index, an arc sweep flag',
  '1': 'a counter step, a sign, an arc sweep flag',
  '2': 'both sides of a box; halving',
  '180': 'degrees in a half turn (rotations)',
  '400': 'the normal font weight',
  '700': 'the bold font weight',
  '1e-6': 'the float tolerance of the invariant checks',
};

const DIR = join(REPO_ROOT, 'packages/diagram-gitgraph/src/layout');
// The table itself, test fixtures and specs are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'metrics.ts' && f !== 'fixtures.ts'
);

describe('gitGraph layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining([
        'layout.ts',
        'place.ts',
        'labels.ts',
        'arrows.ts',
        'env.ts',
        'invariants.ts',
      ])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});

/** `source` with its top-level `const UPPER_CASE = …;` declarations blanked out. */
function withoutNamedConstants(source: string): string {
  const out: string[] = [];
  let depth = 0;
  let inConst = false;
  for (const line of source.split('\n')) {
    if (depth === 0 && /^(export )?const [A-Z][A-Z0-9_]*\b/.test(line)) inConst = true;
    const code = line.replace(/\/\/.*$/, '');
    if (inConst) {
      for (const ch of code) {
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
      }
      out.push('');
      if (depth === 0 && /;\s*$/.test(code)) inConst = false;
    } else out.push(line);
  }
  return out.join('\n');
}

const RENDER = join(REPO_ROOT, 'packages/diagram-gitgraph/src/render');
const RENDER_SOURCES = readdirSync(RENDER).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts')
);

describe('gitGraph renderer', () => {
  it('blanks named constants and keeps literals in code', () => {
    const src = 'const A = { b: [1, 22] };\nconst C = 2.5 *\n  3;\nf(17);\n';
    expect(numericLiterals(withoutNamedConstants(src))).toEqual(['17']);
  });

  it('scans the renderer sources', () => {
    expect(RENDER_SOURCES).toEqual(
      expect.arrayContaining(['render.ts', 'paint.ts', 'variables.ts'])
    );
  });

  it.each(RENDER_SOURCES)('%s writes no length literal outside a named constant', (file) => {
    const source = withoutNamedConstants(readFileSync(join(RENDER, file), 'utf8'));
    const stray = numericLiterals(source).filter((n) => !(n in ALLOWED));
    expect(stray).toEqual([]);
  });
});
