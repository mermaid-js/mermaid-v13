import { describe, expect, it } from 'vitest';
import { language, xyChartLanguage } from './language.ts';

/**
 * The XY chart language facet (#512) at its own seam: completions at a probe parse and hover
 * over a plain parse, as the language service calls them, `isValidId` and `renameText`. The
 * service-level behaviour (definition, references, rename, folding, semantic tokens) is in the
 * goldens (`packages/language-service/goldens/xychart`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = xyChartLanguage.parse(text, { keepTokens: true, probe: at });
  return xyChartLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Hover at `¦`, given the token and symbol the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = xyChartLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  let touching: typeof token;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (!/\S/.test(text.slice(start, end))) continue;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
    else if (end === at) touching = { kind: tokens.kind[i]!, range: { start, end } };
  }
  token ??= touching;
  const symbol = result.symbols.find((x) => x.range.start <= at && at <= x.range.end);
  return xyChartLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

const STATEMENTS = [
  'title',
  'x-axis',
  'y-axis',
  'bar',
  'line',
  'accTitle',
  'accDescr',
  'accDescr {',
];

describe('xychart language facet', () => {
  it('is the xychart facet, exported under the fixed name `language`', () => {
    expect(language).toBe(xyChartLanguage);
    expect(xyChartLanguage.id).toBe('xychart');
    expect(xyChartLanguage.namespaces).toEqual([['category'], ['plot']]);
    expect(xyChartLanguage.standalone).toEqual(['category']);
  });

  it('offers the header only where it goes, and the orientations right after it', () => {
    expect(complete('¦')).toEqual(['xychart']);
    expect(complete('xy¦')).toEqual(['xychart']);
    expect(complete('xychart ¦')).toEqual(['vertical', 'horizontal']);
    expect(complete('xychart hor¦')).toEqual(['horizontal']);
    expect(complete('xychart\n  bar [1]\n  xy¦')).toEqual([]);
  });

  it('offers the statements at the start of a line or after `;`, below a header', () => {
    expect(complete('xychart\n  ¦')).toEqual(STATEMENTS);
    expect(complete('xychart\n  bar [1]; ¦')).toEqual(STATEMENTS);
    expect(complete('xychart\n  y-¦')).toEqual(['y-axis']);
    expect(complete('xychart\n  title Sales ¦')).toEqual([]);
    expect(complete('xychart\n  bar [1] ¦')).toEqual([]);
  });

  it('offers `-->` after a range minimum and `[` after an axis or plot name', () => {
    expect(complete('xychart\n  y-axis Revenue 10 ¦')).toEqual(['-->']);
    expect(complete('xychart\n  x-axis 0 -¦')).toEqual(['-->']);
    expect(complete('xychart\n  x-axis 0 ¦--> 5')).toEqual([]);
    expect(complete('xychart\n  x-axis Month ¦')).toEqual(['[']);
    expect(complete('xychart\n  line Sales ¦')).toEqual(['[']);
    expect(complete('xychart\n  y-axis Revenue ¦')).toEqual([]);
  });

  it('offers nothing in values, strings, descriptions, comments and front matter', () => {
    for (const marked of [
      'xychart\n  bar [1, ¦]',
      'xychart\n  x-axis [a, ¦]',
      'xychart\n  title "a ¦b"',
      'xychart\n  accTitle: a ¦b',
      'xychart\n  accDescr {\n    ¦\n  }',
      'xychart\n  %% ¦c\n  bar [1]',
      '---\ntitle: ¦\n---\nxychart\n  bar [1]',
    ]) {
      expect(complete(marked), marked).toEqual([]);
    }
  });

  it('hovers a plot with its colour slot and value count, and a value with its x', () => {
    const chart = 'xychart\n  x-axis [a, b]\n  line [1]\n  bar Sa¦les [1, 2, 3]';
    expect(hover(chart)).toBe(
      '**bar** `Sales` (plot 2)\n\nColour 2 of the plot palette (`xyChart.plotColorPalette`; past its end the colours start over) · 3 values'
    );
    expect(hover('xychart\n  x-axis [a, b]\n  bar [1, ¦2]')).toContain('Value 2: `2` at x `b`');
    expect(hover('xychart\n  x-axis [a]\n  bar [1, ¦2]')).toContain('not drawn');
    expect(hover('xychart\n  line [¦1]')).toContain('**line** (plot 1, unnamed: no legend entry)');
  });

  it('hovers a category with its place, repeats and a later axis', () => {
    expect(hover('xychart\n  x-axis [a, "Q¦1 2024", a]\n  bar [1]')).toBe(
      '**category** `Q1 2024`\n\nCategory 2 of 3 on the x axis'
    );
    expect(hover('xychart\n  x-axis [¦a, b, a]\n  x-axis [c]\n  bar [1]')).toBe(
      '**category** `a`\n\nCategory 1 of 3 on the x axis · written 2 times: the repeats share one band · a later `x-axis` replaces these categories'
    );
  });

  it('hovers keywords with the grammar docs', () => {
    expect(hover('xychart\n  y-¦axis 0 --> 1\n  bar [1]')).toMatch(
      /^\*\*`y-axis`\*\*\n\n`y-axis \[<title>\]/
    );
    expect(hover('xychart\n  ba¦r [1]')).toMatch(/^\*\*`bar`\*\*/);
    expect(hover('xychart\n  bar [1]\n  accDescr {\n    x\n  ¦}')).toContain(
      'accessible description'
    );
  });

  it('accepts a name that reads back bare or quoted, and writes it quoted when bare cannot', () => {
    const { isValidId, renameText } = xyChartLanguage;
    for (const kind of ['category', 'plot']) {
      expect(isValidId('Sales', kind)).toBeUndefined();
      expect(isValidId('Q1 2024', kind)).toBeUndefined();
      expect(isValidId('bar', kind)).toBeUndefined();
      expect(renameText!('Sales', kind)).toBe('Sales');
      expect(renameText!('Q1 2024', kind)).toBe('"Q1 2024"');
      expect(renameText!('a, b', kind)).toBe('"a, b"');
      // A keyword lexes as itself bare (`bar` starts a plot), so it is quoted.
      expect(renameText!('bar', kind)).toBe('"bar"');
      expect(renameText!('x-axis', kind)).toBe('"x-axis"');
    }
    expect(isValidId('')).toBe('A name cannot be empty.');
    expect(isValidId('a\nb')).toBe('A name cannot contain a line break.');
    expect(isValidId('say "hi"')).toBe(
      'A name cannot contain `"`: XY chart strings have no escapes.'
    );
    expect(isValidId(' a')).toBe('A name cannot start or end with a blank: the chart trims it.');
  });
});
