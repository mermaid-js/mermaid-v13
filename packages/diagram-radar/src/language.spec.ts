import { describe, expect, it } from 'vitest';
import { language, radarLanguage } from './language.ts';

/**
 * The radar language facet (#450) at its own seam: completions at a probe parse and hover over
 * a plain parse, as the language service calls them, and `isValidId`. The service-level
 * behaviour (definition, references, rename, folding, semantic tokens) is in the goldens
 * (`packages/language-service/goldens/radar`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = radarLanguage.parse(text, { keepTokens: true, probe: at });
  return radarLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Hover at `¦`, given the token and symbol the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = radarLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  // The service's token: a non-blank one containing the offset, else one ending at it.
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
  return radarLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

const STATEMENTS = [
  'axis',
  'curve',
  'title',
  'accTitle',
  'accDescr',
  'showLegend',
  'ticks',
  'max',
  'min',
  'graticule',
];

describe('radar language facet', () => {
  it('is the radar facet, exported under the fixed name `language`', () => {
    expect(radarLanguage.id).toBe('radar');
    expect(language).toBe(radarLanguage);
    expect(radarLanguage.namespaces).toEqual([['axis'], ['curve']]);
  });

  it('parses with the tokens kept and a category for every token kind it emits', () => {
    const text =
      'radar-beta\n  title Skills\n  axis A["Alpha"], B\n  curve c{A: 1, B: 2} %% c\n  showLegend false\n  accDescr: x\n';
    const result = radarLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => radarLanguage.categories[k])).not.toContain(undefined);
    expect(result.symbols.map((s) => `${s.kind}:${s.role}:${s.name}`)).toEqual([
      'axis:def:A',
      'axis:def:B',
      'axis:ref:A',
      'axis:ref:B',
      'curve:def:c',
    ]);
  });
});

describe('radar isValidId (D357)', () => {
  const ok = (name: string, kind?: string) => radarLanguage.isValidId(name, kind);

  it('accepts what the lexer reads as one name', () => {
    for (const name of ['A', 'speed', 'a-b', 'a_1', '_', 'maxi', 'min-1', 'axisB', 'accTitles']) {
      expect(ok(name), name).toBeUndefined();
      expect(ok(name, 'curve'), name).toBeUndefined();
    }
  });

  it('refuses a keyword, and a name that starts with `circle`, `polygon`, `true`, `false` or `title`', () => {
    expect(ok('max')).toMatch(/^`max` is a keyword/);
    expect(ok('axis')).toMatch(/^`axis` is a keyword/);
    expect(ok('true')).toMatch(/^`true` is a keyword/);
    expect(ok('title')).toMatch(/^`title` is a keyword/);
    expect(ok('accDescr')).toMatch(/^`accDescr` is a keyword/);
    expect(ok('accTitle', 'curve')).toMatch(/^`accTitle` is a keyword/);
    expect(ok('circles')).toMatch(/^`circles` starts with the keyword `circle`/);
    expect(ok('trueish', 'curve')).toMatch(/^`trueish` starts with the keyword `true`/);
    expect(ok('titleX')).toMatch(/^`titleX` starts with the keyword `title`/);
  });

  it('refuses a number, a leading digit and other characters', () => {
    expect(ok('12')).toMatch(/^`12` is a number/);
    expect(ok('1a')).toMatch(/^`1a` starts with a digit/);
    expect(ok('')).toBe('A name cannot be empty.');
    for (const name of ['a b', 'a-', 'é', 'a:b', 'a"', 'a%%b', 'a\nb']) {
      expect(ok(name), name).toMatch(/is not a name: a name is ASCII letters/);
    }
  });
});

describe('radar completions (D95)', () => {
  it('offers `radar-beta` in an empty text', () => {
    expect(complete('¦')).toEqual(['radar-beta']);
    expect(complete('rad¦')).toEqual(['radar-beta']);
    expect(complete('%% c\n\n¦')).toEqual(['radar-beta']);
  });

  it('offers the statements at the start of a line', () => {
    expect(complete('radar-beta\n¦')).toEqual(STATEMENTS);
    expect(complete('radar-beta\n  axis A\n  ¦')).toEqual(STATEMENTS);
    expect(complete('radar-beta\n  axis A\n  curve c{1}\n¦\n  ticks 3')).toEqual(STATEMENTS);
    expect(complete('radar-beta\n  acc¦')).toEqual(['accTitle', 'accDescr']);
    expect(complete('radar-beta\n  m¦')).toEqual(['max', 'min']);
  });

  it('offers no statement after other text on the line', () => {
    expect(complete('radar-beta ¦')).toEqual([]);
    expect(complete('radar-beta\n  axis A ¦')).toEqual([]);
    expect(complete('radar-beta\n  axis A\n  curve c{1} ¦')).toEqual([]);
  });

  it('offers `true` and `false` after `showLegend`, `circle` and `polygon` after `graticule`', () => {
    expect(complete('radar-beta\n  showLegend ¦')).toEqual(['true', 'false']);
    expect(complete('radar-beta\n  showLegend f¦')).toEqual(['false']);
    expect(complete('radar-beta\n  graticule ¦')).toEqual(['circle', 'polygon']);
    expect(complete('radar-beta\n  graticule po¦\n  ticks 3')).toEqual(['polygon']);
  });

  it("offers the declared axis names inside a curve's `{ }`", () => {
    const axes = 'radar-beta\n  axis A["Alpha"], B\n  axis A, C\n';
    expect(complete(`${axes}  curve c{¦}`)).toEqual(['A', 'B', 'C']);
    expect(complete(`${axes}  curve c{A: 1, ¦}`)).toEqual(['A', 'B', 'C']);
    expect(complete(`${axes}  curve c{A: 1, B¦}`)).toEqual(['B']);
    expect(complete(`${axes}  curve c{\n    A: 1,\n    ¦\n  }`)).toEqual(['A', 'B', 'C']);
    // A positional list takes numbers only, and `axis` and `curve` take a new name.
    expect(complete(`${axes}  curve c{1, ¦}`)).toEqual([]);
    expect(complete(`${axes}  curve c{A: ¦}`)).toEqual([]);
    expect(complete(`${axes}  axis ¦`)).toEqual([]);
    expect(complete(`${axes}  curve ¦`)).toEqual([]);
  });

  it('offers nothing in a label, a statement text or outside code', () => {
    expect(complete('radar-beta\n  axis A["Al¦pha"]')).toEqual([]);
    expect(complete('radar-beta\n  axis A["Al¦')).toEqual([]);
    expect(complete('radar-beta\n  title Sk¦')).toEqual([]);
    expect(complete('radar-beta\n  accTitle: ¦')).toEqual([]);
    expect(complete('radar-beta\n  accDescr {\n  a ¦\n  }')).toEqual([]);
    expect(complete('radar-beta\n  %% a ¦comment')).toEqual([]);
    expect(complete('---\ntitle: ¦\n---\nradar-beta')).toEqual([]);
  });

  it('replaces the whole word being typed', () => {
    const text = 'radar-beta\n  titxx';
    const result = radarLanguage.parse(text, { keepTokens: true, probe: 16 });
    const [item] = radarLanguage.completions(result.probe!, { text, result });
    expect(item).toMatchObject({
      label: 'title',
      insertText: 'title ',
      range: { start: 13, end: 18 },
    });
  });

  it('describes an axis name by its label', () => {
    const text = 'radar-beta\n  axis A["Alpha"], B\n  curve c{}';
    const at = text.length - 1;
    const result = radarLanguage.parse(text, { keepTokens: true, probe: at });
    expect(radarLanguage.completions(result.probe!, { text, result })).toMatchObject([
      { label: 'A', kind: 'node', detail: 'axis "Alpha"', insertText: 'A' },
      { label: 'B', kind: 'node', detail: 'axis', insertText: 'B' },
    ]);
  });
});

describe('radar hover (D93)', () => {
  it('shows the keyword docs of the grammar file', () => {
    expect(hover('rad¦ar-beta')).toMatch(
      /^\*\*`radar-beta`\*\*\n\n`radar-beta`: starts a radar chart/
    );
    expect(hover('radar-beta\n  ax¦is A')).toMatch(/^\*\*`axis`\*\*\n\n`axis A\["Label"\], B`/);
    expect(hover('radar-beta\n  showLegend fa¦lse')).toMatch(/the value of `showLegend`/);
    expect(hover('radar-beta\n  graticule ¦polygon')).toMatch(/the value of `graticule`/);
    expect(hover('radar-beta\n  tit¦le Skills')).toMatch(/^\*\*`title`\*\*\n\n`title Skills`/);
    expect(hover('radar-beta\n  title Sk¦ills')).toBeUndefined();
    expect(hover('radar-beta\n  acc¦Title: x')).toMatch(/accessible title/);
    expect(hover('radar-beta\n  acc¦Descr {\n x\n }')).toMatch(/accessible description/);
    expect(hover('radar-beta\n  axis A\n  curve c{1¦}')).toBeUndefined();
  });

  it("shows an axis's label at its definition and at every reference", () => {
    const axes = 'radar-beta\n  axis A["Alpha"], B\n';
    expect(hover(`${axes}  curve c{A¦: 1, B: 2}`)).toBe('**axis** `A`\n\nLabel: `Alpha`');
    expect(hover(`${axes}  curve c{A: 1, ¦B: 2}`)).toBe(
      '**axis** `B`\n\nNo label: the chart shows the name.'
    );
    expect(hover(`radar-beta\n  axis ¦A["Alpha"]`)).toBe('**axis** `A`\n\nLabel: `Alpha`');
  });

  it('says a repeated axis is drawn again, and an entry naming no axis is ignored', () => {
    expect(hover('radar-beta\n  axis A["One"]\n  axis A¦["Two"]')).toBe(
      '**axis** `A`\n\nLabel: `Two`\n\nRepeated: an axis `A` comes first, at line 2. Both are drawn; entries `A: …` give both the same value.'
    );
    expect(hover('radar-beta\n  axis A\n  curve c{A: 1, X¦: 2}')).toBe(
      '**axis** `X`\n\nNo axis is named `X`, so this value is ignored.'
    );
  });
});
