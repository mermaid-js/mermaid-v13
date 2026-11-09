import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { treemapValueFormat } from '@mermaid-js/diagram-treemap';
import { REPO_ROOT } from '../corpus.ts';
import { loadD3, v12ValueFormat, type D3 } from './d3.ts';

/**
 * `treemap.valueFormat` (D409, #485): the package's d3-format, with v12's `$` cases on top,
 * formats every value of `corpus/treemap-value-format.json` with every specifier there as v12
 * did over d3-format 3.1.2. Where v12 threw (a `$` and a rest d3 rejects, which failed v12's
 * render) v13 falls back to `,`, as v12 does for any other specifier d3 rejects; the table lists
 * those specifiers.
 */
interface Table {
  readonly specifiers: readonly string[];
  readonly values: readonly (number | string)[];
  readonly fallbacks: readonly string[];
}
const TABLE = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/treemap-value-format.json'), 'utf8')
) as Table;
const VALUES = TABLE.values.map(Number);

let d3: D3;
beforeAll(async () => {
  d3 = await loadD3();
});

/** v12's output, or `undefined` where v12 threw. */
function v12(specifier: unknown, value: number): string | undefined {
  try {
    return v12ValueFormat(d3, specifier)(value);
  } catch {
    return undefined;
  }
}

describe('treemap valueFormat against d3-format', () => {
  it('reaches d3-format 3.1.2, as mermaid@12.2.0 resolves it', () => {
    expect(d3.versions.format).toBe('3.1.2');
  });

  it('covers the e2e specifiers, v12 `$` cases and rejected specifiers', () => {
    for (const s of ['$0,0', '.1%', '.2f', '$.2f', '$,.2f', ',', '']) {
      expect(TABLE.specifiers).toContain(s);
    }
    const rejected = TABLE.specifiers.filter((s) => {
      try {
        d3.format(s);
        return false;
      } catch {
        return true;
      }
    });
    expect(rejected.length).toBeGreaterThan(10);
    expect(VALUES.some(Number.isNaN)).toBe(true);
  });

  it('lists exactly the specifiers v12 threw on', () => {
    const threw = TABLE.specifiers.filter((s) => v12(s, 1) === undefined);
    expect(threw).toEqual(TABLE.fallbacks);
  });

  it.each(TABLE.specifiers)('formats as v12 with %j', (specifier) => {
    const v13 = treemapValueFormat(specifier);
    const comma = d3.format(',');
    const diffs: string[] = [];
    for (const value of VALUES) {
      const want = v12(specifier, value) ?? comma(value);
      const got = v13(value);
      if (got !== want) diffs.push(`${value}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    }
    expect(diffs).toEqual([]);
  });

  it.each([undefined, null, 5, true, {}])('falls back to `,` for a non-string %j', (s) => {
    expect(treemapValueFormat(s)(1234.5)).toBe(v12(s, 1234.5));
  });
});
