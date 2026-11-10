import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C4_ELEMENT_COLORS, C4_ELEMENT_KINDS } from '@mermaid-js/diagram-c4';
import { REPO_ROOT } from './index.ts';

// The C4 custom layout takes every length from its metrics table or the `c4` config (spec #522,
// pitfall 13): no file in `packages/diagram-c4/src/layout/` but `metrics.ts`, nor the config
// reader `src/config.ts`, holds a length literal. The numbers they may still write are counts,
// multipliers and tolerances. The config reader's defaults are the schema's
// (`C4DiagramConfig`), checked against it here instead.
const ALLOWED: Readonly<Record<string, string>> = {
  '0': 'empty sizes, comparisons, the first index',
  '1': 'the next index; a whole; the top level (-1)',
  '2': 'halving, doubling, x and y pairs',
  '3': 'a cylinder is three cap radii taller than its text (two above, one below)',
  '4': 'a quarter: where a bent line leaves a side',
  '6': 'the index of the last x in an elbow’s four corners',
  '7': 'the index of the last y in an elbow’s four corners',
  '1e-6': 'the float tolerance of the invariant checks',
  '0.01': 'how far an end may lie off its outline in the invariant checks',
};

/** The numeric literals in TypeScript source, outside comments and strings. */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, "''");
  return code.match(/(?<![\w$.])\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
}

const DIR = join(REPO_ROOT, 'packages/diagram-c4/src/layout');
// The table itself, specs and spec helpers are not layout code.
const SOURCES = readdirSync(DIR).filter(
  (f) =>
    f.endsWith('.ts') &&
    !f.endsWith('.spec.ts') &&
    !f.endsWith('.fixtures.ts') &&
    f !== 'metrics.ts'
);

const CONFIG = join(REPO_ROOT, 'packages/diagram-c4/src/config.ts');
const SCHEMA = join(REPO_ROOT, 'packages/core/schema/config.schema.yaml');

/** The config reader's text less its schema defaults: `C4_CONFIG_DEFAULTS` and the two font sizes. */
function configCode(source: string): string {
  return source
    .replace(/export const C4_CONFIG_DEFAULTS[\s\S]*?\n};/, '')
    .replace(/export const C4_(?:MESSAGE_)?FONT_SIZE = \d+;/g, '');
}

/** A `C4DiagramConfig` key's schema default, as written. */
function schemaDefault(schema: string, key: string): string | undefined {
  const section = schema.slice(schema.indexOf('  C4DiagramConfig:'));
  return new RegExp(`\\n      ${key}:\\n(?:        .*\\n)*?        default: (\\S+)`).exec(
    section
  )?.[1];
}

describe('c4 layout', () => {
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
        'grid.ts',
        'route.ts',
        'shapes.ts',
        'path.ts',
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

  it('the config reader holds no length literal outside its schema defaults', () => {
    const stray = numericLiterals(configCode(readFileSync(CONFIG, 'utf8'))).filter(
      (n) => !(n in ALLOWED)
    );
    expect(stray).toEqual([]);
  });

  it('the config reader’s defaults are the schema’s', () => {
    const source = readFileSync(CONFIG, 'utf8');
    const schema = readFileSync(SCHEMA, 'utf8');
    const defaults = /export const C4_CONFIG_DEFAULTS[\s\S]*?\n};/.exec(source)![0];
    const pairs = [...defaults.matchAll(/^\s+(\w+): (\w+),$/gm)].map((m): [string, string] => [
      m[1]!,
      m[2]!,
    ]);
    expect(pairs.map(([k]) => k)).toEqual([
      'diagramMarginX',
      'diagramMarginY',
      'c4ShapeMargin',
      'c4ShapePadding',
      'width',
      'nextLinePaddingX',
      'c4ShapeInRow',
      'c4BoundaryInRow',
      'wrap',
    ]);
    for (const [key, value] of pairs) expect(schemaDefault(schema, key), key).toBe(value);
    expect(/C4_FONT_SIZE = (\d+);/.exec(source)![1]).toBe(schemaDefault(schema, 'personFontSize'));
    expect(/C4_MESSAGE_FONT_SIZE = (\d+);/.exec(source)![1]).toBe(
      schemaDefault(schema, 'messageFontSize')
    );
  });

  it('the element palette’s defaults are the schema’s', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    expect(Object.keys(C4_ELEMENT_COLORS).sort()).toEqual([...C4_ELEMENT_KINDS].sort());
    for (const kind of C4_ELEMENT_KINDS) {
      const [bg, border] = C4_ELEMENT_COLORS[kind];
      expect(schemaDefault(schema, `${kind}_bg_color`), kind).toBe(`'${bg}'`);
      expect(schemaDefault(schema, `${kind}_border_color`), kind).toBe(`'${border}'`);
    }
  });
});
