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
  '1e-6': 'the float tolerance of the choice side test and the invariant checks',
};

/**
 * Numbers allowed only as a factor: `2 * x` or `x / 2` (v12's `2r` lanes, padding on both sides,
 * both stroke halves, halving), and `4 * r` (a choice, optional or repetition is its content
 * plus four arc radii).
 */
const FACTORS: Readonly<Record<string, (before: string, after: string) => boolean>> = {
  '2': (before, after) => /^\s*\*/.test(after) || /\/\s*$/.test(before),
  '4': (_before, after) => /^\s*\*\s*r\b/.test(after),
};

/** The source with comments and string text blanked; a template keeps its `${…}` code. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, (t) =>
      [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => ` ${m[1]} `).join(' ')
    )
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
}

const NUMBER = /(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi;

/** The numeric literals in TypeScript source, outside comments and string text. */
function numericLiterals(source: string): string[] {
  return codeOf(source).match(NUMBER) ?? [];
}

/** The literals neither allowed anywhere nor used as an allowed factor. */
function strayLiterals(source: string): string[] {
  const code = codeOf(source);
  const out: string[] = [];
  for (const m of code.matchAll(NUMBER)) {
    const n = m[0];
    if (n in ALLOWED) continue;
    const at = m.index;
    const factor = FACTORS[n];
    if (
      factor?.(code.slice(Math.max(0, at - 8), at), code.slice(at + n.length, at + n.length + 24))
    ) {
      continue;
    }
    out.push(n);
  }
  return out;
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
    expect(numericLiterals('const t = `a 3 ${w + 7} b`;')).toEqual(['7']);
  });

  it('allows 2 and 4 only as factors', () => {
    expect(strayLiterals('a = 2 * r + h / 2 + 4 * r;')).toEqual([]);
    expect(strayLiterals('a = w + 2; b = 4 * w; c = `${x + 4}`;')).toEqual(['2', '4', '4']);
  });

  it('scans the layout sources', () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining(['layout.ts', 'geometry.ts', 'invariants.ts', 'types.ts'])
    );
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    expect(strayLiterals(readFileSync(join(DIR, file), 'utf8'))).toEqual([]);
  });
});
