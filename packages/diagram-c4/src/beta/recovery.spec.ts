import { describe, expect, it } from 'vitest';
import { parseC4Beta } from './parser.ts';

const parse = (body: string, options = {}) =>
  parseC4Beta(`c4-beta container\n${body}`, options).diagnostics;

/** Names of tokens or grammar rules, which no message shows (R-ERR-5). */
const TOKEN_NAMES = /\b[A-Z][A-Z_]{3,}\b|Newline|Lbrace|Rbrace|ArrowRight|\bEOF\b/;

describe('c4-beta recovery (R-PARSE-4)', () => {
  it('gives N diagnostics for N bad lines, and the good lines between them parse', () => {
    const body = [
      'person a "A"',
      'person "no id"',
      'person b "B" extra',
      'a --> ',
      'softwareSystem s',
      'b --> a',
      'title',
      'a b c',
    ].join('\n');
    const r = parseC4Beta(`c4-beta\n${body}`);
    const errors = r.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(5);
    // `person b "B" extra` fails after the element is read: the element stays.
    expect(r.model.elements.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('shows no token or rule name in any message', () => {
    const sources = [
      'person',
      'person a',
      'person a "A" "b" "c" "d"',
      'a -->',
      '--> a',
      '2:',
      'direction',
      'legend maybe',
      'style a',
      'style a fill',
      'style a fill:',
      '}',
      '{',
      'person a "A" {\n  person b "B"',
      'accDescr { never closed',
      'person a "never closed',
      'person a "A" ;',
      'person a "A" #12',
      'a ---> b',
    ];
    for (const source of sources) {
      const diagnostics = parse(source);
      expect(diagnostics.length, source).toBeGreaterThan(0);
      for (const d of diagnostics) expect(d.message, source).not.toMatch(TOKEN_NAMES);
    }
  });

  it('lets a failed element line that ends in `{` still open its body', () => {
    const d = parse('person "x" {\n  container c "C"\n}\nperson p "P"');
    expect(d.map((x) => x.code)).toEqual(['UNEXPECTED']);
  });

  it('reports a body opened on the next line once, and keeps the elements in it', () => {
    const r = parseC4Beta('c4-beta container\nsoftwareSystem s "S"\n{\n  container c "C"\n}\n');
    expect(r.diagnostics.map((x) => x.code)).toEqual(['UNEXPECTED']);
    expect(r.model.elements.map((e) => e.id)).toEqual(['s', 'c']);
  });

  it('reports each unclosed body at its opener, and a stray `}` once', () => {
    const open = parse('softwareSystem a "A" {\n  softwareSystem b "B" {\n    container c "C"');
    expect(open.map((x) => x.code)).toEqual(['UNCLOSED_BLOCK', 'UNCLOSED_BLOCK']);
    expect(parse('}\nperson p "P"').map((x) => x.code)).toEqual(['UNEXPECTED']);
  });

  it('reports a run of bad characters once, and each separate run', () => {
    const codes = parse('person a "A" ;;;\nperson b "B" ; ;\nperson c "C"').map((x) => x.code);
    expect(codes).toEqual(['UNEXPECTED_CHARACTER', 'UNEXPECTED_CHARACTER', 'UNEXPECTED_CHARACTER']);
  });

  it('names the opening quote of an unclosed text', () => {
    const [d] = parse('person a "A\nperson b "B"');
    expect(d?.code).toBe('UNCLOSED_STRING');
    expect(d?.message).toMatch(/line 2/);
  });

  it('reports a missing header, and parses on', () => {
    const r = parseC4Beta('person a "A"\nperson b "B"\n');
    expect(r.diagnostics.map((x) => x.code)).toEqual(['UNEXPECTED']);
    expect(r.model.elements.map((e) => e.id)).toEqual(['b']);
  });

  it('reports an unknown diagram kind with the kinds there are', () => {
    const [d] = parseC4Beta('c4-beta landscape\n').diagnostics;
    expect(d?.code).toBe('C4BETA_UNKNOWN_DIAGRAM_KIND');
    expect(d?.message).toMatch(/`context`.*`deployment`/);
  });
});

describe('c4-beta limits (R-SEC-5)', () => {
  const elements = (n: number) =>
    Array.from({ length: n }, (_, k) => `person p${k} "P"`).join('\n');

  it('reports a cap on elements, relations and nesting once, at the first over it', () => {
    expect(parse(elements(5), { maxNodes: 3 })).toHaveLength(1);
    const relations = `${elements(2)}\n${'p0 --> p1\n'.repeat(4)}`;
    expect(parse(relations, { maxEdges: 2 })).toHaveLength(1);
    const nested = 'group a "A" {\n  group b "B" {\n    group c "C" {\n    }\n  }\n}';
    expect(parse(nested, { maxDepth: 1 })).toHaveLength(1);
    expect(parse(nested, { maxDepth: 2 })).toEqual([]);
  });
});
