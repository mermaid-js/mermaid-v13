import { describe, expect, it } from 'vitest';
import { blockLanguage, language } from './language.ts';

/**
 * The block language facet (#557) at its own seam: the parse the service reads, completions and
 * hover at a probe parse, and `isValidId`, as the language service calls them. The
 * service-level behaviour (definition, references, rename, folding, semantic tokens) is in the
 * goldens (`packages/language-service/goldens/block`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = blockLanguage.parse(text, { keepTokens: true, probe: at });
  return blockLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** The probe's mode at `¦`. */
function modeAt(marked: string): string {
  const [text, at] = split(marked);
  return blockLanguage.parse(text, { keepTokens: true, probe: at }).probe!.mode;
}

const STATEMENTS = ['columns', 'space', 'block:', 'block', 'classDef', 'class', 'style'];

describe('the block facet', () => {
  it('is exported under the name the service imports', () => {
    expect(language).toBe(blockLanguage);
    expect(language.id).toBe('block');
    expect(language.namespaces).toEqual([['block'], ['class']]);
  });

  it("reports the lexer's start condition as the probe's mode", () => {
    expect(modeAt('block\n  a["x¦"]')).toBe('string');
    expect(modeAt('block\n  a[¦')).toBe('NODE');
    expect(modeAt('block\n  a<["x"]>(¦')).toBe('ARROW_DIR');
    expect(modeAt('block\n  class ¦')).toBe('CLASS');
    expect(modeAt('block\n  a ¦')).toBe('INITIAL');
    expect(modeAt('%% x¦\nblock\n  a')).toBe('comment');
  });

  it('completes the header, then statements, `end` only inside a composite', () => {
    expect(complete('¦')).toEqual(['block', 'block-beta']);
    expect(complete('bl¦')).toEqual(['block', 'block-beta']);
    expect(complete('block\n  ¦')).toEqual(STATEMENTS);
    expect(complete('block\n  block:g\n    a\n    ¦\n  end')).toEqual([
      ...STATEMENTS,
      'end',
      'g',
      'a',
    ]);
    // An empty composite cannot end yet.
    expect(complete('block\n  block:g\n    ¦\n  end')).toEqual([...STATEMENTS, 'g']);
    expect(complete('block\n  a\n  cl¦')).toEqual(['classDef', 'class']);
  });

  it('completes links after a block on its line, ids after a link', () => {
    const links = ['-->', '---', '--x', '--o', '<-->', 'x--x', 'o--o', '==>', '===', '-.->', '-.-'];
    expect(complete('block\n  a ¦')).toEqual(links);
    expect(complete('block\n  a["A"] ¦')).toEqual(links);
    expect(complete('block\n  a -¦')).toEqual(['-->', '---', '--x', '--o', '-.->', '-.-']);
    expect(complete('block\n  a ==¦')).toEqual(['==>', '===']);
    expect(complete('block\n  a <¦')).toEqual(['<-->']);
    expect(complete('block\n  a --> b\n  c --> ¦')).toEqual(['a', 'b', 'c']);
  });

  it("offers an id's shapes at its end once it is used elsewhere", () => {
    const items = complete('block\n  a\n  a --> a¦');
    expect(items[0]).toBe('a');
    expect(items).toContain('a["a"]');
    expect(items).toContain('a{{"a"}}');
    expect(items).toContain('a<["a"]>(right)');
    // A new id is not known yet: no shapes.
    expect(complete('block\n  newId¦')).toEqual([]);
  });

  it("completes a block arrow's directions, class and style targets and classDef names", () => {
    expect(complete('block\n  a<["x"]>(¦)')).toEqual(['right', 'left', 'up', 'down', 'x', 'y']);
    expect(complete('block\n  a<["x"]>(right, d¦)')).toEqual(['down']);
    expect(complete('block\n  a\n  b.c\n  class ¦')).toEqual(['a']);
    expect(complete('block\n  a\n  b\n  style a, ¦')).toEqual(['a', 'b']);
    expect(complete('block\n  a\n  classDef hot fill:#f00\n  class a ¦')).toEqual(['hot']);
    // Nothing in a label or a style definition.
    expect(complete('block\n  a["¦"]')).toEqual([]);
    expect(complete('block\n  a\n  style a fill:¦')).toEqual([]);
  });

  it('takes block ids the id rule reads alone, and classDef names of word characters', () => {
    for (const ok of ['a', 'a.b', 'x;y', 'Ärlig', 'a]b', 'c%d'])
      expect(blockLanguage.isValidId(ok, 'block'), ok).toBeUndefined();
    for (const bad of [
      '',
      'a b',
      'a-b',
      'a:b',
      'a=b',
      'a(b',
      'a{b',
      'a<b',
      'end',
      'space',
      'class',
    ])
      expect(blockLanguage.isValidId(bad, 'block'), bad).toBeTypeOf('string');
    expect(blockLanguage.isValidId('hot_1', 'class')).toBeUndefined();
    for (const bad of ['', 'a.b', 'DEFAULT'])
      expect(blockLanguage.isValidId(bad, 'class'), bad).toBeTypeOf('string');
    expect(blockLanguage.isValidId('a', 'edge')).toBeTypeOf('string');
  });

  it('hovers a block with its shape, span and columns, and a keyword with its doc', () => {
    const text = 'block\n  block:g:2\n    columns 3\n    a{"Choice"}\n  end\n  a --> g';
    const result = blockLanguage.parse(text, { keepTokens: true });
    const hover = (needle: string, delta = 0) => {
      const offset = text.indexOf(needle) + delta;
      const symbol = result.symbols.find((s) => s.range.start <= offset && offset <= s.range.end);
      const j = [...Array(result.tokens!.length).keys()].find(
        (i) => result.tokens!.start[i]! <= offset && offset < result.tokens!.end[i]!
      );
      const token =
        j === undefined
          ? undefined
          : {
              kind: result.tokens!.kind[j]!,
              range: { start: result.tokens!.start[j]!, end: result.tokens!.end[j]! },
            };
      return blockLanguage.hover(
        { offset, ...(token ? { token } : {}), ...(symbol ? { symbol } : {}) },
        { text, result }
      )?.contents;
    };
    expect(hover('g:2', 0)).toBe(
      '**block** `g`\n\nShape: composite, `block:id … end`\n\nSpan: 2 columns\n\nColumns: 3\n\nHolds 1 block'
    );
    expect(hover('"Choice"', 2)).toBe(
      '**block** `a`\n\nShape: diamond, `{"…"}`\n\nLabel: `Choice`\n\nSpan: 1 column\n\nIn `g`'
    );
    expect(hover('columns')).toMatch(/^\*\*`columns 3`\*\*\n\n`columns n` or `columns auto`/);
  });
});
