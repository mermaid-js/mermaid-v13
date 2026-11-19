import { describe, expect, it } from 'vitest';
import { parseC4Beta } from './parser.ts';
import { BETA } from './tokens.ts';

const H = 'c4-beta\n';

/**
 * Probe mode (R-LANG-7, D95): what the c4-beta parser would accept at one offset, marked `¦`.
 * The language facet's completion maps these kinds to items.
 */
describe('c4-beta parser: probe', () => {
  const probe = (marked: string) => {
    const at = marked.indexOf('¦');
    return parseC4Beta(marked.slice(0, at) + marked.slice(at + 1), { probe: at }).probe;
  };
  const expected = (marked: string) => probe(marked)?.expected ?? [];

  it('returns a probe only on request', () => {
    expect(parseC4Beta(H).probe).toBeUndefined();
    expect(probe('c4-beta¦')).toMatchObject({ offset: 7 });
  });

  it('expects the header first, then a diagram kind', () => {
    expect(expected('¦')).toEqual([BETA.Header]);
    expect(expected('c4-beta ¦')).toEqual(expect.arrayContaining([BETA.Context, BETA.Dynamic]));
    expect(expected('c4-beta co¦')).toEqual(
      expect.arrayContaining([BETA.Container, BETA.Component])
    );
  });

  it('expects an element kind or a statement word at a line start, an id included', () => {
    for (const marked of [`${H}¦`, `${H}person p "P"\n¦`, `${H}person p "P"\n\n¦\n`]) {
      expect(expected(marked), marked).toEqual(
        expect.arrayContaining([
          BETA.Person,
          BETA.Title,
          BETA.Direction,
          BETA.Legend,
          BETA.Style,
          BETA.Id,
          BETA.Step,
        ])
      );
      expect(expected(marked), marked).not.toContain(BETA.Rbrace);
    }
  });

  it('expects an element kind or the closing brace in a body, and no statement word', () => {
    const inBody = expected(`${H}softwareSystem s "S" {\n  ¦\n}`);
    expect(inBody).toEqual(expect.arrayContaining([BETA.Person, BETA.Container, BETA.Rbrace]));
    expect(inBody).not.toContain(BETA.Title);
    expect(inBody).not.toContain(BETA.Style);
    expect(inBody).not.toContain(BETA.Id);
  });

  it('follows an element along its line', () => {
    expect(expected(`${H}person ¦`)).toEqual([BETA.Id]);
    expect(expected(`${H}person p ¦`)).toEqual([BETA.String]);
    expect(expected(`${H}person p "P" ¦`)).toEqual(
      expect.arrayContaining([BETA.String, BETA.Instances, BETA.Tag, BETA.Lbrace])
    );
    const afterTechnology = expected(`${H}container c "C" "d" "t" ¦`);
    expect(afterTechnology).toEqual(
      expect.arrayContaining([BETA.Instances, BETA.Tag, BETA.Lbrace])
    );
    expect(afterTechnology).not.toContain(BETA.String);
    const afterTag = expected(`${H}container c "C" :::a ¦`);
    expect(afterTag).toEqual(expect.arrayContaining([BETA.Tag, BETA.Lbrace]));
    expect(afterTag).not.toContain(BETA.Instances);
  });

  it('follows a relation along its line', () => {
    expect(expected(`${H}a ¦`)).toEqual(
      expect.arrayContaining([
        BETA.ArrowRight,
        BETA.ArrowLeft,
        BETA.ArrowBoth,
        BETA.ArrowUndirected,
      ])
    );
    expect(expected(`${H}a --> ¦`)).toEqual([BETA.Id]);
    expect(expected(`${H}a --> b ¦`)).toEqual(expect.arrayContaining([BETA.Colon, BETA.Tag]));
    expect(expected(`${H}a --> b : ¦`)).toEqual([BETA.String]);
    expect(expected(`${H}a --> b : "x" ¦`)).toEqual(
      expect.arrayContaining([BETA.String, BETA.Tag])
    );
    expect(expected(`${H}a --> b : "x" "y" ¦`)).toEqual(expect.arrayContaining([BETA.Tag]));
    expect(expected(`${H}2:¦`)).toEqual([BETA.Id]);
    expect(expected(`${H}2¦`)).toEqual(expect.arrayContaining([BETA.Step]));
  });

  it('expects the words of direction, legend and style', () => {
    expect(expected(`${H}direction ¦`)).toEqual([BETA.Tb, BETA.Bt, BETA.Lr, BETA.Rl]);
    expect(expected(`${H}legend ¦`)).toEqual([BETA.On, BETA.Off]);
    expect(expected(`${H}style ¦`)).toEqual([BETA.Id]);
    expect(expected(`${H}style s ¦`)).toEqual([BETA.Id]);
    expect(expected(`${H}style s fill:¦`)).toEqual([BETA.Hex, BETA.ColorFunction, BETA.Id]);
    expect(expected(`${H}style s fill:#fff ¦`)).toEqual(expect.arrayContaining([BETA.Comma]));
    expect(expected(`${H}style s fill:#fff, ¦`)).toEqual([BETA.Id]);
  });

  it('records nothing once the line has failed', () => {
    expect(expected(`${H}person p ?? ¦`)).toEqual([]);
    expect(expected(`${H}person "x" ¦`)).not.toContain(BETA.Instances);
  });

  it('follows an arrow, a colon and a closed text, and extends a word', () => {
    const p = probe(`${H}a -->¦`);
    expect(p?.expected).toEqual([BETA.Id]);
    expect(p?.prefix).toEqual({ start: H.length + 5, end: H.length + 5 });
    expect(probe(`${H}a --> bo¦`)?.prefix).toEqual({ start: H.length + 6, end: H.length + 8 });
    expect(expected(`${H}a --> b : "x"¦`)).toEqual(expect.arrayContaining([BETA.String, BETA.Tag]));
    expect(expected(`${H}a --> b : "x":::t¦`)).toEqual(expect.arrayContaining([BETA.Tag]));
  });

  it('names where the probe is: code, a text in quotes, a statement value or outside code', () => {
    const mode = (marked: string) => probe(marked)?.mode;
    expect(mode('¦')).toBe('INITIAL');
    expect(mode(`${H}per¦`)).toBe('INITIAL');
    expect(mode(`${H}title¦`)).toBe('INITIAL');
    expect(mode(`${H}title Pay¦ments`)).toBe('title');
    expect(mode(`${H}accTitle: x¦`)).toBe('accTitle');
    expect(mode(`${H}accDescr {\n  a¦\n}`)).toBe('accDescr');
    expect(mode(`${H}accDescr {\n  a\n}¦`)).toBe('INITIAL');
    expect(mode(`${H}person p "Us¦er"`)).toBe('string');
    expect(mode(`${H}person p "User¦`)).toBe('string');
    expect(mode(`${H}person p "User"¦`)).toBe('INITIAL');
    expect(mode(`${H}%% c¦`)).toBe('comment');
    expect(mode(`---\ntitle: x¦\n---\n${H}`)).toBe('frontMatter');
  });
});
