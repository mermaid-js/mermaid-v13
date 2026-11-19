import { describe, expect, it } from 'vitest';
import { parseC4Beta } from './parser.ts';
import { T } from './tokens.ts';

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
    expect(expected('¦')).toEqual([T.Header]);
    expect(expected('c4-beta ¦')).toEqual(expect.arrayContaining([T.Context, T.Dynamic]));
    expect(expected('c4-beta co¦')).toEqual(expect.arrayContaining([T.Container, T.Component]));
  });

  it('expects an element kind or a statement word at a line start, an id included', () => {
    for (const marked of [`${H}¦`, `${H}person p "P"\n¦`, `${H}person p "P"\n\n¦\n`]) {
      expect(expected(marked), marked).toEqual(
        expect.arrayContaining([T.Person, T.Title, T.Direction, T.Legend, T.Style, T.Id, T.Step])
      );
      expect(expected(marked), marked).not.toContain(T.Rbrace);
    }
  });

  it('expects an element kind or the closing brace in a body, and no statement word', () => {
    const inBody = expected(`${H}softwareSystem s "S" {\n  ¦\n}`);
    expect(inBody).toEqual(expect.arrayContaining([T.Person, T.Container, T.Rbrace]));
    expect(inBody).not.toContain(T.Title);
    expect(inBody).not.toContain(T.Style);
    expect(inBody).not.toContain(T.Id);
  });

  it('follows an element along its line', () => {
    expect(expected(`${H}person ¦`)).toEqual([T.Id]);
    expect(expected(`${H}person p ¦`)).toEqual([T.String]);
    expect(expected(`${H}person p "P" ¦`)).toEqual(
      expect.arrayContaining([T.String, T.Instances, T.Tag, T.Lbrace])
    );
    const afterTechnology = expected(`${H}container c "C" "d" "t" ¦`);
    expect(afterTechnology).toEqual(expect.arrayContaining([T.Instances, T.Tag, T.Lbrace]));
    expect(afterTechnology).not.toContain(T.String);
    const afterTag = expected(`${H}container c "C" :::a ¦`);
    expect(afterTag).toEqual(expect.arrayContaining([T.Tag, T.Lbrace]));
    expect(afterTag).not.toContain(T.Instances);
  });

  it('follows a relation along its line', () => {
    expect(expected(`${H}a ¦`)).toEqual(
      expect.arrayContaining([T.ArrowRight, T.ArrowLeft, T.ArrowBoth, T.ArrowUndirected])
    );
    expect(expected(`${H}a --> ¦`)).toEqual([T.Id]);
    expect(expected(`${H}a --> b ¦`)).toEqual(expect.arrayContaining([T.Colon, T.Tag]));
    expect(expected(`${H}a --> b : ¦`)).toEqual([T.String]);
    expect(expected(`${H}a --> b : "x" ¦`)).toEqual(expect.arrayContaining([T.String, T.Tag]));
    expect(expected(`${H}a --> b : "x" "y" ¦`)).toEqual(expect.arrayContaining([T.Tag]));
    expect(expected(`${H}2:¦`)).toEqual([T.Id]);
    expect(expected(`${H}2¦`)).toEqual(expect.arrayContaining([T.Step]));
  });

  it('expects the words of direction, legend and style', () => {
    expect(expected(`${H}direction ¦`)).toEqual([T.Tb, T.Bt, T.Lr, T.Rl]);
    expect(expected(`${H}legend ¦`)).toEqual([T.On, T.Off]);
    expect(expected(`${H}style ¦`)).toEqual([T.Id]);
    expect(expected(`${H}style s ¦`)).toEqual([T.Id]);
    expect(expected(`${H}style s fill:¦`)).toEqual([T.Hex, T.ColorFunction, T.Id]);
    expect(expected(`${H}style s fill:#fff ¦`)).toEqual(expect.arrayContaining([T.Comma]));
    expect(expected(`${H}style s fill:#fff, ¦`)).toEqual([T.Id]);
  });

  it('records nothing once the line has failed', () => {
    expect(expected(`${H}person p ?? ¦`)).toEqual([]);
    expect(expected(`${H}person "x" ¦`)).not.toContain(T.Instances);
  });

  it('follows an arrow, a colon and a closed text, and extends a word', () => {
    const p = probe(`${H}a -->¦`);
    expect(p?.expected).toEqual([T.Id]);
    expect(p?.prefix).toEqual({ start: H.length + 5, end: H.length + 5 });
    expect(probe(`${H}a --> bo¦`)?.prefix).toEqual({ start: H.length + 6, end: H.length + 8 });
    expect(expected(`${H}a --> b : "x"¦`)).toEqual(expect.arrayContaining([T.String, T.Tag]));
    expect(expected(`${H}a --> b : "x":::t¦`)).toEqual(expect.arrayContaining([T.Tag]));
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
