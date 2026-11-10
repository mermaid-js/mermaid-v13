import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../index.ts';

// The architecture graph builder takes every length from its metrics table (pitfall 13, spec
// #525 "Package and contract", #607): no file in `packages/diagram-architecture/src/layout/` but
// `metrics.ts` holds a length literal. The others write counts, halvings and tolerances.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index',
  '1': 'the least edge length in ranks; the next index; a direction',
  '2': 'halving: the icon centre, a box centre',
  '0.5': "the invariant checks' float tolerance (core's validateLayout slack)",
  '1e4': "the cap on a config length (`config-length.ts`, as class, er, state and flowchart's)",
};

/**
 * The code of TypeScript source with comments and string text blanked, in one pass, so a `//`
 * inside a string is no comment and a template's `${…}` expressions stay code (nested templates
 * too). Regex literals are kept as code: a digit in one is reported, which errs on the safe side.
 */
function codeOf(source: string): string {
  let out = '';
  let i = 0;
  // One entry per open `${`: the brace depth inside it, to find its closing `}`.
  const templates: number[] = [];
  const template = (): void => {
    // At a template's text: copy nothing until its end or the next `${`.
    for (;;) {
      const c = source[i];
      if (c === undefined) return;
      if (c === '\\') i += 2;
      else if (c === '`') {
        i++;
        out += "''";
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        i += 2;
        out += ' ';
        templates.push(0);
        return;
      } else i++;
    }
  };
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close < 0 ? source.length : close + 2;
      out += ' ';
    } else if (c === "'" || c === '"') {
      i++;
      while (i < source.length && source[i] !== c && source[i] !== '\n')
        i += source[i] === '\\' ? 2 : 1;
      i++;
      out += "''";
    } else if (c === '`') {
      i++;
      template();
    } else if (templates.length > 0 && c === '{') {
      templates[templates.length - 1]!++;
      out += c;
      i++;
    } else if (templates.length > 0 && c === '}') {
      i++;
      if (templates[templates.length - 1] === 0) {
        templates.pop();
        out += ' ';
        template();
      } else {
        templates[templates.length - 1]!--;
        out += c;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** The numeric literals in TypeScript source, outside comments and strings (hex included). */
function numericLiterals(source: string): string[] {
  return (
    codeOf(source).match(
      /(?<![\w$.])(?:0x[\da-f_]+|\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?|\.\d+(?:e[-+]?\d+)?)/gi
    ) ?? []
  );
}

const DIR = join(REPO_ROOT, 'packages/diagram-architecture/src/layout');
// The table and the specs' fixtures are not layout code.
const EXEMPT = ['metrics.ts', 'fixtures.ts'];
const SOURCES = readdirSync(DIR, { recursive: true, encoding: 'utf8' }).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !EXEMPT.includes(f)
);

describe('architecture layout', () => {
  it('finds a length literal the scan is meant to catch', () => {
    expect(numericLiterals("const PAD = 20; // 8\nx = w + 12 + 'a 4' + 1e4;")).toEqual([
      '20',
      '12',
      '1e4',
    ]);
  });

  it('reads numbers inside template expressions, after a // in a string, and in hex', () => {
    expect(numericLiterals('const a = `w${12}px ${`x${7}`}`;')).toEqual(['12', '7']);
    expect(numericLiterals("const s = 'http://x'; const n = 40;")).toEqual(['40']);
    expect(numericLiterals('const t = "a//b" + 0x18 + .5;')).toEqual(['0x18', '.5']);
    expect(numericLiterals('/* 9 */ x = 3 // 4')).toEqual(['3']);
  });

  it('scans the builder and every folder under layout/', () => {
    expect(SOURCES).toContain('prepare.ts');
    expect(readdirSync(DIR, { recursive: true }).length).toBeGreaterThanOrEqual(SOURCES.length);
  });

  it.each(SOURCES)('%s holds no length literal outside the metrics table', (file) => {
    const stray = numericLiterals(readFileSync(join(DIR, file), 'utf8')).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });
});
