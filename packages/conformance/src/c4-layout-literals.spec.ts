import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkColor } from '@mermaid-js/core/svg';
import { c4, C4_CONFIG_DEFAULTS, C4_ELEMENT_KINDS } from '@mermaid-js/diagram-c4';
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

/** A `C4DiagramConfig` key's schema `minimum`, as written. */
function schemaMinimum(schema: string, key: string): string | undefined {
  const section = schema.slice(schema.indexOf('  C4DiagramConfig:'));
  return new RegExp(`\\n      ${key}:\\n(?:        .*\\n)*?        minimum: (\\S+)`).exec(
    section
  )?.[1];
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

  it('the config reader holds no length literal: its defaults are the generated ones', () => {
    const stray = numericLiterals(readFileSync(CONFIG, 'utf8')).filter((n) => !(n in ALLOWED));
    expect(stray).toEqual([]);
  });

  it('the config reader’s defaults are the schema’s, read from the generated section defaults', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    for (const [key, value] of Object.entries(C4_CONFIG_DEFAULTS))
      expect(String(value), key).toBe(schemaDefault(schema, key));
    // Each font falls back to its own key's default size.
    for (const prefix of [...C4_ELEMENT_KINDS, 'boundary', 'message'])
      expect(String(c4.configDefaults[`${prefix}FontSize`]), prefix).toBe(
        schemaDefault(schema, `${prefix}FontSize`)
      );
  });

  it('the lengths a value below 0 falls back for are those whose schema minimum is 0', () => {
    const source = readFileSync(CONFIG, 'utf8');
    const schema = readFileSync(SCHEMA, 'utf8');
    expect(/const LENGTH_MIN = (\d+);/.exec(source)![1]).toBe('0');
    const lengths = /const LENGTHS = \[([^\]]*)\]/.exec(source)![1]!.match(/\w+/g)!;
    expect(lengths).toHaveLength(5);
    for (const key of lengths) expect(schemaMinimum(schema, key), key).toBe('0');
    expect(schemaMinimum(schema, 'nextLinePaddingX')).toBeUndefined();
  });

  it('the element palette’s defaults are the schema’s colours, from the plugin’s configDefaults (#542)', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    const defaults = c4.configDefaults;
    for (const kind of C4_ELEMENT_KINDS) {
      for (const part of ['bg', 'border']) {
        const key = `${kind}_${part}_color`;
        expect(`'${String(defaults[key])}'`, key).toBe(schemaDefault(schema, key));
        // paint.ts draws it when a configured colour is refused: it must pass the check.
        expect(checkColor(String(defaults[key])), key).toBeDefined();
      }
    }
  });
});
